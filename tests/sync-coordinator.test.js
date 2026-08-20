import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AppError, ERROR_CODES } from '../src/account/errors.js'
import { createCrossTabLock } from '../src/sync/crossTabLock.js'
import { createSyncCoordinator } from '../src/sync/syncCoordinator.js'
import { prepareSnapshot } from '../src/sync/snapshot.js'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const USER_B_ID = '33333333-3333-4333-8333-333333333333'
const DEVICE_ID = '22222222-2222-4222-8222-222222222222'
const UPDATED_AT = '2026-08-18T08:00:00.000Z'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createSnapshot(label) {
  return {
    schemaVersion: 4,
    categories: [{ id: 'c1', name: `分类-${label}`, children: [] }],
    links: [{
      id: 'l1',
      title: `链接-${label}`,
      description: '',
      url: 'https://example.com',
      categoryId: 'c1'
    }],
    growthChildren: [{
      id: 'growth-child-default',
      name: '孩子 1',
      createdAt: 0,
      updatedAt: 0
    }],
    growthRecords: [{
      id: 'g1',
      childId: 'growth-child-default',
      measuredAt: '2026-08-18',
      heightCm: 100 + label.length,
      weightKg: 15 + label.length,
      headCircumferenceCm: null,
      note: '',
      createdAt: 1,
      updatedAt: 1
    }]
  }
}

async function createRemote(snapshot, revision, overrides = {}) {
  const prepared = await prepareSnapshot(snapshot)
  return Object.freeze({
    snapshot: clone(snapshot),
    revision,
    payloadHash: prepared.hash,
    updatedAt: UPDATED_AT,
    updatedByDevice: DEVICE_ID,
    ...overrides
  })
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function waitFor(predicate, message = '等待条件超时') {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return
    await new Promise(resolve => setImmediate(resolve))
  }
  throw new Error(message)
}

class ManualTimers {
  constructor(startTime = 0) {
    this.now = startTime
    this.nextId = 1
    this.tasks = new Map()
  }

  setTimeout(callback, delay) {
    const id = this.nextId
    this.nextId += 1
    this.tasks.set(id, {
      callback,
      dueAt: this.now + delay
    })
    return id
  }

  clearTimeout(id) {
    this.tasks.delete(id)
  }

  async runNext() {
    const next = [...this.tasks.entries()]
      .sort((left, right) => left[1].dueAt - right[1].dueAt)[0]
    if (!next) return false
    const [id, task] = next
    this.tasks.delete(id)
    this.now = task.dueAt
    task.callback()
    return true
  }
}

