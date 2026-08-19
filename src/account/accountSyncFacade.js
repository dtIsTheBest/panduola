import { reactive, readonly } from 'vue'
import { AppError, ERROR_CODES, toAppError } from './errors.js'
import {
  GUEST_SPACE_KEY,
  toUserSpaceKey
} from '../data/dataSpaceRepository.js'

export const ACCOUNT_SYNC_FACADE_KEY = Symbol('account-sync-facade')

const SYNC_STATE_KEYS = Object.freeze([
  'status',
  'isDirty',
  'remoteRevision',
  'lastSyncedAt',
  'errorCode',
  'retryAt',
  'pendingMigration',
  'pendingConflict'
])

function cloneSession(session) {
  if (!session) return null
  return Object.freeze({
    userId: session.userId,
    email: session.email,
    expiresAt: session.expiresAt ?? null
  })
}

function createSyncState(status) {
  return {
    status,
    isDirty: false,
    remoteRevision: null,
    lastSyncedAt: null,
    errorCode: null,
    retryAt: null,
    pendingMigration: null,
    pendingConflict: null
  }
}

function assertStore(store) {
  const methods = [
    'init',
    'getSnapshot',
    'waitForPendingWrites',
    'activateDataSpaceFromGuestIfAbsent',
    'activateDataSpace',
    'applySnapshot',
    'saveRecoveryCopy',
    'listRecoveryCopies',
    'restoreRecoveryCopy',
    'getSyncMetadata'
  ]
  for (const method of methods) {
    if (typeof store?.[method] !== 'function') {
      throw new TypeError(`Store 缺少 ${method} 方法`)
    }
  }
}

function assertServices(services) {
  const authMethods = [
    'restoreSession',
    'requestOtp',
    'verifyOtp',
    'signOut',
    'subscribe'
  ]
  const syncMethods = [
    'start',
    'stop',
    'syncNow',
    'resolveFirstLogin',
    'resolveConflict',
    'subscribe'
  ]
  for (const method of authMethods) {
    if (typeof services?.authAdapter?.[method] !== 'function') {
      throw new TypeError(`认证适配器缺少 ${method} 方法`)
    }
  }
  for (const method of syncMethods) {
    if (typeof services?.syncCoordinator?.[method] !== 'function') {
      throw new TypeError(`同步协调器缺少 ${method} 方法`)
    }
  }
  return services
}

