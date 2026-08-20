import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { createAuthAdapter } from '../src/account/authAdapter.js'
import {
  loadSyncConfig,
  SYNC_DEFAULTS
} from '../src/account/config.js'
import { ERROR_CODES } from '../src/account/errors.js'
import {
  createSupabaseClientProvider
} from '../src/account/supabaseClient.js'
import { validateImportData } from '../src/data/store.js'
import {
  createCloudSnapshotRepository
} from '../src/sync/cloudSnapshotRepository.js'
import {
  prepareReadableSnapshot,
  prepareSnapshot
} from '../src/sync/snapshot.js'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const DEVICE_ID = '22222222-2222-4222-8222-222222222222'
const UPDATED_AT = '2026-07-31T08:00:00.000Z'
const NOW = Date.parse('2026-07-31T07:00:00.000Z')

function createConfig() {
  return loadSyncConfig({
    VITE_SUPABASE_URL: 'https://family.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'a'.repeat(24)}`
  })
}

function createSnapshot(overrides = {}) {
  return validateImportData({
    schemaVersion: 4,
    categories: [{ id: 'c1', name: '育儿', children: [] }],
    links: [{
      id: 'l1',
      title: '家庭链接',
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
    growthRecords: [],
    scheduleItems: [],
    scheduleCompletions: [],
    ...overrides
  })
}

function createRawSession(overrides = {}) {
  return {
    access_token: 'secret-access-token',
    refresh_token: 'secret-refresh-token',
    expires_at: Math.floor(NOW / 1000) + 3600,
    user: {
      id: USER_ID,
      email: 'Parent@Example.com'
    },
    ...overrides
  }
}

function makeBuilder(result, calls, {
  operation,
  neverResolve = false
} = {}) {
  let signal = null
  const builder = {
    select(columns) {
      calls.push(['select', columns])
      return builder
    },
    insert(payload) {
      calls.push(['insert', payload])
      return builder
    },
    abortSignal(nextSignal) {
      signal = nextSignal
      calls.push(['abortSignal'])
      return builder
    },
    maybeSingle() {
      calls.push(['maybeSingle'])
      return settle()
    },
    single() {
      calls.push(['single'])
      return settle()
    },
    then(resolve, reject) {
      return settle().then(resolve, reject)
    }
  }

  function settle() {
    if (!neverResolve) return Promise.resolve(result)
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      }, { once: true })
    })
  }

  calls.push(['builder', operation])
  return builder
}

function createCloudClient({
  loadResult,
  createResult,
  rpcResult,
  neverResolveOperation
} = {}) {
  const calls = []
  return {
    calls,
    client: {
      from(table) {
        calls.push(['from', table])
        const isCreate = calls.some(call => call[0] === 'insert')
        return makeBuilder(
          isCreate ? createResult : loadResult,
          calls,
          {
            operation: 'table',
            neverResolve: neverResolveOperation === 'table'
          }
        )
      },
      rpc(name, args) {
        calls.push(['rpc', name, args])
        return makeBuilder(rpcResult, calls, {
          operation: 'rpc',
          neverResolve: neverResolveOperation === 'rpc'
        })
      }
    }
  }
}

async function createRemoteRow(snapshot, overrides = {}) {
  const { hash } = await prepareSnapshot(snapshot)
  return {
    schema_version: snapshot.schemaVersion,
    payload: snapshot,
    payload_hash: hash,
    revision: 1,
    updated_at: UPDATED_AT,
    updated_by_device: DEVICE_ID,
    ...overrides
  }
}

test('缺失配置不会加载或创建 Supabase Client', async () => {
  let dependencyLoads = 0
  const provider = createSupabaseClientProvider({
    config: loadSyncConfig({ VITE_SYNC_ENABLED: 'false' }),
    loadCreateClient: async () => {
      dependencyLoads += 1
      return () => ({})
    }
  })

  await assert.rejects(
    provider.getClient(),
    error => error.code === ERROR_CODES.CONFIG_MISSING
  )
  assert.equal(dependencyLoads, 0)
})