function createFakeStore(snapshot, metadata = {}) {
  let currentSnapshot = clone(snapshot)
  let syncMetadata = {
    remoteRevision: null,
    dirty: false,
    lastSyncedHash: null,
    lastSyncedAt: null,
    ...metadata
  }
  let localRevision = 1
  let persistedSnapshot = clone(currentSnapshot)
  let persistedMetadata = { ...syncMetadata }
  let persistedRevision = localRevision
  const commitListeners = new Set()
  const externalListeners = new Set()
  const recoveryCopies = []
  const appliedSnapshots = []
  let failRecovery = false
  let reloadResult = true
  let reloadCount = 0
  let reloadHandler = null
  let waitHandler = null
  let waitCount = 0

  function applyPersistedState() {
    if (!reloadResult) return false
    currentSnapshot = clone(persistedSnapshot)
    syncMetadata = { ...persistedMetadata }
    localRevision = persistedRevision
    return true
  }

  return {
    recoveryCopies,
    appliedSnapshots,
    getSnapshot() {
      return clone(currentSnapshot)
    },
    getSyncMetadata() {
      return { ...syncMetadata }
    },
    getLocalRevision() {
      return localRevision
    },
    async updateSyncMetadata(sync, { expectedLocalRevision } = {}) {
      const didSnapshotChange = Number.isSafeInteger(expectedLocalRevision) &&
        expectedLocalRevision !== persistedRevision
      syncMetadata = {
        ...persistedMetadata,
        ...sync,
        dirty: didSnapshotChange ? true : sync.dirty
      }
      persistedMetadata = { ...syncMetadata }
      return {
        metadata: { ...syncMetadata },
        actualLocalRevision: persistedRevision,
        didSnapshotChange
      }
    },
    async waitForPendingWrites() {
      waitCount += 1
      await waitHandler?.(waitCount)
    },
    async applySnapshot(nextSnapshot, source, { sync } = {}) {
      currentSnapshot = clone(nextSnapshot)
      localRevision += 1
      syncMetadata = { ...syncMetadata, ...sync }
      persistedSnapshot = clone(currentSnapshot)
      persistedRevision = localRevision
      persistedMetadata = { ...syncMetadata }
      appliedSnapshots.push({ snapshot: clone(nextSnapshot), source })
    },
    async saveRecoveryCopy(recoverySnapshot, options) {
      if (failRecovery) throw new Error('recovery unavailable')
      recoveryCopies.push({ snapshot: clone(recoverySnapshot), ...options })
    },
    subscribeLocalCommits(listener) {
      commitListeners.add(listener)
      return () => commitListeners.delete(listener)
    },
    async reloadActiveDataSpace() {
      reloadCount += 1
      if (reloadHandler) return reloadHandler(applyPersistedState)
      return applyPersistedState()
    },
    subscribeExternalDataChanges(listener) {
      externalListeners.add(listener)
      return () => externalListeners.delete(listener)
    },
    commit(nextSnapshot) {
      currentSnapshot = clone(nextSnapshot)
      localRevision += 1
      syncMetadata.dirty = true
      persistedSnapshot = clone(currentSnapshot)
      persistedRevision = localRevision
      persistedMetadata = { ...syncMetadata }
      for (const listener of commitListeners) {
        listener({ snapshot: clone(currentSnapshot), source: 'local' })
      }
    },
    emitExternalChange() {
      for (const listener of externalListeners) listener()
    },
    setFailRecovery(value) {
      failRecovery = value
    },
    setReloadResult(value) {
      reloadResult = value
    },
    setReloadHandler(handler) {
      reloadHandler = handler
    },
    setWaitHandler(handler) {
      waitHandler = handler
    },
    setAuthoritative(nextSnapshot, nextMetadata, nextRevision) {
      persistedSnapshot = clone(nextSnapshot)
      persistedMetadata = { ...syncMetadata, ...nextMetadata }
      persistedRevision = nextRevision
    },
    get reloadCount() {
      return reloadCount
    },
    get waitCount() {
      return waitCount
    },
    get commitListenerCount() {
      return commitListeners.size
    }
  }
}

function createFakeCloud(initialRemote = null) {
  let remote = initialRemote
  let activeRequests = 0
  let maxConcurrentRequests = 0
  const calls = []
  let loadHandler = null
  let createHandler = null
  let compareHandler = null

  async function track(operation, handler) {
    calls.push(operation)
    activeRequests += 1
    maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests)
    try {
      return await handler()
    } finally {
      activeRequests -= 1
    }
  }

  const api = {
    calls,
    get remote() {
      return remote
    },
    get maxConcurrentRequests() {
      return maxConcurrentRequests
    },
    setLoadHandler(handler) {
      loadHandler = handler
    },
    setCreateHandler(handler) {
      createHandler = handler
    },
    setCompareHandler(handler) {
      compareHandler = handler
    },
    async load() {
      return track('load', async () => (
        loadHandler ? loadHandler() : remote
      ))
    },
    async create(snapshot) {
      return track('create', async () => {
        if (createHandler) return createHandler(snapshot)
        if (remote) {
          throw new AppError(
            ERROR_CODES.REVISION_CONFLICT,
            '快照已存在'
          )
        }
        remote = await createRemote(snapshot, 1)
        return remote
      })
    },
    async compareAndSwap(expectedRevision, snapshot) {
      return track('cas', async () => {
        if (compareHandler) return compareHandler(expectedRevision, snapshot)
        if (!remote || remote.revision !== expectedRevision) {
          throw new AppError(
            ERROR_CODES.REVISION_CONFLICT,
            '版本已变化'
          )
        }
        remote = await createRemote(snapshot, remote.revision + 1)
        return remote
      })
    },
    setRemote(nextRemote) {
      remote = nextRemote
    }
  }
  return api
}

