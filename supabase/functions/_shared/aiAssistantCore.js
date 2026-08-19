export const AI_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'AI_INVALID_REQUEST',
  SESSION_INVALID: 'AI_SESSION_INVALID',
  DUPLICATE_REQUEST: 'AI_DUPLICATE_REQUEST',
  QUOTA_EXCEEDED: 'AI_QUOTA_EXCEEDED',
  PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  SERVICE_UNAVAILABLE: 'AI_SERVICE_UNAVAILABLE',
  TIMEOUT: 'AI_TIMEOUT'
})

const ALLOWED_REQUEST_KEYS = new Set(['guestId', 'question', 'requestId'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MAX_QUESTION_CHARACTERS = 500
const MAX_CLIENT_ADDRESS_LENGTH = 128
const DEFAULT_MAX_REQUEST_BYTES = 8 * 1024

export class AiFunctionError extends Error {
  constructor(status, code, message, options = {}) {
    super(message)
    this.name = 'AiFunctionError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = Number.isFinite(options.retryAfterSeconds)
      ? Math.max(0, Math.floor(options.retryAfterSeconds))
      : null
    if (options.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        configurable: true,
        writable: true,
        enumerable: false
      })
    }
  }
}

function invalidRequest(message) {
  return new AiFunctionError(400, AI_ERROR_CODES.INVALID_REQUEST, message)
}

function toHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function timeoutError(error) {
  return new AiFunctionError(
    504,
    AI_ERROR_CODES.TIMEOUT,
    'AI 请求超时，请稍后重试',
    { cause: error }
  )
}

export function parseAllowedOrigins(value) {
  if (typeof value !== 'string') return new Set()
  return new Set(value.split(',').map(origin => origin.trim()).filter(Boolean))
}

export function parseNamedKeys(value) {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return []
    return Object.values(parsed).filter(item => typeof item === 'string' && item)
  } catch {
    return []
  }
}

export function createCorsHeaders(origin, allowedOrigins) {
  if (!origin || !allowedOrigins.has(origin)) {
    throw new AiFunctionError(
      403,
      AI_ERROR_CODES.INVALID_REQUEST,
      '当前来源不允许调用 AI 助手'
    )
  }
  return {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin'
  }
}

export function validateAiRequest(rawRequest) {
  if (!rawRequest || typeof rawRequest !== 'object' || Array.isArray(rawRequest)) {
    throw invalidRequest('请求格式无效')
  }
  const keys = Object.keys(rawRequest)
  if (keys.some(key => !ALLOWED_REQUEST_KEYS.has(key)) || keys.length !== 3) {
    throw invalidRequest('请求字段无效')
  }
  if (typeof rawRequest.question !== 'string') {
    throw invalidRequest('问题必须是文本')
  }
  const question = rawRequest.question.trim()
  const questionLength = Array.from(question).length
  if (questionLength === 0 || questionLength > MAX_QUESTION_CHARACTERS) {
    throw invalidRequest('问题长度需在 1 到 500 个字符之间')
  }
  if (!UUID_PATTERN.test(String(rawRequest.requestId))) {
    throw invalidRequest('requestId 格式无效')
  }
  if (!UUID_PATTERN.test(String(rawRequest.guestId))) {
    throw invalidRequest('guestId 格式无效')
  }
  return Object.freeze({
    question,
    requestId: String(rawRequest.requestId).toLowerCase(),
    guestId: String(rawRequest.guestId).toLowerCase()
  })
}

export async function readLimitedJsonBody(
  request,
  maxBytes = DEFAULT_MAX_REQUEST_BYTES
) {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw invalidRequest('请求内容过大')
  }
  if (!request.body) throw invalidRequest('请求内容不能为空')

  const reader = request.body.getReader()
  const chunks = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel('request body too large')
        throw invalidRequest('请求内容过大')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bodyBytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const rawBody = new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes)
    return JSON.parse(rawBody)
  } catch (error) {
    if (error instanceof AiFunctionError) throw error
    throw new AiFunctionError(
      400,
      AI_ERROR_CODES.INVALID_REQUEST,
      '请求 JSON 无效',
      { cause: error }
    )
  }
}

export function extractBearerToken(headers) {
  const authorization = headers.get('authorization') ?? ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

export function isPublicCredential(token, publicCredentials) {
  return !token || publicCredentials.has(token)
}

export function getClientAddress(headers) {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const address = forwarded
    || headers.get('x-real-ip')?.trim()
    || headers.get('cf-connecting-ip')?.trim()
    || 'unknown'
  return address.slice(0, MAX_CLIENT_ADDRESS_LENGTH)
}

export async function hashActor(value, secret, cryptoApi = globalThis.crypto) {
  const hasher = await createActorHasher(secret, cryptoApi)
  return hasher(value)
}

export async function createActorHasher(secret, cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle || typeof secret !== 'string' || secret.length < 16) {
    throw new AiFunctionError(
      503,
      AI_ERROR_CODES.NOT_CONFIGURED,
      'AI 助手服务尚未完成配置'
    )
  }
  const encoder = new TextEncoder()
  const key = await cryptoApi.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  return async value => {
    const signature = await cryptoApi.subtle.sign('HMAC', key, encoder.encode(value))
    return toHex(new Uint8Array(signature))
  }
}

export function createDeadlineFetch(fetchImpl, timeoutMs) {
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetchImpl 必须是函数')
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('timeoutMs 必须是正整数')
  }
  return async (input, init = {}) => {
    const controller = new AbortController()
    let didTimeout = false
    const forwardAbort = () => controller.abort(init.signal?.reason)
    if (init.signal?.aborted) {
      forwardAbort()
    } else {
      init.signal?.addEventListener('abort', forwardAbort, { once: true })
    }
    const timeoutId = globalThis.setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, timeoutMs)
    try {
      const response = await fetchImpl(input, { ...init, signal: controller.signal })
      const requestMethod = String(init.method ?? 'GET').toUpperCase()
      const hasNullBody = response.body === null || requestMethod === 'HEAD' ||
        [204, 205, 304].includes(response.status)
      const responseBody = hasNullBody ? null : await response.arrayBuffer()
      return new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      })
    } catch (error) {
      if (didTimeout) throw timeoutError(error)
      throw error
    } finally {
      globalThis.clearTimeout(timeoutId)
      init.signal?.removeEventListener('abort', forwardAbort)
    }
  }
}

export function parsePositiveInteger(value, fallback, maximum = 1000) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) return fallback
  return parsed
}

export function errorResponsePayload(error, requestId = null) {
  const normalized = error instanceof AiFunctionError
    ? error
    : new AiFunctionError(
        503,
        AI_ERROR_CODES.SERVICE_UNAVAILABLE,
        'AI 助手暂时不可用',
        { cause: error }
      )
  return Object.freeze({
    status: normalized.status,
    body: {
      requestId,
      code: normalized.code,
      message: normalized.message,
      ...(normalized.retryAfterSeconds === null
        ? {}
        : { retryAfterSeconds: normalized.retryAfterSeconds })
    }
  })
}