test('Supabase Client 延迟创建一次并注入安全 Session storage 与请求选项', async () => {
  const calls = []
  const storage = {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {}
  }
  const expectedClient = { auth: {} }
  const provider = createSupabaseClientProvider({
    config: createConfig(),
    storage,
    loadCreateClient: async () => (url, key, options) => {
      calls.push({ url, key, options })
      return expectedClient
    }
  })

  assert.equal(calls.length, 0)
  assert.equal(await provider.getClient(), expectedClient)
  assert.equal(await provider.getClient(), expectedClient)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://family.supabase.co')
  assert.equal(calls[0].options.auth.storage, storage)
  assert.equal(calls[0].options.auth.detectSessionInUrl, false)
  assert.equal(typeof calls[0].options.global.fetch, 'function')
})

test('客户端 deadline 覆盖完整响应体并兼容 204 与普通 JSON 响应', async () => {
  let wrappedFetch
  const provider = createSupabaseClientProvider({
    config: createConfig(),
    requestTimeoutMs: 5,
    fetchImpl: async (_input, init) => ({
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: {},
      arrayBuffer: () => new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      })
    }),
    loadCreateClient: async () => (_url, _key, options) => {
      wrappedFetch = options.global.fetch
      return {}
    }
  })
  await provider.getClient()

  await assert.rejects(
    wrappedFetch('https://family.supabase.co/rest/v1/user_snapshots'),
    error => error.name === 'TimeoutError'
  )

  const nullBodyProvider = createSupabaseClientProvider({
    config: createConfig(),
    fetchImpl: async () => new Response(null, { status: 204 }),
    loadCreateClient: async () => (_url, _key, options) => {
      wrappedFetch = options.global.fetch
      return {}
    }
  })
  await nullBodyProvider.getClient()
  const noContent = await wrappedFetch('https://family.supabase.co/auth/v1/logout', {
    method: 'POST'
  })
  assert.equal(noContent.status, 204)
  assert.equal(noContent.body, null)

  const jsonProvider = createSupabaseClientProvider({
    config: createConfig(),
    fetchImpl: async () => new Response('{"ok":true}', {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }),
    loadCreateClient: async () => (_url, _key, options) => {
      wrappedFetch = options.global.fetch
      return {}
    }
  })
  await jsonProvider.getClient()
  assert.deepEqual(await (await wrappedFetch('https://family.supabase.co')).json(), {
    ok: true
  })
})

test('OTP 使用规范化邮箱、六位 token 和 email 类型且 Session 不暴露 token', async () => {
  const calls = []
  const rawSession = createRawSession()
  const client = {
    auth: {
      async signInWithOtp(payload) {
        calls.push(['request', payload])
        return { data: {}, error: null }
      },
      async verifyOtp(payload) {
        calls.push(['verify', payload])
        return { data: { session: rawSession }, error: null }
      },
      async getSession() {
        return { data: { session: rawSession }, error: null }
      },
      async signOut() {
        calls.push(['signOut'])
        return { error: null }
      }
    }
  }
  const adapter = createAuthAdapter({ client, now: () => NOW })

  await adapter.requestOtp(' Parent@Example.com ')
  const session = await adapter.verifyOtp('Parent@Example.com', ' 123456 ')
  assert.deepEqual(calls[0], ['request', { email: 'parent@example.com' }])
  assert.deepEqual(calls[1], ['verify', {
    email: 'parent@example.com',
    token: '123456',
    type: 'email'
  }])
  assert.deepEqual(session, {
    userId: USER_ID,
    email: 'parent@example.com',
    expiresAt: new Date(rawSession.expires_at * 1000).toISOString()
  })
  assert.equal('access_token' in session, false)
  assert.equal('refresh_token' in session, false)
  assert.deepEqual(await adapter.restoreSession(), session)
  await adapter.signOut()
  assert.deepEqual(calls.at(-1), ['signOut'])
})