function createDirectLock() {
  return {
    async runExclusive(_accountKey, operation) {
      return operation()
    }
  }
}

function createQueuedWebLocks() {
  const tails = new Map()
  return {
    request(name, _options, operation) {
      const previous = tails.get(name) ?? Promise.resolve()
      let release
      const occupied = new Promise(resolve => {
        release = resolve
      })
      const tail = previous.then(() => occupied)
      tails.set(name, tail)
      return previous.then(operation).finally(() => {
        release()
        if (tails.get(name) === tail) tails.delete(name)
      })
    }
  }
}

function createCoordinator(store, cloud, overrides = {}) {
  return createSyncCoordinator({
    store,
    cloudRepository: cloud,
    crossTabLock: createDirectLock(),
    debounceMs: 20,
    random: () => 0.5,
    ...overrides
  })
}

test('首次同步创建云端快照并将本地标记为 clean', async () => {
  const snapshot = createSnapshot('首次')
  const store = createFakeStore(snapshot, { dirty: true })
  const cloud = createFakeCloud()
  const coordinator = createCoordinator(store, cloud)

  await coordinator.start({ userId: USER_ID, email: 'p***@example.com' })

  assert.equal(cloud.remote.revision, 1)
  assert.deepEqual(cloud.remote.snapshot, snapshot)
  assert.equal(store.getSyncMetadata().dirty, false)
  assert.equal(coordinator.getState().status, 'idle')
})

test('相同 hash 接受新 revision，clean 远端前进时下载快照', async () => {
  const local = createSnapshot('本地')
  const sameRemote = await createRemote(local, 2)
  const sameHashStore = createFakeStore(local, {
    remoteRevision: 1,
    dirty: false,
    lastSyncedHash: sameRemote.payloadHash
  })
  const sameHashCoordinator = createCoordinator(
    sameHashStore,
    createFakeCloud(sameRemote)
  )

  await sameHashCoordinator.start({ userId: USER_ID })
  assert.equal(sameHashStore.getSyncMetadata().remoteRevision, 2)
  assert.equal(sameHashStore.appliedSnapshots.length, 0)

  const cloudSnapshot = createSnapshot('云端')
  const advancedRemote = await createRemote(cloudSnapshot, 3)
  const localHash = await prepareSnapshot(local)
  const downloadStore = createFakeStore(local, {
    remoteRevision: 2,
    dirty: false,
    lastSyncedHash: localHash.hash
  })
  const downloadCoordinator = createCoordinator(
    downloadStore,
    createFakeCloud(advancedRemote)
  )

  await downloadCoordinator.start({ userId: USER_ID })
  assert.deepEqual(downloadStore.getSnapshot(), cloudSnapshot)
  assert.equal(downloadStore.appliedSnapshots.length, 1)
  assert.equal(downloadCoordinator.getState().status, 'idle')
})

test('dirty 且 revision 未变时 CAS 上传，远端前进时进入 conflict', async () => {
  const base = createSnapshot('基线')
  const baseRemote = await createRemote(base, 1)
  const localEdit = createSnapshot('本地修改')
  const uploadStore = createFakeStore(localEdit, {
    remoteRevision: 1,
    dirty: true,
    lastSyncedHash: baseRemote.payloadHash
  })
  const uploadCloud = createFakeCloud(baseRemote)
  const uploadCoordinator = createCoordinator(uploadStore, uploadCloud)

  await uploadCoordinator.start({ userId: USER_ID })
  assert.equal(uploadCloud.remote.revision, 2)
  assert.deepEqual(uploadCloud.remote.snapshot, localEdit)
  assert.equal(uploadCoordinator.getState().status, 'idle')

  const otherDevice = await createRemote(createSnapshot('其他设备'), 2)
  const conflictStore = createFakeStore(localEdit, {
    remoteRevision: 1,
    dirty: true,
    lastSyncedHash: baseRemote.payloadHash
  })
  const conflictCoordinator = createCoordinator(
    conflictStore,
    createFakeCloud(otherDevice)
  )

  await conflictCoordinator.start({ userId: USER_ID })
  assert.equal(conflictCoordinator.getState().status, 'conflict')
  assert.equal(conflictCoordinator.getState().pendingConflict.revision, 2)
})

