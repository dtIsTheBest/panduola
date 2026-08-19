import { SYNC_DEFAULTS } from '../account/config.js'
import { AppError, ERROR_CODES, toAppError } from '../account/errors.js'
import { createCrossTabLock } from './crossTabLock.js'
import { prepareSnapshot } from './snapshot.js'

const RETRY_DELAYS_MS = Object.freeze([2000, 5000, 15_000, 30_000])
const FIRST_LOGIN_STRATEGIES = new Set(['upload-local', 'use-cloud', 'keep-both'])
const CONFLICT_STRATEGIES = new Set(['keep-local', 'use-cloud', 'keep-both'])

function createInitialState() {
  return Object.freeze({
    status: 'signed-out',
    isDirty: false,
    remoteRevision: null,
    lastSyncedAt: null,
    errorCode: null,
    retryAt: null,
    pendingMigration: null,
    pendingConflict: null
  })
}

function normalizeMetadata(metadata = {}) {
  return {
    remoteRevision: Number.isInteger(metadata.remoteRevision)
      ? metadata.remoteRevision
      : null,
    dirty: metadata.dirty === true,
    lastSyncedHash: typeof metadata.lastSyncedHash === 'string'
      ? metadata.lastSyncedHash
      : null,
    lastSyncedAt: typeof metadata.lastSyncedAt === 'string'
      ? metadata.lastSyncedAt
      : null
  }
}

function toPendingRemote(remote) {
  if (!remote) return null
  return Object.freeze({
    revision: remote.revision,
    updatedAt: remote.updatedAt,
    updatedByDevice: remote.updatedByDevice
  })
}

function createRecoveryError(error) {
  if (error instanceof AppError && error.code === ERROR_CODES.RECOVERY_WRITE_FAILED) {
    return error
  }
  return new AppError(
    ERROR_CODES.RECOVERY_WRITE_FAILED,
    '无法创建恢复副本，已停止覆盖数据',
    { cause: error }
  )
}

function assertSession(session) {
  if (!session || typeof session.userId !== 'string' || !session.userId) {
    throw new TypeError('同步会话缺少 userId')
  }
}

function assertStore(store) {
  const methods = [
    'getSnapshot',
    'getSyncMetadata',
    'getLocalRevision',
    'updateSyncMetadata',
    'waitForPendingWrites',
    'applySnapshot',
    'saveRecoveryCopy',
    'subscribeLocalCommits',
    'reloadActiveDataSpace',
    'subscribeExternalDataChanges'
  ]
  for (const method of methods) {
    if (typeof store?.[method] !== 'function') {
      throw new TypeError(`Store 缺少 ${method} 方法`)
    }
  }
}

function assertCloudRepository(cloudRepository) {
  for (const method of ['load', 'create', 'compareAndSwap']) {
    if (typeof cloudRepository?.[method] !== 'function') {
      throw new TypeError(`云端快照仓库缺少 ${method} 方法`)
    }
  }
}