test('认证输入与服务错误映射覆盖无效、过期、限流和离线', async () => {
  const createClient = error => ({
    auth: {
      async signInWithOtp() {
        return { error }
      },
      async verifyOtp() {
        return { error }
      }
    }
  })

  await assert.rejects(
    createAuthAdapter({ client: createClient(null) }).requestOtp('bad-email'),
    error => error.code === ERROR_CODES.INVALID_EMAIL
  )
  await assert.rejects(
    createAuthAdapter({ client: createClient(null) })
      .verifyOtp('parent@example.com', '12345'),
    error => error.code === ERROR_CODES.INVALID_OTP
  )
  await assert.rejects(
    createAuthAdapter({
      client: createClient({ status: 400, message: 'OTP expired' })
    }).verifyOtp('parent@example.com', '123456'),
    error => error.code === ERROR_CODES.OTP_EXPIRED && !error.retryable
  )
  await assert.rejects(
    createAuthAdapter({
      client: createClient({ status: 429, message: 'rate limit' })
    }).requestOtp('parent@example.com'),
    error => error.code === ERROR_CODES.OTP_RATE_LIMITED && error.retryable
  )
  await assert.rejects(
    createAuthAdapter({
      client: {
        auth: {
          async signInWithOtp() {
            throw new TypeError('fetch failed')
          }
        }
      }
    }).requestOtp('parent@example.com'),
    error => error.code === ERROR_CODES.OFFLINE && error.retryable
  )
})

test('认证订阅每个事件只通知一次并隔离 listener 与诊断异常', async () => {
  let authCallback
  let unsubscribeCount = 0
  let listenerCalls = 0
  let diagnosticCalls = 0
  const adapter = createAuthAdapter({
    client: {
      auth: {
        onAuthStateChange(callback) {
          authCallback = callback
          return {
            data: {
              subscription: {
                unsubscribe() {
                  unsubscribeCount += 1
                }
              }
            }
          }
        }
      }
    },
    now: () => NOW,
    onListenerError() {
      diagnosticCalls += 1
      throw new Error('diagnostic sink failed')
    }
  })

  const unsubscribe = adapter.subscribe(() => {
    listenerCalls += 1
    throw new Error('listener failed')
  })
  await Promise.resolve()
  assert.doesNotThrow(() => authCallback('INITIAL_SESSION', createRawSession()))
  assert.equal(listenerCalls, 1)
  assert.equal(diagnosticCalls, 1)
  unsubscribe()
  assert.equal(unsubscribeCount, 1)
})

test('云端 load 返回经 Schema、大小和 hash 验证的当前用户快照', async () => {
  const snapshot = createSnapshot()
  const row = await createRemoteRow(snapshot)
  const fake = createCloudClient({ loadResult: { data: row, error: null } })
  const repository = createCloudSnapshotRepository({
    client: fake.client,
    deviceId: DEVICE_ID,
    normalizeSnapshot: validateImportData
  })

  assert.deepEqual(await repository.load(), {
    snapshot,
    revision: 1,
    payloadHash: row.payload_hash,
    updatedAt: UPDATED_AT,
    updatedByDevice: DEVICE_ID
  })
  assert.deepEqual(fake.calls[0], ['from', 'user_snapshots'])
})