test('首次迁移与冲突策略在备份成功后才覆盖对应版本', async () => {
  const local = createSnapshot('首登本地')
  const cloudSnapshot = createSnapshot('首登云端')
  const remote = await createRemote(cloudSnapshot, 1)
  const migrationStore = createFakeStore(local)
  const migrationCloud = createFakeCloud(remote)
  const migrationCoordinator = createCoordinator(migrationStore, migrationCloud)
  await migrationCoordinator.start({ userId: USER_ID })

  assert.equal(migrationCoordinator.getState().pendingMigration.revision, 1)
  await migrationCoordinator.resolveFirstLogin('use-cloud')
  await migrationCoordinator.syncNow()
  assert.deepEqual(migrationStore.getSnapshot(), cloudSnapshot)
  assert.deepEqual(migrationStore.recoveryCopies[0].snapshot, local)
  assert.equal(migrationCoordinator.getState().status, 'idle')

  for (const strategy of ['keep-local', 'keep-both']) {
    const conflictLocal = createSnapshot(`冲突本地-${strategy}`)
    const conflictRemote = await createRemote(
      createSnapshot(`冲突云端-${strategy}`),
      2
    )
    const store = createFakeStore(conflictLocal, {
      remoteRevision: 1,
      dirty: true,
      lastSyncedHash: '0'.repeat(64)
    })
    const cloud = createFakeCloud(conflictRemote)
    const coordinator = createCoordinator(store, cloud)
    await coordinator.start({ userId: USER_ID })

    await coordinator.resolveConflict(strategy)
    assert.deepEqual(cloud.remote.snapshot, conflictLocal)
    assert.deepEqual(store.recoveryCopies[0].snapshot, conflictRemote.snapshot)
    assert.equal(coordinator.getState().status, 'idle')
    await coordinator.stop()
  }
})

test('连续 100 次提交只触发一轮 debounce 上传且云请求单飞', async () => {
  const timers = new ManualTimers()
  const base = createSnapshot('基线')
  const remote = await createRemote(base, 1)
  const store = createFakeStore(base, {
    remoteRevision: 1,
    dirty: false,
    lastSyncedHash: remote.payloadHash
  })
  const cloud = createFakeCloud(remote)
  const coordinator = createCoordinator(store, cloud, {
    debounceMs: 1500,
    now: () => timers.now,
    setTimeoutFn: timers.setTimeout.bind(timers),
    clearTimeoutFn: timers.clearTimeout.bind(timers)
  })
  await coordinator.start({ userId: USER_ID })
  cloud.calls.length = 0

  for (let index = 0; index < 100; index += 1) {
    store.commit(createSnapshot(`编辑-${index}`))
  }
  assert.equal(timers.tasks.size, 1)

  await timers.runNext()
  await coordinator.syncNow()
  assert.equal(cloud.calls.filter(call => call === 'cas').length, 1)
  assert.equal(cloud.maxConcurrentRequests, 1)
  assert.deepEqual(cloud.remote.snapshot, createSnapshot('编辑-99'))
})

test('两个协调器共享账号锁时云请求串行执行', async () => {
  const snapshot = createSnapshot('共享锁')
  const remote = await createRemote(snapshot, 1)
  const cloud = createFakeCloud(remote)
  const firstLoadStarted = createDeferred()
  const releaseFirstLoad = createDeferred()
  let loadCount = 0
  cloud.setLoadHandler(async () => {
    loadCount += 1
    if (loadCount === 1) {
      firstLoadStarted.resolve()
      await releaseFirstLoad.promise
    }
    return cloud.remote
  })
  const webLocks = createQueuedWebLocks()
  const sharedLock = createCrossTabLock({ locks: webLocks, storage: null })
  const metadata = {
    remoteRevision: 1,
    dirty: false,
    lastSyncedHash: remote.payloadHash
  }
  const first = createCoordinator(createFakeStore(snapshot, metadata), cloud, {
    crossTabLock: sharedLock
  })
  const second = createCoordinator(createFakeStore(snapshot, metadata), cloud, {
    crossTabLock: sharedLock
  })

  const firstStart = first.start({ userId: USER_ID })
  await firstLoadStarted.promise
  const secondStart = second.start({ userId: USER_ID })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(loadCount, 1)

  releaseFirstLoad.resolve()
  await Promise.all([firstStart, secondStart])
  assert.equal(loadCount, 2)
  assert.equal(cloud.maxConcurrentRequests, 1)
})

