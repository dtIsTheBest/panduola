import assert from 'node:assert/strict'
import { test } from 'node:test'
import { webcrypto } from 'node:crypto'
import {
  AI_ERROR_CODES,
  AiFunctionError,
  createActorHasher,
  createCorsHeaders,
  createDeadlineFetch,
  errorResponsePayload,
  getClientAddress,
  hashActor,
  isPublicCredential,
  parseAllowedOrigins,
  parseNamedKeys,
  readLimitedJsonBody,
  validateAiRequest
} from '../supabase/functions/_shared/aiAssistantCore.js'
import { createAiAssistantHandler } from '../supabase/functions/_shared/aiAssistantHandler.js'
import { createArkClient } from '../supabase/functions/_shared/arkClient.js'

const REQUEST_ID = '11111111-1111-4111-8111-111111111111'
const GUEST_ID = '22222222-2222-4222-8222-222222222222'

function validRequest(question = '宝宝晚上总醒怎么办？') {
  return { question, requestId: REQUEST_ID, guestId: GUEST_ID }
}

test('AI 请求只接受字段白名单并规范化问题与 UUID', () => {
  assert.deepEqual(validateAiRequest({
    ...validRequest('  宝宝晚上总醒怎么办？  '),
    requestId: REQUEST_ID.toUpperCase()
  }), {
    question: '宝宝晚上总醒怎么办？',
    requestId: REQUEST_ID,
    guestId: GUEST_ID
  })
  assert.throws(
    () => validateAiRequest({ ...validRequest(), model: 'private-model' }),
    error => error.code === AI_ERROR_CODES.INVALID_REQUEST
  )
  assert.throws(
    () => validateAiRequest({ question: '问题', requestId: REQUEST_ID }),
    error => error.code === AI_ERROR_CODES.INVALID_REQUEST
  )
})

test('AI 问题覆盖空白、Unicode 五百字符和超长边界', () => {
  assert.throws(
    () => validateAiRequest(validRequest(' \n\t ')),
    error => error.code === AI_ERROR_CODES.INVALID_REQUEST
  )
  assert.equal(validateAiRequest(validRequest('育'.repeat(500))).question.length, 500)
  assert.throws(
    () => validateAiRequest(validRequest('育'.repeat(501))),
    error => error.code === AI_ERROR_CODES.INVALID_REQUEST
  )
  assert.equal(Array.from(validateAiRequest(validRequest('👨‍👩‍👧')).question).length, 5)
})

test('Origin 白名单使用精确匹配并生成最小 CORS 头', () => {
  const origins = parseAllowedOrigins(
    'https://www.nurtureprimer.com, http://127.0.0.1:5173'
  )
  const headers = createCorsHeaders('https://www.nurtureprimer.com', origins)
  assert.equal(headers['Access-Control-Allow-Origin'], 'https://www.nurtureprimer.com')
  assert.throws(
    () => createCorsHeaders('https://evil.example', origins),
    error => error.status === 403
  )
})

test('公开凭据与用户 JWT 严格区分', () => {
  const namedKeys = parseNamedKeys(JSON.stringify({
    default: 'sb_publishable_public',
    preview: 'sb_publishable_preview'
  }))
  const credentials = new Set(['legacy-anon-jwt', ...namedKeys])
  assert.equal(isPublicCredential('', credentials), true)
  assert.equal(isPublicCredential('legacy-anon-jwt', credentials), true)
  assert.equal(isPublicCredential('sb_publishable_preview', credentials), true)
  assert.equal(isPublicCredential('header.payload.signature', credentials), false)
  assert.deepEqual(parseNamedKeys('{broken'), [])
})

test('客户端地址只取转发链首项并限制长度', () => {
  const headers = new Headers({
    'x-forwarded-for': `203.0.113.10, ${'a'.repeat(200)}`
  })
  assert.equal(getClientAddress(headers), '203.0.113.10')
  assert.equal(getClientAddress(new Headers()), 'unknown')
})

test('主体 HMAC 稳定、不可逆且按输入隔离', async () => {
  const secret = 'test-only-quota-secret'
  const first = await hashActor('guest:one', secret, webcrypto)
  const second = await hashActor('guest:one', secret, webcrypto)
  const other = await hashActor('guest:two', secret, webcrypto)
  assert.match(first, /^[0-9a-f]{64}$/)
  assert.equal(first, second)
  assert.notEqual(first, other)
  assert.equal(first.includes('guest'), false)
})

test('配置缺失的主体 HMAC 返回稳定错误', async () => {
  await assert.rejects(
    hashActor('guest:one', 'short', webcrypto),
    error => error.code === AI_ERROR_CODES.NOT_CONFIGURED
  )
})