test('云端 load 先验证原始 v2 hash 再迁移为 v3', async () => {
  const legacySnapshot = {
    schemaVersion: 2,
    categories: [{ id: 'c1', name: '育儿', children: [] }],
    links: [],
    growthRecords: [{
      id: 'legacy-growth',
      measuredAt: '2026-01-01',
      heightCm: 100,
      weightKg: 15,
      headCircumferenceCm: null,
      note: '',
      createdAt: 1,
      updatedAt: 1
    }]
  }
  const preparedLegacy = await prepareReadableSnapshot(legacySnapshot)
  const goldenCanonical = '{"categories":[{"children":[],"id":"c1","name":"育儿"}],"growthRecords":[{"createdAt":1,"headCircumferenceCm":null,"heightCm":100,"id":"legacy-growth","measuredAt":"2026-01-01","note":"","updatedAt":1,"weightKg":15}],"links":[],"schemaVersion":2}'
  const goldenHash = createHash('sha256').update(goldenCanonical).digest('hex')
  assert.equal(preparedLegacy.canonicalJson, goldenCanonical)
  assert.equal(preparedLegacy.hash, goldenHash)
  const row = {
    schema_version: 2,
    payload: legacySnapshot,
    payload_hash: preparedLegacy.hash,
    revision: 2,
    updated_at: UPDATED_AT,
    updated_by_device: DEVICE_ID
  }
  const fake = createCloudClient({ loadResult: { data: row, error: null } })
  const repository = createCloudSnapshotRepository({
    client: fake.client,
    deviceId: DEVICE_ID,
    normalizeSnapshot: validateImportData
  })

  const remote = await repository.load()
  assert.equal(remote.snapshot.schemaVersion, 4)
  assert.equal(remote.snapshot.growthRecords[0].childId, 'growth-child-default')
  assert.equal(remote.payloadHash, preparedLegacy.hash)
})

test('云端 load 拒绝 hash 正确但未规范化的当前 v3 payload', async () => {
  const snapshot = createSnapshot()
  const rawSnapshot = {
    ...snapshot,
    growthChildren: snapshot.growthChildren.map(child => ({
      ...child,
      name: ` ${child.name} `
    }))
  }
  const prepared = await prepareReadableSnapshot(rawSnapshot)
  const row = {
    schema_version: 4,
    payload: rawSnapshot,
    payload_hash: prepared.hash,
    revision: 1,
    updated_at: UPDATED_AT,
    updated_by_device: DEVICE_ID
  }
  const fake = createCloudClient({ loadResult: { data: row, error: null } })
  const repository = createCloudSnapshotRepository({
    client: fake.client,
    deviceId: DEVICE_ID,
    normalizeSnapshot: validateImportData
  })
  await assert.rejects(repository.load(), error => error.code === ERROR_CODES.INVALID_REMOTE_DATA)
})

test('云端 load 拒绝未来 Schema、元数据不一致、hash 损坏与超限快照', async () => {
  async function assertLoadError(row, code) {
    const fake = createCloudClient({ loadResult: { data: row, error: null } })
    const repository = createCloudSnapshotRepository({
      client: fake.client,
      deviceId: DEVICE_ID,
      normalizeSnapshot: validateImportData
    })
    await assert.rejects(repository.load(), error => error.code === code)
  }

  const snapshot = createSnapshot()
  const validRow = await createRemoteRow(snapshot)
  await assertLoadError({
    ...validRow,
    schema_version: 99,
    payload: { ...snapshot, schemaVersion: 99 }
  }, ERROR_CODES.UNSUPPORTED_SCHEMA)
  await assertLoadError({
    ...validRow,
    schema_version: 1
  }, ERROR_CODES.INVALID_REMOTE_DATA)
  await assertLoadError({
    ...validRow,
    payload_hash: '0'.repeat(64)
  }, ERROR_CODES.REMOTE_DATA_CORRUPTED)

  const oversized = createSnapshot({
    links: [{
      ...snapshot.links[0],
      description: '亲'.repeat(SYNC_DEFAULTS.maxSnapshotBytes)
    }]
  })
  await assertLoadError({
    ...validRow,
    payload: oversized,
    payload_hash: 'a'.repeat(64)
  }, ERROR_CODES.SNAPSHOT_TOO_LARGE)
})