test('并发 start 会等待 pending writes 且只激活最后请求的账号', async () => {
  const snapshot = createSnapshot('生命周期')
  const remote = await createRemote(snapshot, 1)
  const store = createFakeStore(snapshot, {
    remoteRevision: 1,
    dirty: false,
    lastSyncedHash: remote.payloadHash
  })
  const firstWaitStarted = createDeferred()
  const releaseFirstWait = createDeferred()
  store.setWaitHandler(async waitCount => {
    if (waitCount === 1) {
      firstWaitStarted.resolve()
      await releaseFirstWait.promise
    }
  })
  const lockKeys = []
  const coordinator = createCoordinator(store, createFakeCloud(remote), {
    crossTabLock: {
      async runExclusive(accountKey, operation) {
        lockKeys.push(accountKey)
        return operation()
      }
    }
  })

  const firstStart = coordinator.start({ userId: USER_ID })
  await firstWaitStarted.promise
  assert.equal(store.reloadCount, 0)
  const secondStart = coordinator.start({ userId: USER_B_ID })
  releaseFirstWait.resolve()
  await Promise.all([firstStart, secondStart])

  assert.deepEqual(lockKeys, [USER_B_ID])
  assert.equal(store.commitListenerCount, 1)
  await coordinator.stop()
  assert.equal(store.commitListenerCount, 0)
})

test('错过 storage event 时根据实际 localRevision 重载并同步新快照', async () => {
  const oldSnapshot = createSnapshot('旧本地')
  const newSnapshot = createSnapshot('外部新版')
  const remote = await createRemote(oldSnapshot, 1)
  const store = createFakeStore(oldSnapshot, {
    remoteRevision: 1,
    dirty: false,
    lastSyncedHash: remote.payloadHash
  })
  const cloud = createFakeCloud(remote)
  let injectedExternalWrite = false
  cloud.setLoadHandler(async () => {
    if (!injectedExternalWrite) {
      injectedExternalWrite = true
      store.setAuthoritative(newSnapshot, {
        remoteRevision: 1,
        dirty: true,
        lastSyncedHash: remote.payloadHash
      }, 2)
    }
    return cloud.remote
  })
  const coordinator = createCoordinator(store, cloud)

  await coordinator.start({ userId: USER_ID })

  assert.deepEqual(store.getSnapshot(), newSnapshot)
  assert.deepEqual(cloud.remote.snapshot, newSnapshot)
  assert.ok(store.reloadCount >= 2)
  assert.equal(coordinator.getState().status, 'idle')
})

test('处理期间的多次 storage event 会追加重载', async () => {
  const base = createSnapshot('外部基线')
  const remote = await createRemote(base, 1)
  const store = createFakeStore(base, {
    remoteRevision: 1,
    dirty: false,
    lastSyncedHash: remote.payloadHash
  })
  const coordinator = createCoordinator(store, createFakeCloud(remote))
  await coordinator.start({ userId: USER_ID })

  const firstReloadStarted = createDeferred()
  const releaseFirstReload = createDeferred()
  store.setReloadHandler(async applyPersisted => {
    if (store.reloadCount === 2) {
      firstReloadStarted.resolve()
      await releaseFirstReload.promise
    }
    return applyPersisted()
  })
  store.setAuthoritative(createSnapshot('外部-1'), {
    dirty: true,
    remoteRevision: 1
  }, 2)
  store.emitExternalChange()
  await firstReloadStarted.promise
  const latest = createSnapshot('外部-2')
  store.setAuthoritative(latest, {
    dirty: true,
    remoteRevision: 1
  }, 3)
  store.emitExternalChange()
  releaseFirstReload.resolve()

  await waitFor(() => store.reloadCount >= 3)
  assert.deepEqual(store.getSnapshot(), latest)
  await coordinator.stop()
})

