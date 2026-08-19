import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AI_CLIENT_ERROR_CODES,
  createAiAssistantClient
} from '../src/ai/aiAssistantClient.js'
import { loadAiConfig } from '../src/ai/config.js'

const PROJECT_URL = 'https://project-id.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_abcdefghijklmnopqrstuvwxyz'
const REQUEST_ID = '11111111-1111-4111-8111-111111111111'
const GUEST_ID = '22222222-2222-4222-8222-222222222222'

function createConfig(overrides = {}) {
  return {
    isAvailable: true,
    configError: null,
    supabaseUrl: PROJECT_URL,
    publishableKey: PUBLISHABLE_KEY,
    functionName: 'ai-growth-assistant',
    requestTimeoutMs: 50,
    maxQuestionCharacters: 500,
    maxAnswerCharacters: 12_000,
    maxResponseBytes: 64 * 1024,
    ...overrides
  }
}

function createClientFixture({ session = null, response, config, storage } = {}) {
  const calls = []
  let uuidIndex = 0
  const uuids = [REQUEST_ID, GUEST_ID]
  const clientProvider = {
    async getClient() {
      return {
        auth: {
          async getSession() {
            return { data: { session }, error: null }
          }
        }
      }
    }
  }
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return response ?? new Response(JSON.stringify({
      requestId: REQUEST_ID,
      answer: '可以先记录连续几天的睡眠时间。',
      quota: { actorType: session ? 'user' : 'guest', limit: 3, remaining: 2 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  const aiClient = createAiAssistantClient({
    config: config ?? createConfig(),
    clientProvider,
    fetchImpl,
    storage: storage ?? new MapStorage(),
    randomUUID: () => uuids[uuidIndex++]
  })
  return { aiClient, calls }
}

class MapStorage {
  constructor() {
    this.values = new Map()
  }

  getItem(key) {
    return this.values.get(key) ?? null
  }

  setItem(key, value) {
    this.values.set(key, value)
  }
}

test('AI 配置默认关闭且生产环境只接受 HTTPS Supabase', () => {
  assert.equal(loadAiConfig({}).isAvailable, false)
  assert.equal(loadAiConfig({
    VITE_AI_ENABLED: 'true',
    VITE_SUPABASE_URL: 'http://remote.example',
    VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY
  }, { isProduction: true }).isAvailable, false)
  const config = loadAiConfig({
    VITE_AI_ENABLED: 'true',
    VITE_SUPABASE_URL: PROJECT_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    VITE_AI_REQUEST_TIMEOUT_MS: '30000'
  }, { isProduction: true })
  assert.equal(config.isAvailable, true)
  assert.equal(config.requestTimeoutMs, 30_000)
})

test('游客请求只发送当前问题、requestId、guestId 和公开凭据', async () => {
  const { aiClient, calls } = createClientFixture()
  const result = await aiClient.ask('  宝宝晚上总醒怎么办？  ')
  assert.equal(result.answer, '可以先记录连续几天的睡眠时间。')
  assert.equal(calls.length, 1)
  const request = calls[0]
  assert.equal(request.url, `${PROJECT_URL}/functions/v1/ai-growth-assistant`)
  assert.equal(request.init.headers.apikey, PUBLISHABLE_KEY)
  assert.equal(request.init.headers.Authorization, `Bearer ${PUBLISHABLE_KEY}`)
  assert.deepEqual(JSON.parse(request.init.body), {
    question: '宝宝晚上总醒怎么办？',
    requestId: REQUEST_ID,
    guestId: GUEST_ID
  })
  assert.equal(request.init.body.includes('session'), false)
  assert.equal(request.init.body.includes('history'), false)
})

test('登录请求只在 Authorization 使用 Session token', async () => {
  const { aiClient, calls } = createClientFixture({
    session: { access_token: 'private-session-token' }
  })
  await aiClient.ask('问题')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer private-session-token')
  assert.equal(calls[0].init.body.includes('private-session-token'), false)
})

test('guestId 在本机复用且存储失败时退化为内存标识', async () => {
  const storage = new MapStorage()
  const first = createClientFixture({ storage })
  await first.aiClient.ask('问题一')
  const savedGuestId = JSON.parse(first.calls[0].init.body).guestId
  assert.equal(savedGuestId, GUEST_ID)

  const reused = createClientFixture({ storage })
  await reused.aiClient.ask('问题一的补充')
  assert.equal(JSON.parse(reused.calls[0].init.body).guestId, savedGuestId)

  const failingStorage = {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('blocked') }
  }
  const fallback = createClientFixture({ storage: failingStorage })
  await fallback.aiClient.ask('问题二')
  assert.equal(JSON.parse(fallback.calls[0].init.body).guestId, GUEST_ID)
})

test('空白和超过五百字符的问题在网络请求前拒绝', async () => {
  const fixture = createClientFixture()
  await assert.rejects(
    fixture.aiClient.ask(' \n '),
    error => error.code === AI_CLIENT_ERROR_CODES.INVALID_REQUEST
  )
  await assert.rejects(
    fixture.aiClient.ask('育'.repeat(501)),
    error => error.code === AI_CLIENT_ERROR_CODES.INVALID_REQUEST
  )
  assert.equal(fixture.calls.length, 0)
})

test('服务端错误矩阵映射为稳定客户端错误', async () => {
  for (const [status, code] of [
    [400, AI_CLIENT_ERROR_CODES.INVALID_REQUEST],
    [401, AI_CLIENT_ERROR_CODES.SESSION_INVALID],
    [409, AI_CLIENT_ERROR_CODES.DUPLICATE_REQUEST],
    [429, AI_CLIENT_ERROR_CODES.QUOTA_EXCEEDED],
    [503, AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE],
    [504, AI_CLIENT_ERROR_CODES.TIMEOUT]
  ]) {
    const response = new Response(JSON.stringify({ code }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
    const { aiClient } = createClientFixture({ response })
    await assert.rejects(
      aiClient.ask('问题'),
      error => error.code === code && error.status === status
    )
  }
})

test('非法成功 DTO 和未知服务端错误不会泄露原始内容', async () => {
  const invalid = createClientFixture({
    response: new Response(JSON.stringify({
      requestId: REQUEST_ID,
      answer: '回答',
      quota: { actorType: 'guest', limit: 3, remaining: -1 }
    }), { status: 200 })
  })
  await assert.rejects(
    invalid.aiClient.ask('问题'),
    error => error.code === AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE
  )

  const unknown = createClientFixture({
    response: new Response(JSON.stringify({
      code: 'PRIVATE_SERVER_ERROR',
      message: 'private details'
    }), { status: 500 })
  })
  await assert.rejects(
    unknown.aiClient.ask('问题'),
    error => (
      error.code === AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE &&
      !error.message.includes('private details')
    )
  )
})

test('前端 deadline 和用户取消使用不同错误码', async () => {
  const timeoutFixture = createClientFixture({
    config: createConfig({ requestTimeoutMs: 5 }),
    response: undefined
  })
  timeoutFixture.aiClient = createAiAssistantClient({
    config: createConfig({ requestTimeoutMs: 5 }),
    clientProvider: {
      async getClient() {
        return { auth: { async getSession() { return { data: { session: null }, error: null } } } }
      }
    },
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      if (init.signal.aborted) {
        reject(new Error('aborted'))
        return
      }
      init.signal.addEventListener('abort', () => reject(new Error('aborted')))
    }),
    storage: new MapStorage(),
    randomUUID: (() => {
      const values = [REQUEST_ID, GUEST_ID]
      return () => values.shift()
    })()
  })
  await assert.rejects(
    timeoutFixture.aiClient.ask('问题'),
    error => error.code === AI_CLIENT_ERROR_CODES.TIMEOUT
  )

  const controller = new AbortController()
  const cancelled = createAiAssistantClient({
    config: createConfig(),
    clientProvider: {
      async getClient() {
        return { auth: { async getSession() { return { data: { session: null }, error: null } } } }
      }
    },
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      if (init.signal.aborted) {
        reject(new Error('aborted'))
        return
      }
      init.signal.addEventListener('abort', () => reject(new Error('aborted')))
    }),
    storage: new MapStorage(),
    randomUUID: (() => {
      const values = [REQUEST_ID, GUEST_ID]
      return () => values.shift()
    })()
  })
  const pending = cancelled.ask('问题', { signal: controller.signal })
  controller.abort()
  await assert.rejects(
    pending,
    error => error.code === AI_CLIENT_ERROR_CODES.ABORTED
  )
})

test('总 deadline 与取消覆盖 Provider 和 Session 获取阶段', async () => {
  const hangingProvider = createAiAssistantClient({
    config: createConfig({ requestTimeoutMs: 5 }),
    clientProvider: { getClient: async () => new Promise(() => {}) },
    fetchImpl: async () => {
      throw new Error('should not fetch')
    },
    storage: new MapStorage(),
    randomUUID: () => REQUEST_ID
  })
  await assert.rejects(
    hangingProvider.ask('问题'),
    error => error.code === AI_CLIENT_ERROR_CODES.TIMEOUT
  )

  const controller = new AbortController()
  const hangingSession = createAiAssistantClient({
    config: createConfig(),
    clientProvider: {
      async getClient() {
        return { auth: { getSession: async () => new Promise(() => {}) } }
      }
    },
    fetchImpl: async () => {
      throw new Error('should not fetch')
    },
    storage: new MapStorage(),
    randomUUID: () => REQUEST_ID
  })
  const pending = hangingSession.ask('问题', { signal: controller.signal })
  controller.abort()
  await assert.rejects(
    pending,
    error => error.code === AI_CLIENT_ERROR_CODES.ABORTED
  )
})

test('Provider 和 Session 抛错统一映射且客户端强制单飞', async () => {
  const providerFailure = createAiAssistantClient({
    config: createConfig(),
    clientProvider: {
      async getClient() {
        throw new Error('private provider failure')
      }
    },
    fetchImpl: async () => {
      throw new Error('should not fetch')
    },
    storage: new MapStorage(),
    randomUUID: () => REQUEST_ID
  })
  await assert.rejects(
    providerFailure.ask('问题'),
    error => (
      error.code === AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE &&
      !error.message.includes('private')
    )
  )

  let finishRequest
  const fixture = createClientFixture()
  fixture.aiClient = createAiAssistantClient({
    config: createConfig(),
    clientProvider: {
      async getClient() {
        return { auth: { async getSession() { return { data: { session: null }, error: null } } } }
      }
    },
    fetchImpl: async () => new Promise(resolve => {
      finishRequest = resolve
    }),
    storage: new MapStorage(),
    randomUUID: (() => {
      const values = [REQUEST_ID, GUEST_ID]
      return () => values.shift()
    })()
  })
  const firstRequest = fixture.aiClient.ask('问题一')
  await assert.rejects(
    fixture.aiClient.ask('问题二'),
    error => error.code === AI_CLIENT_ERROR_CODES.IN_PROGRESS
  )
  await new Promise(resolve => setImmediate(resolve))
  finishRequest(new Response(JSON.stringify({
    requestId: REQUEST_ID,
    answer: '回答',
    quota: { actorType: 'guest', limit: 3, remaining: 2 }
  }), { status: 200 }))
  await firstRequest
})

test('异常超大响应在完整缓冲前被拒绝', async () => {
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(40_000))
      controller.enqueue(new Uint8Array(40_000))
      controller.close()
    }
  }), { status: 200 })
  const fixture = createClientFixture({ response })
  await assert.rejects(
    fixture.aiClient.ask('问题'),
    error => error.code === AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE
  )
})

test('AI 关闭时不初始化 Supabase 或发起网络请求', async () => {
  let providerCalls = 0
  let fetchCalls = 0
  const aiClient = createAiAssistantClient({
    config: createConfig({ isAvailable: false }),
    clientProvider: {
      async getClient() {
        providerCalls += 1
        throw new Error('should not run')
      }
    },
    fetchImpl: null,
    storage: null,
    randomUUID: null
  })
  await assert.rejects(
    aiClient.ask('问题'),
    error => error.code === AI_CLIENT_ERROR_CODES.NOT_CONFIGURED
  )
  assert.deepEqual({ providerCalls, fetchCalls }, { providerCalls: 0, fetchCalls: 0 })
})