test('云端 create 不接受 userId 且仅回读元数据', async () => {
  const snapshot = createSnapshot()
  const { hash } = await prepareSnapshot(snapshot)
  const result = {
    data: {
      schema_version: 4,
      payload_hash: hash,
      revision: 1,
      updated_at: UPDATED_AT,
      updated_by_device: DEVICE_ID
    },
    error: null
  }
  const calls = []
  const builder = makeBuilder(result, calls)
  const client = {
    from(table) {
      calls.push(['from', table])
      return builder
    }
  }
  const repository = createCloudSnapshotRepository({
    client,
    deviceId: DEVICE_ID,
    normalizeSnapshot: validateImportData
  })

  const remote = await repository.create(snapshot)
  const insertPayload = calls.find(call => call[0] === 'insert')[1]
  const selectColumns = calls.find(call => call[0] === 'select')[1]
  assert.equal('user_id' in insertPayload, false)
  assert.equal(selectColumns.includes('payload,'), false)
  assert.equal(remote.payloadHash, hash)
  assert.deepEqual(remote.snapshot, snapshot)
})

test('云端 create 将创建竞态映射为 REVISION_CONFLICT', async () => {
  const calls = []
  const builder = makeBuilder({
    data: null,
    error: { status: 409, code: '23505', message: 'duplicate key' }
  }, calls)
  const repository = createCloudSnapshotRepository({
    client: { from: () => builder },
    deviceId: DEVICE_ID,
    normalizeSnapshot: validateImportData
  })

  await assert.rejects(
    repository.create(createSnapshot()),
    error => error.code === ERROR_CODES.REVISION_CONFLICT && !error.retryable
  )
})

test('云仓库将 RLS 权限错误映射为不可重试的 UNAUTHORIZED', async () => {
  const fake = createCloudClient({
    loadResult: {
      data: null,
      error: {
        status: 403,
        code: '42501',
        message: 'permission denied by row-level security policy'
      }
    }
  })
  const repository = createCloudSnapshotRepository({
    client: fake.client,
    deviceId: DEVICE_ID,
    normalizeSnapshot: validateImportData
  })

  await assert.rejects(
    repository.load(),
    error => error.code === ERROR_CODES.UNAUTHORIZED && !error.retryable
  )
})

test('CAS 仅发送数据库契约参数并将失败结果映射为 REVISION_CONFLICT', async () => {
  const snapshot = createSnapshot()
  const { hash } = await prepareSnapshot(snapshot)
  const successFake = createCloudClient({
    rpcResult: {
      data: [{
        succeeded: true,
        revision: 2,
        payload_hash: hash,
        updated_at: UPDATED_AT,
        updated_by_device: DEVICE_ID
      }],
      error: null
    }
  })
  const successRepository = createCloudSnapshotRepository({
    client: successFake.client,
    deviceId: DEVICE_ID,
    normalizeSnapshot: validateImportData
  })

  const remote = await successRepository.compareAndSwap(1, snapshot)
  const rpcCall = successFake.calls.find(call => call[0] === 'rpc')
  assert.equal(rpcCall[1], 'compare_and_swap_user_snapshot')
  assert.equal('user_id' in rpcCall[2], false)
  assert.equal(rpcCall[2].expected_revision, 1)
  assert.equal(remote.revision, 2)

  const conflictFake = createCloudClient({
    rpcResult: {
      data: [{ succeeded: false }],
      error: null
    }
  })
  const conflictRepository = createCloudSnapshotRepository({
    client: conflictFake.client,
    deviceId: DEVICE_ID,
    normalizeSnapshot: validateImportData
  })
  await assert.rejects(
    conflictRepository.compareAndSwap(1, snapshot),
    error => error.code === ERROR_CODES.REVISION_CONFLICT
  )
})

test('云仓库操作级 deadline 会中止 RPC 并映射为可重试错误', async () => {
  const fake = createCloudClient({
    rpcResult: null,
    neverResolveOperation: 'rpc'
  })
  const repository = createCloudSnapshotRepository({
    client: fake.client,
    deviceId: DEVICE_ID,
    normalizeSnapshot: validateImportData,
    requestTimeoutMs: 5
  })

  await assert.rejects(
    repository.compareAndSwap(1, createSnapshot()),
    error => (
      error.code === ERROR_CODES.REMOTE_UNAVAILABLE &&
      error.retryable
    )
  )
})