test('方舟适配器只发送固定协议并返回纯文本回答', async () => {
  let captured = null
  const client = createArkClient({
    apiKey: 'test-ark-key',
    modelId: 'test-model',
    fetchImpl: async (_url, init) => {
      captured = JSON.parse(init.body)
      return new Response(JSON.stringify({
        choices: [{ message: { content: '  可以先建立固定睡前流程。  ' } }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
  })
  assert.equal(await client.ask('宝宝晚上总醒怎么办？'), '可以先建立固定睡前流程。')
  assert.equal(captured.model, 'test-model')
  assert.equal(captured.messages.at(-1).content, '宝宝晚上总醒怎么办？')
  assert.equal(JSON.stringify(captured).includes('test-ark-key'), false)
})

test('方舟 429、非法响应和网络失败映射稳定错误', async () => {
  const busyClient = createArkClient({
    apiKey: 'test-ark-key',
    modelId: 'test-model',
    fetchImpl: async () => new Response('{}', {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '12' }
    })
  })
  await assert.rejects(
    busyClient.ask('问题'),
    error => (
      error.code === AI_ERROR_CODES.PROVIDER_ERROR &&
      error.retryAfterSeconds === 12
    )
  )

  const invalidClient = createArkClient({
    apiKey: 'test-ark-key',
    modelId: 'test-model',
    fetchImpl: async () => new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  })
  await assert.rejects(
    invalidClient.ask('问题'),
    error => error.code === AI_ERROR_CODES.PROVIDER_ERROR
  )

  const failedClient = createArkClient({
    apiKey: 'test-ark-key',
    modelId: 'test-model',
    fetchImpl: async () => {
      throw new TypeError('network unavailable')
    }
  })
  await assert.rejects(
    failedClient.ask('问题'),
    error => error.code === AI_ERROR_CODES.PROVIDER_ERROR
  )
})

test('方舟 deadline 中止悬挂请求且错误响应不枚举 cause', async () => {
  const client = createArkClient({
    apiKey: 'test-ark-key',
    modelId: 'test-model',
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')))
    })
  })
  await assert.rejects(
    client.ask('问题'),
    error => error.code === AI_ERROR_CODES.TIMEOUT
  )
  const failure = new AiFunctionError(502, AI_ERROR_CODES.PROVIDER_ERROR, '失败', {
    cause: new Error('private')
  })
  assert.equal(JSON.stringify(errorResponsePayload(failure)).includes('private'), false)
})

test('方舟 deadline 覆盖响应体读取并映射 AI_TIMEOUT', async () => {
  const client = createArkClient({
    apiKey: 'test-ark-key',
    modelId: 'test-model',
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"choices":['))
        init.signal.addEventListener('abort', () => {
          controller.error(new Error('body aborted'))
        })
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  await assert.rejects(
    client.ask('问题'),
    error => error.code === AI_ERROR_CODES.TIMEOUT && error.status === 504
  )
})

test('请求体流式读取在超过 8 KiB 时立即中止', async () => {
  const request = new Request('https://function.example', {
    method: 'POST',
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(5000))
        controller.enqueue(new Uint8Array(5000))
        controller.close()
      }
    }),
    duplex: 'half'
  })
  await assert.rejects(
    readLimitedJsonBody(request),
    error => error.code === AI_ERROR_CODES.INVALID_REQUEST
  )
})

test('统一 deadline 覆盖响应体读取而非只覆盖响应头', async () => {
  const deadlineFetch = createDeadlineFetch(async (_input, init) => (
    new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"partial":'))
        init.signal.addEventListener('abort', () => {
          controller.error(new Error('body aborted'))
        })
      }
    }), { status: 200 })
  ), 5)
  await assert.rejects(
    deadlineFetch('https://example.test'),
    error => error.code === AI_ERROR_CODES.TIMEOUT
  )
})

function createHandlerFixture(overrides = {}) {
  const calls = { auth: 0, rpc: 0, ark: 0, logs: [] }
  const config = {
    allowedOrigins: new Set(['https://www.nurtureprimer.com']),
    publicCredentials: new Set(['sb_publishable_test']),
    guestLimit: 3,
    userLimit: 20,
    maxRequestBytes: 8 * 1024
  }
  const adminClient = {
    auth: {
      async getUser() {
        calls.auth += 1
        return { data: { user: { id: 'user-a' } }, error: null }
      }
    },
    async rpc() {
      calls.rpc += 1
      return {
        data: [{ allowed: true, duplicate: false, daily_limit: 3, remaining: 2 }],
        error: null
      }
    }
  }
  const arkClient = {
    async ask() {
      calls.ark += 1
      return '可以先保持固定的睡前流程。'
    }
  }
  const logger = {
    info(value) { calls.logs.push(value) },
    warn(value) { calls.logs.push(value) },
    error(value) { calls.logs.push(value) }
  }
  const dependencies = {
    config,
    adminClient,
    arkClient,
    hashActor: async value => (
      await createActorHasher('test-only-quota-secret', webcrypto)
    )(value),
    logger,
    now: (() => {
      let timestamp = 1000
      return () => timestamp += 10
    })(),
    ...overrides
  }
  return { handler: createAiAssistantHandler(dependencies), calls, dependencies }
}

