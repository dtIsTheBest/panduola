export const AI_ASSISTANT_CLIENT_KEY = Symbol('ai-assistant-client')

export const AI_CLIENT_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'AI_INVALID_REQUEST',
  SESSION_INVALID: 'AI_SESSION_INVALID',
  DUPLICATE_REQUEST: 'AI_DUPLICATE_REQUEST',
  QUOTA_EXCEEDED: 'AI_QUOTA_EXCEEDED',
  PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  SERVICE_UNAVAILABLE: 'AI_SERVICE_UNAVAILABLE',
  TIMEOUT: 'AI_TIMEOUT',
  ABORTED: 'AI_ABORTED',
  IN_PROGRESS: 'AI_REQUEST_IN_PROGRESS'
})

const ERROR_MESSAGES = Object.freeze({
  AI_INVALID_REQUEST: '请输入 1 到 500 个字符的问题。',
  AI_SESSION_INVALID: '登录状态已失效，请重新登录。',
  AI_DUPLICATE_REQUEST: '该问题已提交，请勿重复发送。',
  AI_QUOTA_EXCEEDED: '今日 AI 使用次数已用完，请明天再试。',
  AI_PROVIDER_ERROR: 'AI 服务暂时不可用，请稍后重试。',
  AI_NOT_CONFIGURED: 'AI 助手尚未完成配置。',
  AI_SERVICE_UNAVAILABLE: 'AI 助手暂时不可用，请稍后重试。',
  AI_TIMEOUT: 'AI 回答超时，请稍后重试。',
  AI_ABORTED: '',
  AI_REQUEST_IN_PROGRESS: '已有问题正在处理中，请稍候。'
})

const GUEST_ID_STORAGE_KEY = 'panduola_ai_guest_id'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class AiAssistantError extends Error {
  constructor(code, options = {}) {
    super(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.AI_SERVICE_UNAVAILABLE)
    this.name = 'AiAssistantError'
    this.code = code
    this.status = Number.isFinite(options.status) ? options.status : null
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

function validateQuestion(value, maximum) {
  if (typeof value !== 'string') {
    throw new AiAssistantError(AI_CLIENT_ERROR_CODES.INVALID_REQUEST)
  }
  const question = value.trim()
  const length = Array.from(question).length
  if (length === 0 || length > maximum) {
    throw new AiAssistantError(AI_CLIENT_ERROR_CODES.INVALID_REQUEST)
  }
  return question
}

function validateSuccessPayload(payload, requestId, maximumAnswerCharacters) {
  const quota = payload?.quota
  const limit = Number(quota?.limit)
  const remaining = Number(quota?.remaining)
  if (
    payload?.requestId !== requestId ||
    typeof payload?.answer !== 'string' ||
    !payload.answer.trim() ||
    Array.from(payload.answer).length > maximumAnswerCharacters ||
    !['guest', 'user'].includes(quota?.actorType) ||
    !Number.isSafeInteger(limit) || limit <= 0 ||
    !Number.isSafeInteger(remaining) || remaining < 0 || remaining > limit
  ) {
    throw new AiAssistantError(AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE)
  }
  return Object.freeze({
    requestId,
    answer: payload.answer.trim(),
    quota: Object.freeze({ actorType: quota.actorType, limit, remaining })
  })
}

function mapServerError(payload, status) {
  const code = Object.values(AI_CLIENT_ERROR_CODES).includes(payload?.code)
    ? payload.code
    : AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE
  return new AiAssistantError(code, {
    status,
    retryAfterSeconds: payload?.retryAfterSeconds
  })
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

function waitWithSignal(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('aborted'))
  return new Promise((resolve, reject) => {
    const handleAbort = () => reject(signal.reason ?? new Error('aborted'))
    signal.addEventListener('abort', handleAbort, { once: true })
    Promise.resolve(promise).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', handleAbort)
    })
  })
}