export function createAccountSyncFacade({
  store,
  config,
  createServices,
  diagnostics = null
} = {}) {
  assertStore(store)
  if (typeof createServices !== 'function' && config?.isSyncAvailable) {
    throw new TypeError('缺少账号同步服务工厂')
  }

  const isSyncAvailable = config?.isSyncAvailable === true
  const accountState = reactive({
    status: isSyncAvailable ? 'signed-out' : 'disabled',
    session: null,
    initialized: false,
    isBusy: false,
    errorCode: config?.configError?.code ?? null
  })
  const syncState = reactive(createSyncState(
    isSyncAvailable ? 'signed-out' : 'disabled'
  ))

  let initializationPromise = null
  let servicesPromise = null
  let restorePromise = null
  let unsubscribeAuth = null
  let unsubscribeSync = null
  let currentSession = null
  let generation = 0
  let transitionQueue = Promise.resolve()
  let authOperationQueue = Promise.resolve()
  let busyOperations = 0
  let isRestoring = false
  let isVerifying = false
  let isExplicitLogout = false
  let destroyed = false

  function record(level, event, context) {
    try {
      diagnostics?.record?.(level, event, context)
    } catch {
      // Diagnostics must stay outside account and data lifecycle decisions.
    }
  }

  function incrementMetric(name) {
    try {
      diagnostics?.incrementMetric?.(name)
    } catch {
      // Metrics are best effort.
    }
  }

  function setBusy(isStarting) {
    busyOperations = Math.max(0, busyOperations + (isStarting ? 1 : -1))
    accountState.isBusy = busyOperations > 0
  }

  function updateSyncState(nextState) {
    for (const key of SYNC_STATE_KEYS) {
      syncState[key] = nextState?.[key] ?? createSyncState('signed-out')[key]
    }
  }

  function updateAccountState(patch, token) {
    if (token !== undefined && token !== generation) return false
    Object.assign(accountState, patch)
    return true
  }

  function nextGeneration() {
    generation += 1
    return generation
  }

  function isCurrent(token) {
    return token === generation
  }

  function throwIfStale(token) {
    if (isCurrent(token)) return
    const error = new Error('账号切换操作已过期')
    error.name = 'StaleAccountTransitionError'
    throw error
  }

  function assertActiveFacade() {
    if (!destroyed) return
    throw new AppError(
      ERROR_CODES.UNAUTHORIZED,
      '账号同步门面已销毁'
    )
  }

  function enqueueTransition(token, operation) {
    const result = transitionQueue.then(
      () => operation(token),
      () => operation(token)
    )
    transitionQueue = result.catch(() => {})
    return result
  }

  function enqueueAuthOperation(operation) {
    const result = authOperationQueue.then(operation, operation)
    authOperationQueue = result.catch(() => {})
    return result
  }

  function getConfigError() {
    if (config?.configError instanceof AppError) return config.configError
    return new AppError(
      ERROR_CODES.CONFIG_MISSING,
      '云同步未配置，本地功能仍可正常使用'
    )
  }

  function handleAuthEvent(session, event, error) {
    if (event === 'INITIAL_SESSION') return
    if (error) {
      incrementMetric('auth_failure_total')
      record('warn', 'auth.login_failed', { errorCode: error.code })
      if (error.code === ERROR_CODES.SESSION_EXPIRED && currentSession) {
        const token = nextGeneration()
        enqueueTransition(token, switchToGuest)
          .catch(caughtError => settleBackgroundSignOutFailure(
            caughtError,
            token
          ))
      } else {
        accountState.errorCode = error.code
      }
      return
    }
    if (isRestoring || isVerifying || isExplicitLogout) return
    if (session) {
      const safeSession = cloneSession(session)
      if (currentSession?.userId === safeSession.userId) {
        currentSession = safeSession
        accountState.session = safeSession
        return
      }
      const token = nextGeneration()
      enqueueTransition(token, () => activateSession(safeSession, token))
        .then(activated => {
          if (activated) return
          return settleActivationFailure(
            new AppError(
              ERROR_CODES.SESSION_EXPIRED,
              '认证会话在账号切换期间过期'
            ),
            token,
            safeSession
          )
        })
        .catch(error => settleActivationFailure(error, token, safeSession))
      return
    }
    if (event === 'SIGNED_OUT' && currentSession) {
      const token = nextGeneration()
      enqueueTransition(token, switchToGuest)
        .catch(error => settleBackgroundSignOutFailure(error, token))
    }
  }

  function settleBackgroundSignOutFailure(error, token) {
    if (!isCurrent(token)) return
    const appError = toAppError(error, {
      code: ERROR_CODES.LOCAL_STORAGE_FAILED,
      message: '登录状态已失效，但无法切换到游客数据'
    })
    currentSession = null
    updateAccountState({
      status: 'error',
      session: null,
      errorCode: appError.code
    }, token)
    record('error', 'data_space.changed', { errorCode: appError.code })
  }

  function settleActivationFailure(error, token, failedSession) {
    return enqueueAuthOperation(async () => {
      const services = await ensureServices().catch(() => null)
      if (!services) return
      if (!isCurrent(token)) {
        const activeAuthSession = await services.authAdapter.restoreSession()
          .catch(() => null)
        if (activeAuthSession?.userId !== failedSession?.userId) return
        if (
          accountState.status === 'signed-in' &&
          currentSession?.userId === activeAuthSession.userId
        ) return
      }
      const signOutError = await services?.authAdapter.signOut()
        .then(() => null)
        .catch(caughtError => caughtError)
      if (!isCurrent(token)) return
      const appError = toAppError(signOutError ?? error)
      currentSession = null
      updateAccountState({
        status: 'error',
        session: null,
        errorCode: appError.code
      }, token)
      record('error', 'auth.login_failed', { errorCode: appError.code })
    })
  }

  async function cleanupAuthenticatedSession(services) {
    try {
      await services.authAdapter.signOut()
      return null
    } catch (error) {
      return toAppError(error)
    }
  }

  async function bindServices(services) {
    if (destroyed) {
      await services.syncCoordinator.stop()
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        '账号同步门面已销毁'
      )
    }
    unsubscribeSync = services.syncCoordinator.subscribe(updateSyncState)
    unsubscribeAuth = services.authAdapter.subscribe(handleAuthEvent)
    return services
  }

  async function ensureServices() {
    assertActiveFacade()
    if (!isSyncAvailable) throw getConfigError()
    if (servicesPromise) return servicesPromise
    servicesPromise = Promise.resolve()
      .then(createServices)
      .then(assertServices)
      .then(bindServices)
      .catch(error => {
        servicesPromise = null
        throw error
      })
    return servicesPromise
  }

  async function rollbackDataSpace(
    previousSpaceKey,
    services
  ) {
    await services.syncCoordinator.stop()
    await store.activateDataSpace(previousSpaceKey)
  }

  async function activateSession(session, token) {
    if (!isCurrent(token)) return false
    const services = await ensureServices()
    if (!isCurrent(token)) return false
    const safeSession = cloneSession(session)
    const targetSpaceKey = toUserSpaceKey(safeSession.userId)
    if (
      currentSession?.userId === safeSession.userId &&
      store.activeSpaceKey === targetSpaceKey
    ) {
      currentSession = safeSession
      updateAccountState({ session: safeSession, errorCode: null }, token)
      return true
    }

    const previousSpaceKey = store.activeSpaceKey
    updateAccountState({ status: 'switching', errorCode: null }, token)

    try {
      await store.waitForPendingWrites()
      if (!isCurrent(token)) return false
      await services.syncCoordinator.stop()
      throwIfStale(token)

      await store.activateDataSpaceFromGuestIfAbsent(targetSpaceKey)
      throwIfStale(token)
      await services.syncCoordinator.start(safeSession)
      throwIfStale(token)

      currentSession = safeSession
      updateAccountState({
        status: 'signed-in',
        session: safeSession,
        errorCode: null
      }, token)
      record('info', 'auth.login_succeeded', { email: safeSession.email })
      return true
    } catch (error) {
      let rollbackError = null
      try {
        await rollbackDataSpace(previousSpaceKey, services)
      } catch (caughtRollbackError) {
        rollbackError = caughtRollbackError
      }
      if (error?.name === 'StaleAccountTransitionError') {
        if (rollbackError) {
          currentSession = null
          Object.assign(accountState, {
            status: 'error',
            session: null,
            errorCode: rollbackError.code ?? ERROR_CODES.LOCAL_STORAGE_FAILED
          })
          record('error', 'data_space.changed', {
            errorCode: rollbackError.code ?? ERROR_CODES.LOCAL_STORAGE_FAILED
          })
          throw new AppError(
            ERROR_CODES.LOCAL_STORAGE_FAILED,
            '过期账号切换无法恢复原数据空间',
            { cause: rollbackError }
          )
        }
        if (accountState.status === 'switching') {
          currentSession = null
          Object.assign(accountState, {
            status: 'signed-out',
            session: null,
            errorCode: null
          })
        }
        return false
      }
      if (rollbackError) {
        currentSession = null
        updateAccountState({
          status: 'error',
          session: null,
          errorCode: rollbackError.code ?? ERROR_CODES.LOCAL_STORAGE_FAILED
        }, token)
        throw new AppError(
          ERROR_CODES.LOCAL_STORAGE_FAILED,
          '登录失败且无法恢复原数据空间',
          { cause: rollbackError }
        )
      }
      if (isCurrent(token)) {
        currentSession = null
        updateAccountState({
          status: 'signed-out',
          session: null,
          errorCode: error.code ?? ERROR_CODES.LOCAL_STORAGE_FAILED
        }, token)
      }
      throw error
    }
  }

  async function switchToGuest(token) {
    const services = await ensureServices()
    await store.waitForPendingWrites()
    await services.syncCoordinator.stop()
    await store.activateDataSpace(GUEST_SPACE_KEY)
    if (!isCurrent(token)) return false
    currentSession = null
    updateAccountState({
      status: 'signed-out',
      session: null,
      errorCode: null
    }, token)
    return true
  }

  async function restoreSession(token) {
    isRestoring = true
    let session = null
    try {
      const services = await ensureServices()
      session = await services.authAdapter.restoreSession()
      if (!isCurrent(token)) {
        if (session) {
          const signOutError = await services.authAdapter.signOut()
            .then(() => null)
            .catch(error => error)
          if (signOutError && accountState.status !== 'signed-in') {
            const appError = toAppError(signOutError)
            currentSession = null
            Object.assign(accountState, {
              status: 'error',
              session: null,
              errorCode: appError.code
            })
          }
        }
        return
      }
      if (!session) {
        updateAccountState({ status: 'signed-out', errorCode: null }, token)
        return
      }
      const activated = await enqueueTransition(
        token,
        () => activateSession(session, token)
      )
      if (!activated) {
        const cleanupError = await cleanupAuthenticatedSession(services)
        session = null
        if (cleanupError) throw cleanupError
        return
      }
      if (isCurrent(token)) {
        record('info', 'auth.session_restored', { email: session.email })
      }
    } catch (error) {
      if (!isCurrent(token)) return
      let finalError = error
      if (session) {
        const services = await ensureServices().catch(() => null)
        if (services) {
          const cleanupError = await cleanupAuthenticatedSession(services)
          if (cleanupError) finalError = cleanupError
        }
        session = null
      }
      const appError = toAppError(finalError)
      incrementMetric('auth_failure_total')
      updateAccountState({
        status: 'signed-out',
        session: null,
        errorCode: appError.code
      }, token)
      record('warn', 'auth.login_failed', { errorCode: appError.code })
    } finally {
      isRestoring = false
    }
  }

  async function initialize() {
    assertActiveFacade()
    if (initializationPromise) return initializationPromise
    initializationPromise = (async () => {
      await store.init()
      accountState.initialized = true
      if (!isSyncAvailable) {
        accountState.status = 'disabled'
        syncState.status = 'disabled'
        return
      }

      accountState.status = 'restoring'
      restorePromise = enqueueAuthOperation(() => {
        const token = nextGeneration()
        return restoreSession(token)
      })
      restorePromise.catch(() => {})
    })().catch(error => {
      initializationPromise = null
      throw error
    })
    return initializationPromise
  }

  async function requestLoginCode(email) {
    await initialize()
    return enqueueAuthOperation(async () => {
      const token = nextGeneration()
      if (accountState.status === 'restoring') accountState.status = 'signed-out'
      setBusy(true)
      try {
        const services = await ensureServices()
        await services.authAdapter.requestOtp(email)
        if (isCurrent(token)) accountState.errorCode = null
        return isCurrent(token)
      } catch (error) {
        const appError = toAppError(error)
        if (isCurrent(token)) {
          accountState.errorCode = appError.code
          incrementMetric('auth_failure_total')
        }
        throw appError
      } finally {
        setBusy(false)
      }
    })
  }

  async function verifyLoginCode(email, code) {
    await initialize()
    return enqueueAuthOperation(async () => {
      const token = nextGeneration()
      isVerifying = true
      setBusy(true)
      let session = null
      try {
        const services = await ensureServices()
        session = await services.authAdapter.verifyOtp(email, code)
        if (!isCurrent(token)) {
          const cleanupError = await cleanupAuthenticatedSession(services)
          if (cleanupError) {
            currentSession = null
            Object.assign(accountState, {
              status: 'error',
              session: null,
              errorCode: cleanupError.code
            })
            throw cleanupError
          }
          return false
        }
        const activated = await enqueueTransition(
          token,
          () => activateSession(session, token)
        )
        if (!activated) {
          const cleanupError = await cleanupAuthenticatedSession(services)
          session = null
          if (cleanupError) throw cleanupError
        }
        return activated
      } catch (error) {
        let finalError = error
        if (session) {
          const services = await ensureServices().catch(() => null)
          if (services) {
            const cleanupError = await cleanupAuthenticatedSession(services)
            if (cleanupError) finalError = cleanupError
          }
          session = null
        }
        const appError = toAppError(finalError)
        if (isCurrent(token)) {
          accountState.errorCode = appError.code
          incrementMetric('auth_failure_total')
          record('warn', 'auth.login_failed', { errorCode: appError.code })
        }
        throw appError
      } finally {
        isVerifying = false
        setBusy(false)
      }
    })
  }

  async function logout() {
    await initialize()
    return enqueueAuthOperation(async () => {
      const token = nextGeneration()
      const services = await ensureServices()
      const previousSession = currentSession
      let authenticationCleared = false
      isExplicitLogout = true
      setBusy(true)
      try {
        await enqueueTransition(token, async () => {
          await store.waitForPendingWrites()
          await services.syncCoordinator.stop()
          try {
            await services.authAdapter.signOut()
          } catch (error) {
            const remainingSession = await services.authAdapter.restoreSession()
              .catch(() => null)
            if (
              previousSession &&
              remainingSession?.userId === previousSession.userId &&
              isCurrent(token)
            ) {
              await services.syncCoordinator.start(previousSession)
            } else {
              authenticationCleared = true
              currentSession = null
            }
            throw error
          }
          authenticationCleared = true
          currentSession = null
          updateAccountState({
            status: 'switching',
            session: null,
            errorCode: null
          }, token)
          await store.activateDataSpace(GUEST_SPACE_KEY)
          if (!isCurrent(token)) return
          currentSession = null
          updateAccountState({
            status: 'signed-out',
            session: null,
            errorCode: null
          }, token)
          record('info', 'auth.logged_out', {})
        })
      } catch (error) {
        const appError = toAppError(error)
        if (isCurrent(token)) {
          if (authenticationCleared) {
            currentSession = null
            updateAccountState({
              status: 'error',
              session: null,
              errorCode: appError.code
            }, token)
          } else {
            currentSession = previousSession
            updateAccountState({
              status: previousSession ? 'signed-in' : 'signed-out',
              session: previousSession,
              errorCode: appError.code
            }, token)
          }
        }
        throw appError
      } finally {
        isExplicitLogout = false
        setBusy(false)
      }
    })
  }

  async function syncNow() {
    await initialize()
    const services = await ensureServices()
    return services.syncCoordinator.syncNow()
  }

  async function resolveFirstLogin(strategy) {
    const services = await ensureServices()
    return services.syncCoordinator.resolveFirstLogin(strategy)
  }

  async function resolveConflict(strategy) {
    const services = await ensureServices()
    return services.syncCoordinator.resolveConflict(strategy)
  }

  async function listRecoveryCopies() {
    await initialize()
    return store.listRecoveryCopies()
  }

  async function restoreRecoveryCopy(copyId) {
    await initialize()
    const session = currentSession
    if (!session) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        '请先登录再恢复账号数据'
      )
    }
    const expectedSpaceKey = toUserSpaceKey(session.userId)
    return store.restoreRecoveryCopy(copyId, expectedSpaceKey)
  }

  async function exportDiagnosticReport() {
    await initialize()
    const metadata = store.getSyncMetadata()
    const recoveryCopies = await store.listRecoveryCopies()
    const snapshot = store.getSnapshot()
    const payloadBytes = new TextEncoder().encode(
      JSON.stringify(snapshot)
    ).byteLength
    return diagnostics?.exportReport?.({
      syncStatus: syncState.status,
      lastSyncedAt: metadata.lastSyncedAt,
      schemaVersion: snapshot.schemaVersion,
      remoteRevision: metadata.remoteRevision,
      isDirty: metadata.dirty,
      payloadBytes,
      recoveryCopyCount: recoveryCopies.length,
      isSyncConfigured: isSyncAvailable
    }) ?? {
      generatedAt: new Date().toISOString(),
      status: {
        syncStatus: syncState.status,
        remoteRevision: metadata.remoteRevision,
        isDirty: metadata.dirty,
        payloadBytes,
        recoveryCopyCount: recoveryCopies.length,
        isSyncConfigured: isSyncAvailable
      }
    }
  }

  async function destroy() {
    if (destroyed) return
    const pendingServices = servicesPromise
    destroyed = true
    nextGeneration()
    unsubscribeAuth?.()
    unsubscribeSync?.()
    unsubscribeAuth = null
    unsubscribeSync = null
    const services = await pendingServices?.catch(() => null)
    await Promise.allSettled([
      transitionQueue,
      authOperationQueue,
      restorePromise
    ].filter(Boolean))
    await services?.syncCoordinator.stop()
    currentSession = null
  }

  return Object.freeze({
    accountState: readonly(accountState),
    syncState: readonly(syncState),
    isSyncAvailable,
    get pendingMigration() {
      return syncState.pendingMigration
    },
    get pendingConflict() {
      return syncState.pendingConflict
    },
    initialize,
    requestLoginCode,
    verifyLoginCode,
    logout,
    syncNow,
    resolveFirstLogin,
    resolveConflict,
    listRecoveryCopies,
    restoreRecoveryCopy,
    exportDiagnosticReport,
    destroy
  })
}