export function createSyncCoordinator({
  store,
  cloudRepository,
  crossTabLock = createCrossTabLock(),
  diagnostics = null,
  debounceMs = SYNC_DEFAULTS.debounceMs,
  maxRetryDelayMs = SYNC_DEFAULTS.maxRetryDelayMs,
  now = () => Date.now(),
  random = Math.random,
  setTimeoutFn = globalThis.setTimeout.bind(globalThis),
  clearTimeoutFn = globalThis.clearTimeout.bind(globalThis)
} = {}) {
  assertStore(store)
  assertCloudRepository(cloudRepository)
  if (typeof crossTabLock?.runExclusive !== 'function') {
    throw new TypeError('同步锁缺少 runExclusive 方法')
  }
  if (!Number.isSafeInteger(debounceMs) || debounceMs < 0) {
    throw new TypeError('debounceMs 必须是非负整数')
  }
  if (!Number.isSafeInteger(maxRetryDelayMs) || maxRetryDelayMs <= 0) {
    throw new TypeError('maxRetryDelayMs 必须是正整数')
  }

  const listeners = new Set()
  let state = createInitialState()
  let activeSession = null
  let generation = 0
  let localVersion = 0
  let latestSnapshot = null
  let pendingMigrationRemote = null
  let pendingConflictRemote = null
  let pendingLocalConflict = false
  let unsubscribeLocalCommits = null
  let unsubscribeExternalChanges = null
  let externalChangePromise = null
  let externalChangeRequested = false
  let syncPromise = null
  let resolutionPromise = null
  let syncRequested = false
  let debounceTimer = null
  let retryTimer = null
  let retryIndex = 0
  let abortController = null
  let lifecyclePromise = Promise.resolve()
  let lifecycleRequest = 0

  function record(level, event, context) {
    try {
      diagnostics?.record?.(level, event, context)
    } catch {
      // Diagnostics must never change synchronization behavior.
    }
  }

  function incrementMetric(name, amount = 1) {
    try {
      diagnostics?.incrementMetric?.(name, amount)
    } catch {
      // Metrics are best effort and must stay outside the data path.
    }
  }

  function notify() {
    for (const listener of listeners) {
      try {
        listener(state)
      } catch (error) {
        globalThis.reportError?.(error)
      }
    }
  }

  function updateState(patch) {
    state = Object.freeze({ ...state, ...patch })
    notify()
    record('debug', 'sync.state_changed', {
      errorCode: state.errorCode,
      remoteRevision: state.remoteRevision
    })
    return state
  }

  function isCurrent(context) {
    return Boolean(
      activeSession &&
      context.generation === generation &&
      context.userId === activeSession.userId
    )
  }

  function clearDebounceTimer() {
    if (debounceTimer === null) return
    clearTimeoutFn(debounceTimer)
    debounceTimer = null
  }

  function clearRetryTimer() {
    if (retryTimer === null) return
    clearTimeoutFn(retryTimer)
    retryTimer = null
  }

  function clearTimers() {
    clearDebounceTimer()
    clearRetryTimer()
  }

  function getRetryDelay() {
    const index = Math.min(retryIndex, RETRY_DELAYS_MS.length - 1)
    const baseDelay = Math.min(RETRY_DELAYS_MS[index], maxRetryDelayMs)
    const jitterMultiplier = 0.8 + Math.max(0, Math.min(1, random())) * 0.4
    retryIndex += 1
    return Math.max(1, Math.min(
      maxRetryDelayMs,
      Math.round(baseDelay * jitterMultiplier)
    ))
  }

  function scheduleRetry() {
    if (
      !activeSession ||
      pendingMigrationRemote ||
      pendingConflictRemote ||
      pendingLocalConflict
    ) return
    clearRetryTimer()
    const delayMs = getRetryDelay()
    const retryAt = new Date(now() + delayMs).toISOString()
    updateState({ retryAt })
    record('warn', 'sync.retry_scheduled', {})
    retryTimer = setTimeoutFn(() => {
      retryTimer = null
      syncNow().catch(() => {})
    }, delayMs)
  }

  function scheduleDebouncedSync() {
    if (
      !activeSession ||
      pendingMigrationRemote ||
      pendingConflictRemote ||
      pendingLocalConflict
    ) return
    if (syncPromise) {
      syncRequested = true
      return
    }
    clearDebounceTimer()
    debounceTimer = setTimeoutFn(() => {
      debounceTimer = null
      syncNow().catch(() => {})
    }, debounceMs)
  }

  function markDirty(snapshot) {
    if (!activeSession) return
    latestSnapshot = snapshot
    localVersion += 1
    syncRequested = Boolean(syncPromise)
    const status = pendingMigrationRemote || pendingConflictRemote || pendingLocalConflict
      ? 'conflict'
      : 'dirty'
    updateState({
      status,
      isDirty: true,
      errorCode: null,
      retryAt: null
    })
    scheduleDebouncedSync()
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('listener 必须是函数')
    listeners.add(listener)
    try {
      listener(state)
    } catch (error) {
      listeners.delete(listener)
      throw error
    }
    return () => listeners.delete(listener)
  }

  async function persistMetadata(sync, context) {
    const result = await store.updateSyncMetadata(sync, {
      expectedLocalRevision: context.localRevision
    })
    if (!isCurrent(context)) return null
    if (result.didSnapshotChange) {
      await handleExternalDataChange()
      return null
    }
    return normalizeMetadata(result.metadata)
  }

  async function getStableLocalAttempt(context) {
    await store.waitForPendingWrites()
    if (!isCurrent(context)) return null
    const snapshot = latestSnapshot ?? store.getSnapshot()
    const prepared = await prepareSnapshot(snapshot)
    if (!isCurrent(context)) return null
    const metadata = normalizeMetadata(store.getSyncMetadata())
    if (
      metadata.remoteRevision !== null &&
      metadata.lastSyncedHash !== prepared.hash
    ) {
      metadata.dirty = true
    }
    return Object.freeze({
      ...context,
      snapshot,
      localHash: prepared.hash,
      payloadBytes: prepared.byteLength,
      localVersion,
      localRevision: store.getLocalRevision(),
      metadata
    })
  }

  function enterMigration(remote, attempt) {
    pendingMigrationRemote = remote
    pendingConflictRemote = null
    updateState({
      status: 'conflict',
      isDirty: attempt.metadata.dirty || localVersion !== attempt.localVersion,
      remoteRevision: remote.revision,
      pendingMigration: toPendingRemote(remote),
      pendingConflict: null,
      errorCode: null
    })
  }

  function enterConflict(remote) {
    pendingConflictRemote = remote
    pendingMigrationRemote = null
    incrementMetric('sync_conflict_total')
    record('warn', 'sync.conflict', { remoteRevision: remote.revision })
    updateState({
      status: 'conflict',
      isDirty: true,
      remoteRevision: remote.revision,
      pendingMigration: null,
      pendingConflict: toPendingRemote(remote),
      errorCode: ERROR_CODES.REVISION_CONFLICT,
      retryAt: null
    })
  }

  async function acceptRemoteMetadata(remote, attempt) {
    await store.waitForPendingWrites()
    if (!isCurrent(attempt)) return false
    const isDirty = localVersion !== attempt.localVersion
    const metadata = await persistMetadata({
      remoteRevision: remote.revision,
      dirty: isDirty,
      lastSyncedHash: remote.payloadHash,
      lastSyncedAt: remote.updatedAt
    }, attempt)
    if (!metadata) return false
    retryIndex = 0
    if (metadata.dirty) syncRequested = true
    updateState({
      status: metadata.dirty ? 'dirty' : 'idle',
      isDirty: metadata.dirty,
      remoteRevision: metadata.remoteRevision,
      lastSyncedAt: metadata.lastSyncedAt,
      errorCode: null,
      retryAt: null
    })
    return true
  }

  async function commitSuccessfulUpload(remote, attempt) {
    await store.waitForPendingWrites()
    if (!isCurrent(attempt)) return false
    const isDirty = localVersion !== attempt.localVersion
    const metadata = await persistMetadata({
      remoteRevision: remote.revision,
      dirty: isDirty,
      lastSyncedHash: attempt.localHash,
      lastSyncedAt: remote.updatedAt
    }, attempt)
    if (!metadata) return false
    retryIndex = 0
    incrementMetric('sync_success_total')
    incrementMetric('sync_payload_bytes', attempt.payloadBytes)
    record('info', 'sync.uploaded', {
      payloadBytes: attempt.payloadBytes,
      remoteRevision: remote.revision,
      hash: attempt.localHash
    })
    if (metadata.dirty) syncRequested = true
    updateState({
      status: metadata.dirty ? 'dirty' : 'idle',
      isDirty: metadata.dirty,
      remoteRevision: metadata.remoteRevision,
      lastSyncedAt: metadata.lastSyncedAt,
      errorCode: null,
      retryAt: null
    })
    return true
  }

  async function applyRemoteSnapshot(remote, attempt) {
    await store.waitForPendingWrites()
    if (!isCurrent(attempt)) return false
    if (localVersion !== attempt.localVersion) {
      enterConflict(remote)
      return false
    }
    await store.applySnapshot(remote.snapshot, 'cloud', {
      sync: {
        remoteRevision: remote.revision,
        dirty: false,
        lastSyncedHash: remote.payloadHash,
        lastSyncedAt: remote.updatedAt
      }
    })
    if (!isCurrent(attempt)) return false
    latestSnapshot = remote.snapshot
    localVersion += 1
    retryIndex = 0
    updateState({
      status: 'idle',
      isDirty: false,
      remoteRevision: remote.revision,
      lastSyncedAt: remote.updatedAt,
      errorCode: null,
      retryAt: null
    })
    incrementMetric('sync_success_total')
    record('info', 'sync.downloaded', {
      remoteRevision: remote.revision,
      hash: remote.payloadHash
    })
    return true
  }

  async function uploadNewSnapshot(attempt) {
    await store.waitForPendingWrites()
    if (!isCurrent(attempt)) return
    if (localVersion !== attempt.localVersion) {
      syncRequested = true
      return
    }
    const remote = await cloudRepository.create(attempt.snapshot)
    if (!isCurrent(attempt)) return
    await commitSuccessfulUpload(remote, attempt)
  }

  async function uploadChangedSnapshot(attempt) {
    await store.waitForPendingWrites()
    if (!isCurrent(attempt)) return
    if (localVersion !== attempt.localVersion) {
      syncRequested = true
      return
    }
    const remote = await cloudRepository.compareAndSwap(
      attempt.metadata.remoteRevision,
      attempt.snapshot
    )
    if (!isCurrent(attempt)) return
    await commitSuccessfulUpload(remote, attempt)
  }

  async function handleMissingRemote(attempt) {
    if (attempt.metadata.remoteRevision !== null) {
      throw new AppError(
        ERROR_CODES.INVALID_REMOTE_DATA,
        '已同步的云端快照意外消失'
      )
    }
    await uploadNewSnapshot(attempt)
  }

  async function handleKnownRemote(remote, attempt) {
    if (remote.payloadHash === attempt.localHash) {
      await acceptRemoteMetadata(remote, attempt)
      return
    }
    if (attempt.metadata.remoteRevision === null) {
      enterMigration(remote, attempt)
      return
    }
    if (remote.revision < attempt.metadata.remoteRevision) {
      throw new AppError(
        ERROR_CODES.INVALID_REMOTE_DATA,
        '云端快照 revision 低于本地已知版本'
      )
    }
    if (remote.revision > attempt.metadata.remoteRevision) {
      if (attempt.metadata.dirty || localVersion !== attempt.localVersion) {
        enterConflict(remote)
        return
      }
      await applyRemoteSnapshot(remote, attempt)
      return
    }
    if (attempt.metadata.dirty) {
      await uploadChangedSnapshot(attempt)
      return
    }
    enterConflict(remote)
  }

  async function recoverRevisionConflict(context) {
    const remote = await cloudRepository.load()
    if (!isCurrent(context)) return
    if (!remote) {
      throw new AppError(
        ERROR_CODES.INVALID_REMOTE_DATA,
        '冲突后无法读取云端快照'
      )
    }
    const attempt = context.localHash
      ? context
      : await getStableLocalAttempt(context)
    if (!attempt || !isCurrent(context)) return
    if (remote.payloadHash === attempt.localHash) {
      pendingMigrationRemote = null
      pendingConflictRemote = null
      const accepted = await acceptRemoteMetadata(remote, attempt)
      if (accepted) {
        updateState({ pendingMigration: null, pendingConflict: null })
      }
      return
    }
    enterConflict(remote)
  }

  async function runSyncAttempt(context) {
    const attempt = await getStableLocalAttempt(context)
    if (!attempt) return
    incrementMetric('sync_attempt_total')
    updateState({
      status: 'syncing',
      isDirty: attempt.metadata.dirty,
      errorCode: null,
      retryAt: null
    })

    try {
      const remote = await cloudRepository.load()
      if (!isCurrent(attempt)) return
      if (!remote) {
        await handleMissingRemote(attempt)
        return
      }
      await handleKnownRemote(remote, attempt)
    } catch (error) {
      if (error?.code === ERROR_CODES.REVISION_CONFLICT) {
        await recoverRevisionConflict(attempt)
        return
      }
      throw error
    }
  }

  function handleSyncError(error, context) {
    if (!isCurrent(context) || error?.name === 'AbortError') return error
    const appError = toAppError(error)
    const metadata = normalizeMetadata(store.getSyncMetadata())
    const status = appError.retryable || appError.code === ERROR_CODES.OFFLINE
      ? 'offline'
      : 'error'
    incrementMetric('sync_failure_total')
    record('error', 'sync.state_changed', { errorCode: appError.code })
    updateState({
      status,
      isDirty: metadata.dirty,
      remoteRevision: metadata.remoteRevision,
      lastSyncedAt: metadata.lastSyncedAt,
      errorCode: appError.code
    })
    if (appError.retryable) scheduleRetry()
    return appError
  }

  async function runSyncLoop(context) {
    do {
      syncRequested = false
      if (
        !isCurrent(context) ||
        pendingMigrationRemote ||
        pendingConflictRemote ||
        pendingLocalConflict
      ) break
      await runSyncAttempt(context)
    } while (syncRequested)
    return state
  }

  function syncNow() {
    if (!activeSession) {
      return Promise.reject(new AppError(
        ERROR_CODES.UNAUTHORIZED,
        '未登录时无法同步'
      ))
    }
    clearDebounceTimer()
    clearRetryTimer()
    if (pendingLocalConflict) {
      return handleExternalDataChange().then(() => state)
    }
    if (pendingMigrationRemote || pendingConflictRemote) {
      return Promise.resolve(state)
    }
    syncRequested = true
    if (syncPromise) return syncPromise

    const context = Object.freeze({
      generation,
      userId: activeSession.userId
    })
    const currentSyncPromise = crossTabLock.runExclusive(
      activeSession.userId,
      () => runSyncLoop(context),
      { signal: abortController?.signal }
    ).catch(error => {
      throw handleSyncError(error, context)
    }).finally(() => {
      if (syncPromise === currentSyncPromise) syncPromise = null
    })
    syncPromise = currentSyncPromise
    return syncPromise
  }

  async function processExternalDataChange(context) {
    try {
      await store.waitForPendingWrites()
      if (!isCurrent(context)) return
      if (state.isDirty) {
        await saveRecoveryCopy(store.getSnapshot(), {
          reason: 'revision-conflict',
          source: 'local',
          remoteRevision: state.remoteRevision
        })
      }
      const reloaded = await store.reloadActiveDataSpace()
      if (!reloaded) {
        throw new AppError(
          ERROR_CODES.LOCAL_DATA_CORRUPTED,
          '当前本地数据空间已不存在'
        )
      }
      if (!isCurrent(context)) return
      latestSnapshot = store.getSnapshot()
      localVersion += 1
      pendingLocalConflict = false
      const metadata = normalizeMetadata(store.getSyncMetadata())
      const hasRemoteConflict = Boolean(
        pendingMigrationRemote || pendingConflictRemote
      )
      updateState({
        status: hasRemoteConflict
          ? 'conflict'
          : metadata.dirty ? 'dirty' : 'idle',
        isDirty: metadata.dirty,
        remoteRevision: metadata.remoteRevision,
        lastSyncedAt: metadata.lastSyncedAt,
        errorCode: hasRemoteConflict
          ? ERROR_CODES.REVISION_CONFLICT
          : null,
        pendingMigration: pendingMigrationRemote
          ? toPendingRemote(pendingMigrationRemote)
          : null,
        pendingConflict: pendingConflictRemote
          ? toPendingRemote(pendingConflictRemote)
          : null
      })
      syncRequested = !hasRemoteConflict && metadata.dirty
      scheduleImmediateSync()
    } catch (error) {
      if (!isCurrent(context)) return
      const appError = toAppError(error, {
        code: ERROR_CODES.LOCAL_REVISION_CONFLICT,
        message: '无法安全处理其他标签页的数据变化'
      })
      pendingLocalConflict = true
      updateState({
        status: 'conflict',
        isDirty: true,
        errorCode: appError.code,
        pendingConflict: Object.freeze({ local: true })
      })
    }
  }

  function handleExternalDataChange() {
    if (!activeSession) return Promise.resolve()
    externalChangeRequested = true
    if (externalChangePromise) return externalChangePromise
    const context = Object.freeze({ generation, userId: activeSession.userId })
    externalChangePromise = (async () => {
      do {
        externalChangeRequested = false
        await processExternalDataChange(context)
      } while (externalChangeRequested && isCurrent(context))
    })().finally(() => {
      externalChangePromise = null
    })
    return externalChangePromise
  }

  async function startInternal(session, requestId, preemptedOperations) {
    await Promise.allSettled(preemptedOperations)
    if (requestId !== lifecycleRequest) return state
    await store.waitForPendingWrites()
    if (requestId !== lifecycleRequest) return state
    const reloaded = await store.reloadActiveDataSpace()
    if (!reloaded) {
      throw new AppError(
        ERROR_CODES.LOCAL_DATA_CORRUPTED,
        '无法加载当前账号的本地数据空间'
      )
    }
    if (requestId !== lifecycleRequest) return state
    generation += 1
    activeSession = Object.freeze({ ...session })
    abortController = new AbortController()
    latestSnapshot = store.getSnapshot()
    localVersion = 0
    const metadata = normalizeMetadata(store.getSyncMetadata())
    unsubscribeLocalCommits = store.subscribeLocalCommits(event => {
      markDirty(event.snapshot)
    })
    unsubscribeExternalChanges = store.subscribeExternalDataChanges(() => {
      handleExternalDataChange()
    })
    updateState({
      status: 'initializing',
      isDirty: metadata.dirty,
      remoteRevision: metadata.remoteRevision,
      lastSyncedAt: metadata.lastSyncedAt,
      errorCode: null,
      retryAt: null,
      pendingMigration: null,
      pendingConflict: null
    })
    try {
      await syncNow()
    } catch {
      // Startup remains local-first; sync state already contains the actionable error.
    }
    return state
  }

  function invalidateActiveSession() {
    const pendingOperations = [
      syncPromise,
      resolutionPromise,
      externalChangePromise
    ].filter(Boolean)
    generation += 1
    clearTimers()
    abortController?.abort()
    abortController = null
    unsubscribeLocalCommits?.()
    unsubscribeLocalCommits = null
    unsubscribeExternalChanges?.()
    unsubscribeExternalChanges = null
    activeSession = null
    pendingMigrationRemote = null
    pendingConflictRemote = null
    pendingLocalConflict = false
    latestSnapshot = null
    syncRequested = false
    syncPromise = null
    resolutionPromise = null
    externalChangePromise = null
    externalChangeRequested = false
    retryIndex = 0
    state = createInitialState()
    notify()
    return pendingOperations
  }

  async function stopInternal(preemptedOperations = []) {
    const pendingOperations = [
      ...preemptedOperations,
      ...invalidateActiveSession()
    ]
    await Promise.allSettled(pendingOperations)
  }

  function enqueueLifecycle(operation) {
    const result = lifecyclePromise.then(operation, operation)
    lifecyclePromise = result.catch(() => {})
    return result
  }

  function start(session) {
    assertSession(session)
    lifecycleRequest += 1
    const requestId = lifecycleRequest
    const preemptedOperations = invalidateActiveSession()
    return enqueueLifecycle(() => (
      startInternal(session, requestId, preemptedOperations)
    ))
  }

  function stop() {
    lifecycleRequest += 1
    const preemptedOperations = invalidateActiveSession()
    return enqueueLifecycle(() => stopInternal(preemptedOperations))
  }

  async function saveRecoveryCopy(snapshot, options) {
    try {
      await store.saveRecoveryCopy(snapshot, options)
      incrementMetric('recovery_copy_total')
      record('info', 'recovery.copy_created', {
        remoteRevision: options.remoteRevision
      })
    } catch (error) {
      throw createRecoveryError(error)
    }
  }

  async function reloadPendingRemote(expectedRemote, context, enterPending) {
    const remote = await cloudRepository.load()
    if (!isCurrent(context)) return null
    if (!remote) {
      throw new AppError(
        ERROR_CODES.INVALID_REMOTE_DATA,
        '待处理的云端快照已不存在'
      )
    }
    if (
      remote.revision !== expectedRemote.revision ||
      remote.payloadHash !== expectedRemote.payloadHash
    ) {
      enterPending(remote)
      return null
    }
    return remote
  }

  async function applyRemoteWithLocalBackup(
    remote,
    context,
    reason,
    enterPending
  ) {
    await store.waitForPendingWrites()
    if (!isCurrent(context)) return false
    const snapshot = store.getSnapshot()
    const versionBeforeBackup = localVersion
    await saveRecoveryCopy(snapshot, {
      reason,
      source: 'local',
      remoteRevision: normalizeMetadata(store.getSyncMetadata()).remoteRevision
    })
    await store.waitForPendingWrites()
    if (!isCurrent(context)) return false
    if (localVersion !== versionBeforeBackup) {
      updateState({ status: 'conflict', isDirty: true })
      return false
    }
    const confirmedRemote = await cloudRepository.load()
    if (!isCurrent(context)) return false
    if (!confirmedRemote) {
      throw new AppError(
        ERROR_CODES.INVALID_REMOTE_DATA,
        '恢复前云端快照已不存在'
      )
    }
    if (
      confirmedRemote.revision !== remote.revision ||
      confirmedRemote.payloadHash !== remote.payloadHash
    ) {
      enterPending(confirmedRemote)
      return false
    }
    const attempt = {
      ...context,
      localVersion,
      metadata: normalizeMetadata(store.getSyncMetadata())
    }
    const applied = await applyRemoteSnapshot(confirmedRemote, attempt)
    if (applied) syncRequested = true
    return applied
  }

  async function uploadLocalWithRemoteBackup(remote, context, reason) {
    await saveRecoveryCopy(remote.snapshot, {
      reason,
      source: 'cloud',
      remoteRevision: remote.revision
    })
    const attempt = await getStableLocalAttempt(context)
    if (!attempt) return false
    attempt.metadata.remoteRevision = remote.revision
    attempt.metadata.dirty = true
    const uploaded = await cloudRepository.compareAndSwap(
      remote.revision,
      attempt.snapshot
    )
    if (!isCurrent(attempt)) return false
    return commitSuccessfulUpload(uploaded, attempt)
  }

  function scheduleImmediateSync() {
    if (
      !activeSession ||
      pendingMigrationRemote ||
      pendingConflictRemote ||
      pendingLocalConflict
    ) return
    if (!state.isDirty && !syncRequested) return
    clearDebounceTimer()
    debounceTimer = setTimeoutFn(() => {
      debounceTimer = null
      syncNow().catch(() => {})
    }, 0)
  }

  function runResolution(operation) {
    if (resolutionPromise) return resolutionPromise
    if (!activeSession) return Promise.resolve(state)
    const context = Object.freeze({ generation, userId: activeSession.userId })
    const pendingSync = syncPromise
      ? syncPromise.catch(() => {})
      : Promise.resolve()
    const currentResolution = pendingSync.then(() => {
      if (!isCurrent(context)) return state
      return crossTabLock.runExclusive(
        context.userId,
        () => operation(context),
        { signal: abortController?.signal }
      )
    }).finally(() => {
      if (resolutionPromise === currentResolution) resolutionPromise = null
      if (isCurrent(context)) scheduleImmediateSync()
    })
    resolutionPromise = currentResolution
    return currentResolution
  }

  async function performFirstLoginResolution(strategy, context) {
    if (!pendingMigrationRemote) return state
    const enterPending = nextRemote => enterMigration(nextRemote, {
      metadata: normalizeMetadata(store.getSyncMetadata()),
      localVersion
    })
    const remote = await reloadPendingRemote(
      pendingMigrationRemote,
      context,
      enterPending
    )
    if (!remote) return state

    let resolved
    try {
      resolved = strategy === 'use-cloud'
        ? await applyRemoteWithLocalBackup(
            remote,
            context,
            'first-login',
            enterPending
          )
        : await uploadLocalWithRemoteBackup(remote, context, 'first-login')
    } catch (error) {
      if (error?.code !== ERROR_CODES.REVISION_CONFLICT) throw error
      await recoverRevisionConflict(context)
      return state
    }
    if (!resolved) return state
    if (!isCurrent(context)) return state
    pendingMigrationRemote = null
    updateState({ pendingMigration: null })
    record('info', 'migration.resolved', {})
    return state
  }

  async function performConflictResolution(strategy, context) {
    if (!pendingConflictRemote) return state
    const remote = await reloadPendingRemote(
      pendingConflictRemote,
      context,
      enterConflict
    )
    if (!remote) return state

    let resolved
    try {
      resolved = strategy === 'use-cloud'
        ? await applyRemoteWithLocalBackup(
            remote,
            context,
            'revision-conflict',
            enterConflict
          )
        : await uploadLocalWithRemoteBackup(remote, context, 'revision-conflict')
    } catch (error) {
      if (error?.code !== ERROR_CODES.REVISION_CONFLICT) throw error
      await recoverRevisionConflict(context)
      return state
    }
    if (!resolved) return state
    if (!isCurrent(context)) return state
    pendingConflictRemote = null
    updateState({ pendingConflict: null, errorCode: null })
    return state
  }

  function resolveFirstLogin(strategy) {
    if (!FIRST_LOGIN_STRATEGIES.has(strategy)) {
      throw new TypeError('首次登录迁移策略无效')
    }
    if (!activeSession || !pendingMigrationRemote) return Promise.resolve(state)
    return runResolution(context => (
      performFirstLoginResolution(strategy, context)
    ))
  }

  function resolveConflict(strategy) {
    if (!CONFLICT_STRATEGIES.has(strategy)) {
      throw new TypeError('冲突处理策略无效')
    }
    if (!activeSession || !pendingConflictRemote) return Promise.resolve(state)
    return runResolution(context => performConflictResolution(strategy, context))
  }

  return Object.freeze({
    start,
    stop,
    markDirty,
    syncNow,
    resolveFirstLogin,
    resolveConflict,
    subscribe,
    getState: () => state
  })
}