function createHandlerRequest({ token = 'sb_publishable_test', apiKey = 'sb_publishable_test', body = validRequest() } = {}) {
  return new Request('https://function.example/ai-growth-assistant', {
    method: 'POST',
    headers: {
      apikey: apiKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      origin: 'https://www.nurtureprimer.com'
    },
    body: JSON.stringify(body)
  })
}

test('Edge handler 游客正常路径返回回答与配额且日志不含问题', async () => {
  const { handler, calls } = createHandlerFixture()
  const response = await handler(createHandlerRequest())
  const payload = await response.json()
  assert.equal(response.status, 200)
  assert.equal(payload.answer, '可以先保持固定的睡前流程。')
  assert.deepEqual(payload.quota, { actorType: 'guest', limit: 3, remaining: 2 })
  assert.deepEqual({ auth: calls.auth, rpc: calls.rpc, ark: calls.ark }, {
    auth: 0,
    rpc: 1,
    ark: 1
  })
  assert.equal(calls.logs.join('').includes('宝宝晚上总醒怎么办'), false)
})

test('Edge handler 强制校验 apikey 且拒绝后不访问配额或模型', async () => {
  const { handler, calls } = createHandlerFixture()
  const response = await handler(createHandlerRequest({ apiKey: 'invalid' }))
  assert.equal(response.status, 401)
  assert.equal((await response.json()).code, AI_ERROR_CODES.SESSION_INVALID)
  assert.deepEqual({ rpc: calls.rpc, ark: calls.ark }, { rpc: 0, ark: 0 })
})

test('Edge handler 登录 JWT 使用用户额度且身份来自 Auth', async () => {
  const fixture = createHandlerFixture()
  fixture.dependencies.adminClient.rpc = async (_name, params) => {
    fixture.calls.rpc += 1
    assert.equal(params.p_actor_type, 'user')
    assert.equal(params.p_daily_limit, 20)
    return {
      data: [{ allowed: true, duplicate: false, daily_limit: 20, remaining: 19 }],
      error: null
    }
  }
  const response = await fixture.handler(createHandlerRequest({
    token: 'header.payload.signature'
  }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).quota.actorType, 'user')
  assert.equal(fixture.calls.auth, 1)
})

test('Edge handler 区分 Auth 依赖故障与明确 Session 拒绝', async () => {
  for (const scenario of [
    {
      error: {
        name: 'AuthRetryableFetchError',
        status: 0,
        message: 'AI 请求超时，请稍后重试'
      },
      expectedStatus: 504,
      expectedCode: AI_ERROR_CODES.TIMEOUT
    },
    {
      error: {
        name: 'AuthRetryableFetchError',
        status: 0,
        message: 'network fetch failed'
      },
      expectedStatus: 503,
      expectedCode: AI_ERROR_CODES.SERVICE_UNAVAILABLE
    },
    {
      error: { name: 'AuthApiError', status: 401, message: 'invalid JWT' },
      expectedStatus: 401,
      expectedCode: AI_ERROR_CODES.SESSION_INVALID
    }
  ]) {
    const fixture = createHandlerFixture()
    fixture.dependencies.adminClient.auth.getUser = async () => ({
      data: { user: null },
      error: scenario.error
    })
    const response = await fixture.handler(createHandlerRequest({
      token: 'header.payload.signature'
    }))
    assert.equal(response.status, scenario.expectedStatus)
    assert.equal((await response.json()).code, scenario.expectedCode)
    assert.deepEqual({ rpc: fixture.calls.rpc, ark: fixture.calls.ark }, {
      rpc: 0,
      ark: 0
    })
  }
})

test('Edge handler 配额拒绝、重复请求和配置缺失均不调用模型', async () => {
  for (const scenario of [
    { row: { allowed: false, duplicate: false }, status: 429 },
    { row: { allowed: false, duplicate: true }, status: 409 }
  ]) {
    const fixture = createHandlerFixture()
    fixture.dependencies.adminClient.rpc = async () => ({
      data: [{ ...scenario.row, daily_limit: 3, remaining: 0 }],
      error: null
    })
    const response = await fixture.handler(createHandlerRequest())
    assert.equal(response.status, scenario.status)
    assert.equal(fixture.calls.ark, 0)
  }

  const fixture = createHandlerFixture({ arkClient: null })
  const response = await fixture.handler(createHandlerRequest())
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, AI_ERROR_CODES.NOT_CONFIGURED)
  assert.deepEqual({ rpc: fixture.calls.rpc, ark: fixture.calls.ark }, { rpc: 0, ark: 0 })
})

test('Edge handler 拒绝非法配额 DTO 且不调用模型', async () => {
  const fixture = createHandlerFixture()
  fixture.dependencies.adminClient.rpc = async () => ({
    data: [{ allowed: true, duplicate: false, daily_limit: 3, remaining: -1 }],
    error: null
  })
  const response = await fixture.handler(createHandlerRequest())
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, AI_ERROR_CODES.SERVICE_UNAVAILABLE)
  assert.equal(fixture.calls.ark, 0)
})