test('本地 conflict 可由手动同步重试，启动重载失败不激活会话', async () => {
  const base = createSnapshot('本地冲突基线')
  const remote = await createRemote(base, 1)
  const store = createFakeStore(base, {
    remoteRevision: 1,
    dirty: false,
    lastSyncedHash: remote.payloadHash
  })
  const cloud = createFakeCloud(remote)
  const coordinator = createCoordinator(store, cloud)
  await coordinator.start({ userId: USER_ID })

  store.commit(createSnapshot('本标签修改'))
  store.setAuthoritative(createSnapshot('外部标签修改'), {
    remoteRevision: 1,
    dirty: true,
    lastSyncedHash: remote.payloadHash
  }, 3)
  store.setFailRecovery(true)
  store.emitExternalChange()
  await waitFor(() => coordinator.getState().pendingConflict?.local === true)
  store.setFailRecovery(false)

  await coordinator.syncNow()
  await coordinator.syncNow()
  assert.notEqual(coordinator.getState().pendingConflict?.local, true)
  assert.equal(coordinator.getState().status, 'idle')

  await coordinator.stop()
  const missingStore = createFakeStore(base)
  missingStore.setReloadResult(false)
  const missingCoordinator = createCoordinator(missingStore, createFakeCloud())
  await assert.rejects(
    missingCoordinator.start({ userId: USER_ID }),
    error => error.code === ERROR_CODES.LOCAL_DATA_CORRUPTED
  )
  assert.equal(missingCoordinator.getState().status, 'signed-out')
  await assert.rejects(
    missingCoordinator.syncNow(),
    error => error.code === ERROR_CODES.UNAUTHORIZED
  )
})

test('上传期间的新修改保留 dirty 并自动追加一轮同步', async () => {
  const base = createSnapshot('基线')
  const remote = await createRemote(base, 1)
  const firstEdit = createSnapshot('第一次')
  const secondEdit = createSnapshot('第二次')
  const store = createFakeStore(base, {
    remoteRevision: 1,
    dirty: false,
    lastSyncedHash: remote.payloadHash
  })
  const cloud = createFakeCloud(remote)
  const firstCasStarted = createDeferred()
  const releaseFirstCas = createDeferred()
  let casCount = 0
  cloud.setCompareHandler(async (expectedRevision, snapshot) => {
    casCount += 1
    if (casCount === 1) {
      firstCasStarted.resolve()
      await releaseFirstCas.promise
    }
    if (cloud.remote.revision !== expectedRevision) {
      throw new AppError(
        ERROR_CODES.REVISION_CONFLICT,
        '版本已变化'
      )
    }
    const updated = await createRemote(snapshot, expectedRevision + 1)
    cloud.setRemote(updated)
    return updated
  })
  const coordinator = createCoordinator(store, cloud, { debounceMs: 60_000 })
  await coordinator.start({ userId: USER_ID })

  store.commit(firstEdit)
  const syncing = coordinator.syncNow()
  await firstCasStarted.promise
  store.commit(secondEdit)
  releaseFirstCas.resolve()
  await syncing

  assert.equal(casCount, 2)
  assert.deepEqual(cloud.remote.snapshot, secondEdit)
  assert.equal(coordinator.getState().status, 'idle')
})

test('冲突处理在恢复副本失败时不覆盖本地或云端', async () => {
  for (const strategy of ['keep-local', 'use-cloud', 'keep-both']) {
    const local = createSnapshot(`本地-${strategy}`)
    const remote = await createRemote(createSnapshot(`云端-${strategy}`), 2)
    const store = createFakeStore(local, {
      remoteRevision: 1,
      dirty: true,
      lastSyncedHash: '0'.repeat(64)
    })
    store.setFailRecovery(true)
    const cloud = createFakeCloud(remote)
    const coordinator = createCoordinator(store, cloud)
    await coordinator.start({ userId: USER_ID })

    await assert.rejects(
      coordinator.resolveConflict(strategy),
      error => error.code === ERROR_CODES.RECOVERY_WRITE_FAILED
    )
    assert.deepEqual(store.getSnapshot(), local)
    assert.deepEqual(cloud.remote.snapshot, remote.snapshot)
    assert.equal(coordinator.getState().status, 'conflict')
    await coordinator.stop()
  }
})