async function readResponseBytes(response, maximumBytes) {
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw new AiAssistantError(AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE)
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maximumBytes) {
        await reader.cancel('response body too large')
        throw new AiAssistantError(AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export function createAiAssistantClient({
  config,
  clientProvider,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  storage,
  randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)
} = {}) {
  if (!config || typeof clientProvider?.getClient !== 'function') {
    throw new TypeError('AI 客户端依赖不完整')
  }
  if (
    config.isAvailable &&
    (typeof fetchImpl !== 'function' || typeof randomUUID !== 'function')
  ) {
    throw new TypeError('当前环境不支持 AI 网络请求')
  }
  const resolvedStorage = storage === undefined ? getDefaultStorage() : storage
  let memoryGuestId = null
  let activeRequest = null

  function getGuestId() {
    if (memoryGuestId) return memoryGuestId
    try {
      const saved = resolvedStorage?.getItem(GUEST_ID_STORAGE_KEY)
      if (UUID_PATTERN.test(String(saved))) {
        memoryGuestId = String(saved).toLowerCase()
        return memoryGuestId
      }
    } catch {
      // Storage is optional; the in-memory id still isolates requests in this session.
    }
    memoryGuestId = randomUUID().toLowerCase()
    try {
      resolvedStorage?.setItem(GUEST_ID_STORAGE_KEY, memoryGuestId)
    } catch {
      // Storage failure must not disable the current in-memory guest session.
    }
    return memoryGuestId
  }

  async function runAsk(questionValue, { signal } = {}) {
    if (!config.isAvailable) {
      throw new AiAssistantError(AI_CLIENT_ERROR_CODES.NOT_CONFIGURED)
    }
    const question = validateQuestion(questionValue, config.maxQuestionCharacters)
    const controller = new AbortController()
    let didTimeout = false
    const forwardAbort = () => controller.abort(signal?.reason)
    if (signal?.aborted) {
      forwardAbort()
    } else {
      signal?.addEventListener('abort', forwardAbort, { once: true })
    }
    const timeoutId = globalThis.setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, config.requestTimeoutMs)
    try {
      if (controller.signal.aborted) {
        throw controller.signal.reason ?? new Error('aborted')
      }
      const requestId = randomUUID().toLowerCase()
      const guestId = getGuestId()
      const client = await waitWithSignal(
        clientProvider.getClient(),
        controller.signal
      )
      const sessionResult = await waitWithSignal(
        client.auth.getSession(),
        controller.signal
      )
      if (sessionResult.error) {
        throw new AiAssistantError(AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE, {
          cause: sessionResult.error
        })
      }
      const authorization = sessionResult.data.session?.access_token
        ?? config.publishableKey
      const response = await fetchImpl(
        `${config.supabaseUrl}/functions/v1/${config.functionName}`,
        {
          method: 'POST',
          headers: {
            apikey: config.publishableKey,
            Authorization: `Bearer ${authorization}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ question, requestId, guestId }),
          signal: controller.signal
        }
      )
      const maximumResponseBytes = Number.isSafeInteger(config.maxResponseBytes)
        ? config.maxResponseBytes
        : 64 * 1024
      const rawBody = await readResponseBytes(response, maximumResponseBytes)
      let payload
      try {
        const bodyText = new TextDecoder().decode(rawBody)
        payload = bodyText ? JSON.parse(bodyText) : null
      } catch (error) {
        throw new AiAssistantError(AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE, {
          status: response.status,
          cause: error
        })
      }
      if (!response.ok) throw mapServerError(payload, response.status)
      return validateSuccessPayload(
        payload,
        requestId,
        config.maxAnswerCharacters
      )
    } catch (error) {
      if (error instanceof AiAssistantError) throw error
      if (didTimeout) {
        throw new AiAssistantError(AI_CLIENT_ERROR_CODES.TIMEOUT, { cause: error })
      }
      if (controller.signal.aborted) {
        throw new AiAssistantError(AI_CLIENT_ERROR_CODES.ABORTED, { cause: error })
      }
      throw new AiAssistantError(AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE, {
        cause: error
      })
    } finally {
      globalThis.clearTimeout(timeoutId)
      signal?.removeEventListener('abort', forwardAbort)
    }
  }

  function ask(questionValue, options = {}) {
    if (activeRequest) {
      return Promise.reject(
        new AiAssistantError(AI_CLIENT_ERROR_CODES.IN_PROGRESS)
      )
    }
    const currentRequest = runAsk(questionValue, options).finally(() => {
      if (activeRequest === currentRequest) activeRequest = null
    })
    activeRequest = currentRequest
    return currentRequest
  }

  return Object.freeze({
    isAvailable: config.isAvailable,
    configError: config.configError,
    ask
  })
}
