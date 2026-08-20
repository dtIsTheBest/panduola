import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAccountSyncFacade } from '../src/account/accountSyncFacade.js'
import { AppError, ERROR_CODES } from '../src/account/errors.js'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const USER_A_SPACE = `user:${USER_A}`
const USER_B_SPACE = `user:${USER_B}`

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function createSnapshot(label) {
  return {
    schemaVersion: 4,
    categories: [{ id: 'c1', name: label, children: [] }],
    links: [],
    growthChildren: [{
      id: 'growth-child-default',
      name: '孩子 1',
      createdAt: 0,
      updatedAt: 0
    }],
    growthRecords: []
  }
}

function createSession(userId, email = 'parent@example.com') {
  return Object.freeze({
    userId,
    email,
    expiresAt: '2026-08-18T12:00:00.000Z'
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

async function waitFor(predicate, message = '等待状态超时') {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return
    await new Promise(resolve => setImmediate(resolve))
  }
  throw new Error(message)
}

function createFakeStore(initialGuest = createSnapshot('guest')) {
  const spaces = new Map([['guest', clone(initialGuest)]])
  const recoveryCopiesBySpace = new Map()
  const calls = []
  let initFailures = 0
  let activationHandler = null
  let activeSpaceKey = 'guest'

  return {
    calls,
    spaces,
    get activeSpaceKey() {
      return activeSpaceKey
    },
    getSnapshot() {
      return clone(spaces.get(activeSpaceKey))
    },
    async init() {
      calls.push('store.init')
      if (initFailures > 0) {
        initFailures -= 1
        throw new AppError(
          ERROR_CODES.LOCAL_STORAGE_FAILED,
          '本地初始化失败'
        )
      }
    },
    async waitForPendingWrites() {
      calls.push('store.wait')
    },
    async activateDataSpaceFromGuestIfAbsent(spaceKey) {
      calls.push(`store.activate-user:${spaceKey}`)
      if (!spaces.has(spaceKey)) {
        const guest = spaces.get('guest')
        if (!guest) {
          throw new AppError(
            ERROR_CODES.LOCAL_DATA_CORRUPTED,
            '游客数据缺失'
          )
        }
        spaces.set(spaceKey, clone(guest))
      }
      await activationHandler?.(spaceKey)
      activeSpaceKey = spaceKey
    },
    async activateDataSpace(spaceKey) {
      calls.push(`store.activate:${spaceKey}`)
      if (!spaces.has(spaceKey)) {
        throw new AppError(
          ERROR_CODES.LOCAL_STORAGE_FAILED,
          `数据空间不存在：${spaceKey}`
        )
      }
      await activationHandler?.(spaceKey)
      activeSpaceKey = spaceKey
    },
    async applySnapshot(snapshot) {
      spaces.set(activeSpaceKey, clone(snapshot))
    },
    async saveRecoveryCopy(snapshot, options) {
      const recoveryCopies = recoveryCopiesBySpace.get(activeSpaceKey) ?? []
      recoveryCopies.push({
        id: `${activeSpaceKey}-recovery-${recoveryCopies.length + 1}`,
        snapshot: clone(snapshot),
        createdAt: '2026-08-19T00:00:00.000Z',
        ...options
      })
      recoveryCopiesBySpace.set(activeSpaceKey, recoveryCopies)
    },
    async listRecoveryCopies() {
      return clone(recoveryCopiesBySpace.get(activeSpaceKey) ?? [])
    },
    async restoreRecoveryCopy(copyId, expectedSpaceKey) {
      if (expectedSpaceKey !== activeSpaceKey) {
        throw new AppError(
          ERROR_CODES.LOCAL_REVISION_CONFLICT,
          '账号空间已变化'
        )
      }
      const recoveryCopies = recoveryCopiesBySpace.get(activeSpaceKey) ?? []
      const copy = recoveryCopies.find(item => item.id === copyId)
      if (!copy) throw new Error('recovery not found')
      spaces.set(activeSpaceKey, clone(copy.snapshot))
      return true
    },
    getSyncMetadata() {
      return {
        remoteRevision: null,
        dirty: false,
        lastSyncedHash: null,
        lastSyncedAt: null
      }
    },
    setGuestSnapshot(snapshot) {
      spaces.set('guest', clone(snapshot))
    },
    setInitFailures(count) {
      initFailures = count
    },
    setActivationHandler(handler) {
      activationHandler = handler
    }
  }
}

function createFakeAuth() {
  const listeners = new Set()
  const calls = []
  let sdkSession = null
  let restoreHandler = async () => sdkSession
  let requestHandler = async () => {}
  let verifyHandler = async (_email, _code) => createSession(USER_A)
  let signOutHandler = async () => {}
  let clearSessionBeforeSignOutError = false

  return {
    calls,
    get sdkSession() {
      return sdkSession
    },
    async restoreSession() {
      calls.push('auth.restore')
      const session = await restoreHandler()
      sdkSession = session
      return session
    },
    async requestOtp(email) {
      calls.push(`auth.request:${email}`)
      return requestHandler(email)
    },
    async verifyOtp(email, code) {
      calls.push(`auth.verify:${email}:${code}`)
      const session = await verifyHandler(email, code)
      sdkSession = session
      return session
    },
    async signOut() {
      calls.push('auth.signout')
      try {
        await signOutHandler()
        sdkSession = null
      } catch (error) {
        if (clearSessionBeforeSignOutError) sdkSession = null
        throw error
      }
    },
    subscribe(listener) {
      calls.push('auth.subscribe')
      listeners.add(listener)
      return () => {
        calls.push('auth.unsubscribe')
        listeners.delete(listener)
      }
    },
    emit(session, event, error) {
      sdkSession = session
      for (const listener of listeners) listener(session, event, error)
    },
    setRestoreHandler(handler) {
      restoreHandler = handler
    },
    setRequestHandler(handler) {
      requestHandler = handler
    },
    setVerifyHandler(handler) {
      verifyHandler = handler
    },
    setSignOutHandler(handler) {
      signOutHandler = handler
    },
    setClearSessionBeforeSignOutError(value) {
      clearSessionBeforeSignOutError = value
    }
  }
}

function createFakeCoordinator() {
  const listeners = new Set()
  const calls = []
  let state = {
    status: 'signed-out',
    isDirty: false,
    remoteRevision: null,
    lastSyncedAt: null,
    errorCode: null,
    retryAt: null,
    pendingMigration: null,
    pendingConflict: null
  }
  let startHandler = async () => {}
  let stopHandler = async () => {}

  function publish(patch) {
    state = { ...state, ...patch }
    for (const listener of listeners) listener(state)
  }

  return {
    calls,
    async start(session) {
      calls.push(`sync.start:${session.userId}`)
      await startHandler(session)
      publish({ status: 'idle' })
    },
    async stop() {
      calls.push('sync.stop')
      await stopHandler()
      publish({ status: 'signed-out' })
    },
    async syncNow() {
      calls.push('sync.now')
      return state
    },
    async resolveFirstLogin(strategy) {
      calls.push(`sync.resolve-first:${strategy}`)
      return state
    },
    async resolveConflict(strategy) {
      calls.push(`sync.resolve-conflict:${strategy}`)
      return state
    },
    subscribe(listener) {
      calls.push('sync.subscribe')
      listeners.add(listener)
      listener(state)
      return () => {
        calls.push('sync.unsubscribe')
        listeners.delete(listener)
      }
    },
    setStartHandler(handler) {
      startHandler = handler
    },
    setStopHandler(handler) {
      stopHandler = handler
    }
  }
}

function createFacade({
  store = createFakeStore(),
  auth = createFakeAuth(),
  coordinator = createFakeCoordinator(),
  isSyncAvailable = true,
  createServices,
  diagnostics = null
} = {}) {
  const facade = createAccountSyncFacade({
    store,
    config: {
      isSyncAvailable,
      configError: isSyncAvailable
        ? null
        : new AppError(ERROR_CODES.CONFIG_MISSING, '未配置')
    },
    createServices: createServices ?? (async () => ({
      authAdapter: auth,
      syncCoordinator: coordinator
    })),
    diagnostics
  })
  return { facade, store, auth, coordinator }
}

test('未配置云同步时只初始化本地 Store', async () => {
  let serviceCreations = 0
  const { facade, store } = createFacade({
    isSyncAvailable: false,
    createServices: async () => {
      serviceCreations += 1
      throw new Error('should not create services')
    }
  })

  await facade.initialize()

  assert.deepEqual(store.calls, ['store.init'])
  assert.equal(serviceCreations, 0)
  assert.equal(facade.accountState.status, 'disabled')
  assert.equal(facade.syncState.status, 'disabled')
})

test('本地初始化不等待 Session 恢复，恢复后激活对应用户空间', async () => {
  const restore = createDeferred()
  const { facade, store, auth, coordinator } = createFacade()
  auth.setRestoreHandler(() => restore.promise)

  await facade.initialize()
  assert.equal(store.activeSpaceKey, 'guest')
  assert.equal(facade.accountState.status, 'restoring')

  restore.resolve(createSession(USER_A))
  await waitFor(() => facade.accountState.status === 'signed-in')
  assert.equal(store.activeSpaceKey, USER_A_SPACE)
  assert.deepEqual(store.spaces.get(USER_A_SPACE), store.spaces.get('guest'))
  assert.ok(coordinator.calls.includes(`sync.start:${USER_A}`))
})

test('慢 restore 与手动 verify 严格串行并最终激活新账号', async () => {
  const restore = createDeferred()
  const { facade, store, auth } = createFacade()
  auth.setRestoreHandler(() => restore.promise)
  auth.setVerifyHandler(async () => createSession(USER_B, 'b@example.com'))
  await facade.initialize()

  const verified = facade.verifyLoginCode('b@example.com', '654321')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(
    auth.calls.some(call => call.startsWith('auth.verify:')),
    false
  )

  restore.resolve(createSession(USER_A, 'a@example.com'))
  await verified
  await waitFor(() => facade.accountState.session?.userId === USER_B)

  assert.equal(auth.sdkSession.userId, USER_B)
  assert.equal(store.activeSpaceKey, USER_B_SPACE)
})

test('本地初始化失败后可重试，Session 恢复失败不影响游客数据', async () => {
  const store = createFakeStore()
  store.setInitFailures(1)
  const auth = createFakeAuth()
  auth.setRestoreHandler(async () => {
    throw new AppError(ERROR_CODES.OFFLINE, '离线', { retryable: true })
  })
  const { facade } = createFacade({ store, auth })

  await assert.rejects(
    facade.initialize(),
    error => error.code === ERROR_CODES.LOCAL_STORAGE_FAILED
  )
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-out')

  assert.equal(store.activeSpaceKey, 'guest')
  assert.equal(facade.accountState.errorCode, ERROR_CODES.OFFLINE)
})

test('OTP 登录使用切换瞬间的最新 guest 数据初始化用户空间', async () => {
  const initial = createSnapshot('initial')
  const latest = createSnapshot('latest')
  const { facade, store, auth } = createFacade({
    store: createFakeStore(initial)
  })
  auth.setRestoreHandler(async () => null)
  auth.setVerifyHandler(async () => createSession(USER_A))
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-out')
  store.setGuestSnapshot(latest)

  await facade.verifyLoginCode('parent@example.com', '123456')

  assert.equal(store.activeSpaceKey, USER_A_SPACE)
  assert.deepEqual(store.spaces.get(USER_A_SPACE), latest)
  assert.equal(facade.accountState.session.userId, USER_A)
})

test('登录空间切换失败时恢复原空间并清理新 Session', async () => {
  const { facade, store, auth } = createFacade()
  auth.setRestoreHandler(async () => null)
  auth.setVerifyHandler(async () => createSession(USER_A))
  store.setActivationHandler(async spaceKey => {
    if (spaceKey === USER_A_SPACE) {
      throw new AppError(
        ERROR_CODES.LOCAL_STORAGE_FAILED,
        '激活失败'
      )
    }
  })
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-out')

  await assert.rejects(
    facade.verifyLoginCode('parent@example.com', '123456'),
    error => error.code === ERROR_CODES.LOCAL_STORAGE_FAILED
  )

  assert.equal(store.activeSpaceKey, 'guest')
  assert.equal(auth.sdkSession, null)
  assert.equal(facade.accountState.status, 'signed-out')
})

test('旧 auth-event 失败补偿不会删除同账号新 verify Session', async () => {
  const firstActivationStarted = createDeferred()
  const releaseFirstActivation = createDeferred()
  let activationCount = 0
  const { facade, store, auth } = createFacade()
  auth.setRestoreHandler(async () => null)
  auth.setVerifyHandler(async () => createSession(USER_A))
  store.setActivationHandler(async spaceKey => {
    if (spaceKey !== USER_A_SPACE) return
    activationCount += 1
    if (activationCount === 1) {
      firstActivationStarted.resolve()
      await releaseFirstActivation.promise
      throw new AppError(
        ERROR_CODES.LOCAL_STORAGE_FAILED,
        '旧 auth-event 激活失败'
      )
    }
  })
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-out')
  auth.setRestoreHandler(async () => auth.sdkSession)

  auth.emit(createSession(USER_A), 'SIGNED_IN')
  await firstActivationStarted.promise
  const verified = facade.verifyLoginCode('parent@example.com', '123456')
  releaseFirstActivation.resolve()
  await verified
  await waitFor(() => facade.accountState.status === 'signed-in')
  await waitFor(() => (
    auth.calls.filter(call => call === 'auth.restore').length >= 2
  ))

  assert.equal(auth.sdkSession.userId, USER_A)
  assert.equal(facade.accountState.session.userId, USER_A)
  assert.equal(auth.calls.filter(call => call === 'auth.signout').length, 0)
  assert.ok(auth.calls.filter(call => call === 'auth.restore').length >= 2)
})

test('logout 按本地写入、停止同步、清 Session、切 guest 的顺序执行', async () => {
  const { facade, store, auth, coordinator } = createFacade()
  auth.setRestoreHandler(async () => null)
  auth.setVerifyHandler(async () => createSession(USER_A))
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-out')
  await facade.verifyLoginCode('parent@example.com', '123456')
  const timeline = []
  const waitForPendingWrites = store.waitForPendingWrites.bind(store)
  const stop = coordinator.stop.bind(coordinator)
  const signOut = auth.signOut.bind(auth)
  const activateDataSpace = store.activateDataSpace.bind(store)
  store.waitForPendingWrites = async () => {
    timeline.push('store.wait')
    return waitForPendingWrites()
  }
  coordinator.stop = async () => {
    timeline.push('sync.stop')
    return stop()
  }
  auth.signOut = async () => {
    timeline.push('auth.signout')
    return signOut()
  }
  store.activateDataSpace = async spaceKey => {
    timeline.push(`store.activate:${spaceKey}`)
    return activateDataSpace(spaceKey)
  }

  await facade.logout()

  assert.equal(store.activeSpaceKey, 'guest')
  assert.equal(facade.accountState.status, 'signed-out')
  assert.deepEqual(timeline, [
    'store.wait',
    'sync.stop',
    'auth.signout',
    'store.activate:guest'
  ])
})

test('后台 SIGNED_OUT 切回 guest，切换失败时清理会话并进入可见 error', async () => {
  const { facade, store, auth, coordinator } = createFacade()
  auth.setRestoreHandler(async () => null)
  auth.setVerifyHandler(async () => createSession(USER_A))
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-out')
  await facade.verifyLoginCode('parent@example.com', '123456')

  auth.emit(null, 'SIGNED_OUT')
  await waitFor(() => facade.accountState.status === 'signed-out')
  assert.equal(store.activeSpaceKey, 'guest')
  assert.ok(coordinator.calls.includes('sync.stop'))

  await facade.verifyLoginCode('parent@example.com', '123456')
  store.setActivationHandler(async spaceKey => {
    if (spaceKey === 'guest') {
      throw new AppError(
        ERROR_CODES.LOCAL_STORAGE_FAILED,
        '游客空间不可用'
      )
    }
  })
  auth.emit(null, 'SIGNED_OUT')
  await waitFor(() => facade.accountState.status === 'error')

  assert.equal(facade.accountState.session, null)
  assert.equal(
    facade.accountState.errorCode,
    ERROR_CODES.LOCAL_STORAGE_FAILED
  )
})

test('signOut 失败时保持原用户空间并重启同步', async () => {
  const { facade, store, auth, coordinator } = createFacade()
  auth.setRestoreHandler(async () => null)
  auth.setVerifyHandler(async () => createSession(USER_A))
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-out')
  await facade.verifyLoginCode('parent@example.com', '123456')
  auth.setRestoreHandler(async () => auth.sdkSession)
  auth.setSignOutHandler(async () => {
    throw new AppError(ERROR_CODES.OFFLINE, '退出失败')
  })

  await assert.rejects(
    facade.logout(),
    error => error.code === ERROR_CODES.OFFLINE
  )

  assert.equal(store.activeSpaceKey, USER_A_SPACE)
  assert.equal(facade.accountState.status, 'signed-in')
  assert.equal(facade.accountState.session.userId, USER_A)
  assert.equal(coordinator.calls.at(-1), `sync.start:${USER_A}`)
})

test('signOut 返回错误但本地 Session 已清除时不重启旧账号同步', async () => {
  const { facade, auth, coordinator } = createFacade()
  auth.setRestoreHandler(async () => null)
  auth.setVerifyHandler(async () => createSession(USER_A))
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-out')
  await facade.verifyLoginCode('parent@example.com', '123456')
  coordinator.calls.length = 0
  auth.setRestoreHandler(async () => auth.sdkSession)
  auth.setClearSessionBeforeSignOutError(true)
  auth.setSignOutHandler(async () => {
    throw new AppError(ERROR_CODES.OFFLINE, '服务端退出失败')
  })

  await assert.rejects(
    facade.logout(),
    error => error.code === ERROR_CODES.OFFLINE
  )

  assert.equal(auth.sdkSession, null)
  assert.equal(facade.accountState.status, 'error')
  assert.equal(facade.accountState.session, null)
  assert.equal(
    coordinator.calls.some(call => call === `sync.start:${USER_A}`),
    false
  )
})

test('从用户 A 切换到 B 失败时只回滚本地 A 空间，不用 B 凭据重启 A 同步', async () => {
  const { facade, store, auth, coordinator } = createFacade()
  auth.setRestoreHandler(async () => null)
  auth.setVerifyHandler(async () => createSession(USER_A))
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-out')
  await facade.verifyLoginCode('a@example.com', '123456')
  coordinator.calls.length = 0
  auth.setVerifyHandler(async () => createSession(USER_B))
  store.setActivationHandler(async spaceKey => {
    if (spaceKey === USER_B_SPACE) {
      throw new AppError(
        ERROR_CODES.LOCAL_STORAGE_FAILED,
        '用户 B 空间激活失败'
      )
    }
  })

  await assert.rejects(
    facade.verifyLoginCode('b@example.com', '654321'),
    error => error.code === ERROR_CODES.LOCAL_STORAGE_FAILED
  )

  assert.equal(store.activeSpaceKey, USER_A_SPACE)
  assert.equal(facade.accountState.status, 'signed-out')
  assert.equal(
    coordinator.calls.some(call => call === `sync.start:${USER_A}`),
    false
  )
})

test('destroy 会阻止延迟服务绑定并停止协调器', async () => {
  const factoryStarted = createDeferred()
  const releaseFactory = createDeferred()
  const store = createFakeStore()
  const auth = createFakeAuth()
  const coordinator = createFakeCoordinator()
  const { facade } = createFacade({
    store,
    auth,
    coordinator,
    createServices: async () => {
      factoryStarted.resolve()
      await releaseFactory.promise
      return { authAdapter: auth, syncCoordinator: coordinator }
    }
  })
  await facade.initialize()
  await factoryStarted.promise

  const destroying = facade.destroy()
  releaseFactory.resolve()
  await destroying

  assert.equal(auth.calls.includes('auth.subscribe'), false)
  assert.ok(coordinator.calls.includes('sync.stop'))
  await assert.rejects(
    facade.syncNow(),
    error => error.code === ERROR_CODES.UNAUTHORIZED
  )
})

test('已有目标账号空间时不依赖 guest 存在', async () => {
  const store = createFakeStore()
  store.spaces.set(USER_A_SPACE, createSnapshot('existing-user'))
  const { facade, auth } = createFacade({ store })
  auth.setRestoreHandler(async () => null)
  auth.setVerifyHandler(async () => createSession(USER_A))
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-out')
  store.spaces.delete('guest')

  await facade.verifyLoginCode('parent@example.com', '123456')

  assert.equal(store.activeSpaceKey, USER_A_SPACE)
  assert.deepEqual(store.spaces.get(USER_A_SPACE), createSnapshot('existing-user'))
})

test('冲突与手动同步操作通过门面转发给协调器', async () => {
  const { facade, auth, coordinator } = createFacade()
  auth.setRestoreHandler(async () => null)
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-out')

  await facade.syncNow()
  await facade.resolveFirstLogin('upload-local')
  await facade.resolveConflict('use-cloud')

  assert.ok(coordinator.calls.includes('sync.now'))
  assert.ok(coordinator.calls.includes('sync.resolve-first:upload-local'))
  assert.ok(coordinator.calls.includes('sync.resolve-conflict:use-cloud'))
})

test('恢复副本按当前登录账号读取和恢复，未登录时拒绝恢复', async () => {
  const { facade, store, auth } = createFacade()
  auth.setRestoreHandler(async () => null)
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-out')

  assert.deepEqual(await facade.listRecoveryCopies(), [])
  await assert.rejects(
    facade.restoreRecoveryCopy('missing'),
    error => error.code === ERROR_CODES.UNAUTHORIZED
  )

  await facade.verifyLoginCode('parent@example.com', '123456')
  await store.saveRecoveryCopy(createSnapshot('可恢复版本'), {
    reason: 'revision-conflict',
    source: 'cloud'
  })
  store.spaces.set(USER_A_SPACE, createSnapshot('当前版本'))

  const copies = await facade.listRecoveryCopies()
  assert.equal(copies.length, 1)
  assert.equal(copies[0].snapshot.categories[0].name, '可恢复版本')
  assert.equal(await facade.restoreRecoveryCopy(copies[0].id), true)
  assert.equal(
    store.spaces.get(USER_A_SPACE).categories[0].name,
    '可恢复版本'
  )

  await facade.logout()
  auth.setVerifyHandler(async () => createSession(USER_B, 'b@example.com'))
  await facade.verifyLoginCode('b@example.com', '654321')
  assert.deepEqual(await facade.listRecoveryCopies(), [])
})

test('诊断导出只传递状态摘要，不包含账号凭据和业务快照', async () => {
  let receivedStatus = null
  const diagnostics = {
    exportReport(status) {
      receivedStatus = clone(status)
      return { generatedAt: '2026-08-19T00:00:00.000Z', status }
    }
  }
  const { facade, auth } = createFacade({ diagnostics })
  auth.setRestoreHandler(async () => createSession(USER_A))
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-in')

  const report = await facade.exportDiagnosticReport()
  const serialized = JSON.stringify(report)

  assert.equal(receivedStatus.syncStatus, 'idle')
  assert.equal(receivedStatus.schemaVersion, 4)
  assert.equal(receivedStatus.recoveryCopyCount, 0)
  assert.equal(receivedStatus.isSyncConfigured, true)
  assert.equal('snapshot' in receivedStatus, false)
  assert.equal('session' in receivedStatus, false)
  assert.equal(serialized.includes('parent@example.com'), false)
  assert.equal(serialized.includes('guest'), false)
})

test('Session 清理失败优先暴露凭据错误', async () => {
  const { facade, store, auth } = createFacade()
  auth.setRestoreHandler(async () => null)
  auth.setVerifyHandler(async () => createSession(USER_B))
  store.setActivationHandler(async spaceKey => {
    if (spaceKey === USER_B_SPACE) {
      throw new AppError(
        ERROR_CODES.LOCAL_STORAGE_FAILED,
        '用户空间失败'
      )
    }
  })
  auth.setSignOutHandler(async () => {
    throw new AppError(
      ERROR_CODES.CREDENTIAL_STORAGE_UNAVAILABLE,
      '凭据删除失败'
    )
  })
  await facade.initialize()
  await waitFor(() => facade.accountState.status === 'signed-out')

  await assert.rejects(
    facade.verifyLoginCode('parent@example.com', '123456'),
    error => error.code === ERROR_CODES.CREDENTIAL_STORAGE_UNAVAILABLE
  )
  assert.equal(
    facade.accountState.errorCode,
    ERROR_CODES.CREDENTIAL_STORAGE_UNAVAILABLE
  )
})