test('离线失败按退避重试，stop 后迟到响应不回写状态', async () => {
  const timers = new ManualTimers(Date.parse('2026-08-18T00:00:00Z'))
  const snapshot = createSnapshot('离线')
  const store = createFakeStore(snapshot, { dirty: true })
  const cloud = createFakeCloud()
  let loadCount = 0
  cloud.setLoadHandler(async () => {
    loadCount += 1
    if (loadCount === 1) {
      throw new AppError(ERROR_CODES.OFFLINE, '断网', { retryable: true })
    }
    return cloud.remote
  })
  const coordinator = createCoordinator(store, cloud, {
    now: () => timers.now,
    setTimeoutFn: timers.setTimeout.bind(timers),
    clearTimeoutFn: timers.clearTimeout.bind(timers)
  })

  await coordinator.start({ userId: USER_ID })
  assert.equal(coordinator.getState().status, 'offline')
  assert.equal(timers.tasks.size, 1)
  await timers.runNext()
  await coordinator.syncNow()
  assert.equal(coordinator.getState().status, 'idle')

  const delayed = createDeferred()
  const loadStarted = createDeferred()
  cloud.setLoadHandler(() => {
    loadStarted.resolve()
    return delayed.promise
  })
  store.commit(createSnapshot('迟到'))
  const syncing = coordinator.syncNow()
  await loadStarted.promise
  const stopping = coordinator.stop()
  delayed.resolve(cloud.remote)
  await Promise.allSettled([syncing, stopping])
  assert.equal(coordinator.getState().status, 'signed-out')
  assert.equal(store.getSyncMetadata().dirty, true)
})

test('Web Locks 缺失时可接管过期 lease，清理失败不覆盖成功结果', async () => {
  const values = new Map()
  const lockKey = 'panduola_sync_lock:panduola-sync:account-a'
  values.set(lockKey, JSON.stringify({
    owner: 'old-owner',
    expiresAt: 10
  }))
  let failRemove = false
  const storage = {
    getItem(key) {
      return values.get(key) ?? null
    },
    setItem(key, value) {
      values.set(key, value)
    },
    removeItem(key) {
      if (failRemove) throw new Error('remove unavailable')
      values.delete(key)
    }
  }
  const events = []
  const lock = createCrossTabLock({
    locks: null,
    storage,
    ownerToken: 'new-owner',
    now: () => 100,
    leaseMs: 1000,
    heartbeatMs: 100,
    pollIntervalMs: 1,
    onEvent: event => events.push(event)
  })

  failRemove = true
  const result = await lock.runExclusive('account-a', async () => 'success')

  assert.equal(result, 'success')
  assert.ok(events.includes('web_lock.lease_taken_over'))
})

test('lease 回退会阻止第二 owner 在首个操作释放前进入', async () => {
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  }
  const options = {
    locks: null,
    storage,
    leaseMs: 1000,
    heartbeatMs: 100,
    pollIntervalMs: 1
  }
  const firstLock = createCrossTabLock({ ...options, ownerToken: 'owner-a' })
  const secondLock = createCrossTabLock({ ...options, ownerToken: 'owner-b' })
  const firstEntered = createDeferred()
  const releaseFirst = createDeferred()
  let secondEntered = false

  const first = firstLock.runExclusive('shared-account', async () => {
    firstEntered.resolve()
    await releaseFirst.promise
  })
  await firstEntered.promise
  const second = secondLock.runExclusive('shared-account', async () => {
    secondEntered = true
  })
  await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(secondEntered, false)

  releaseFirst.resolve()
  await Promise.all([first, second])
  assert.equal(secondEntered, true)
})

test('已知云端快照消失时停止自动重建并保留本地数据', async () => {
  const snapshot = createSnapshot('保留')
  const store = createFakeStore(snapshot, {
    remoteRevision: 3,
    dirty: true,
    lastSyncedHash: '0'.repeat(64)
  })
  const cloud = createFakeCloud(null)
  const coordinator = createCoordinator(store, cloud)

  await coordinator.start({ userId: USER_ID })

  assert.equal(coordinator.getState().status, 'error')
  assert.equal(coordinator.getState().errorCode, ERROR_CODES.INVALID_REMOTE_DATA)
  assert.deepEqual(store.getSnapshot(), snapshot)
  assert.equal(cloud.calls.includes('create'), false)
})
