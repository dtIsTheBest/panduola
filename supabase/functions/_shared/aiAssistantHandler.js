import {
  AI_ERROR_CODES,
  AiFunctionError,
  createCorsHeaders,
  errorResponsePayload,
  extractBearerToken,
  getClientAddress,
  isPublicCredential,
  readLimitedJsonBody,
  validateAiRequest
} from './aiAssistantCore.js'

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'
const EXPECTED_CLIENT_ERRORS = new Set([400, 401, 403, 405, 409, 429])

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers })
}

function validateQuotaResult(data, actorType) {
  const quota = Array.isArray(data) ? data[0] : data
  if (!quota || typeof quota.allowed !== 'boolean' || typeof quota.duplicate !== 'boolean') {
    throw new AiFunctionError(
      503,
      AI_ERROR_CODES.SERVICE_UNAVAILABLE,
      'AI 助手暂时不可用'
    )
  }
  const dailyLimit = Number(quota.daily_limit)
  const remaining = Number(quota.remaining)
  if (
    !Number.isSafeInteger(dailyLimit) || dailyLimit <= 0 ||
    !Number.isSafeInteger(remaining) || remaining < 0 || remaining > dailyLimit
  ) {
    throw new AiFunctionError(
      503,
      AI_ERROR_CODES.SERVICE_UNAVAILABLE,
      'AI 助手暂时不可用'
    )
  }
  if (quota.duplicate) {
    throw new AiFunctionError(
      409,
      AI_ERROR_CODES.DUPLICATE_REQUEST,
      '该问题已提交，请勿重复发送'
    )
  }
  if (!quota.allowed) {
    throw new AiFunctionError(
      429,
      AI_ERROR_CODES.QUOTA_EXCEEDED,
      '今日 AI 使用次数已用完，请明天再试'
    )
  }
  return Object.freeze({
    actorType,
    limit: dailyLimit,
    remaining
  })
}

function mapAuthError(error) {
  const status = Number(error?.status)
  const errorText = `${error?.name ?? ''} ${error?.code ?? ''} ${error?.message ?? ''}`
    .toLowerCase()
  if (
    error?.code === AI_ERROR_CODES.TIMEOUT ||
    error?.cause?.code === AI_ERROR_CODES.TIMEOUT ||
    errorText.includes('timeout') ||
    errorText.includes('timed out') ||
    errorText.includes('超时')
  ) {
    return new AiFunctionError(
      504,
      AI_ERROR_CODES.TIMEOUT,
      '账号验证超时，请稍后重试',
      { cause: error }
    )
  }
  if (
    status === 0 || status === 429 || status >= 500 ||
    errorText.includes('retryable') ||
    errorText.includes('fetch') ||
    errorText.includes('network')
  ) {
    return new AiFunctionError(
      503,
      AI_ERROR_CODES.SERVICE_UNAVAILABLE,
      '账号服务暂时不可用',
      { cause: error }
    )
  }
  return new AiFunctionError(
    401,
    AI_ERROR_CODES.SESSION_INVALID,
    '登录状态无效，请重新登录',
    { cause: error }
  )
}

async function resolveActor(request, dependencies, guestId) {
  const apiKey = request.headers.get('apikey')?.trim() ?? ''
  if (!dependencies.config.publicCredentials.has(apiKey)) {
    throw new AiFunctionError(
      401,
      AI_ERROR_CODES.SESSION_INVALID,
      '客户端凭据无效'
    )
  }
  const token = extractBearerToken(request.headers)
  if (isPublicCredential(token, dependencies.config.publicCredentials)) {
    const clientAddress = getClientAddress(request.headers)
    const actorHash = await dependencies.hashActor(
      `guest:${guestId}:${clientAddress}`
    )
    return Object.freeze({
      actorHash,
      actorType: 'guest',
      dailyLimit: dependencies.config.guestLimit
    })
  }
  if (token.split('.').length !== 3) {
    throw new AiFunctionError(
      401,
      AI_ERROR_CODES.SESSION_INVALID,
      '登录状态无效，请重新登录'
    )
  }
  const { data, error } = await dependencies.adminClient.auth.getUser(token)
  if (error) throw mapAuthError(error)
  if (!data.user?.id) {
    throw new AiFunctionError(
      401,
      AI_ERROR_CODES.SESSION_INVALID,
      '登录状态无效，请重新登录'
    )
  }
  const actorHash = await dependencies.hashActor(`user:${data.user.id}`)
  return Object.freeze({
    actorHash,
    actorType: 'user',
    dailyLimit: dependencies.config.userLimit
  })
}

async function reserveQuota(dependencies, actor, requestId) {
  const { data, error } = await dependencies.adminClient.rpc(
    'reserve_ai_request_quota',
    {
      p_actor_hash: actor.actorHash,
      p_actor_type: actor.actorType,
      p_request_id: requestId,
      p_daily_limit: actor.dailyLimit
    }
  )
  if (error) {
    throw new AiFunctionError(
      503,
      AI_ERROR_CODES.SERVICE_UNAVAILABLE,
      'AI 助手暂时不可用',
      { cause: error }
    )
  }
  return validateQuotaResult(data, actor.actorType)
}

function recordFailure(logger, errorResponse, context) {
  const logEntry = JSON.stringify({
    event: 'ai.request_failed',
    requestId: context.requestId,
    actorType: context.actorType,
    result: errorResponse.body.code,
    durationMs: context.durationMs,
    ...(context.modelDurationMs === null
      ? {}
      : { modelDurationMs: context.modelDurationMs }),
    ...(context.remaining === null ? {} : { remaining: context.remaining })
  })
  if (EXPECTED_CLIENT_ERRORS.has(errorResponse.status)) {
    logger.warn(logEntry)
  } else {
    logger.error(logEntry)
  }
}

export function createAiAssistantHandler(dependencies) {
  if (!dependencies?.config || !dependencies?.logger) {
    throw new TypeError('AI handler 依赖不完整')
  }

  return async request => {
    const startedAt = dependencies.now()
    const origin = request.headers.get('origin') ?? ''
    let corsHeaders = { 'Content-Type': JSON_CONTENT_TYPE }
    let requestId = null
    let actorType = 'unknown'
    let modelStartedAt = null
    let remaining = null
    try {
      corsHeaders = createCorsHeaders(origin, dependencies.config.allowedOrigins)
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
      }
      if (request.method !== 'POST') {
        throw new AiFunctionError(405, AI_ERROR_CODES.INVALID_REQUEST, '仅支持 POST 请求')
      }
      const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
      if (!contentType.startsWith('application/json')) {
        throw new AiFunctionError(
          400,
          AI_ERROR_CODES.INVALID_REQUEST,
          'Content-Type 必须为 application/json'
        )
      }
      if (
        !dependencies.adminClient ||
        !dependencies.arkClient ||
        !dependencies.hashActor ||
        dependencies.config.publicCredentials.size === 0
      ) {
        throw new AiFunctionError(
          503,
          AI_ERROR_CODES.NOT_CONFIGURED,
          'AI 助手服务尚未完成配置'
        )
      }
      const rawBody = await readLimitedJsonBody(
        request,
        dependencies.config.maxRequestBytes
      )
      const aiRequest = validateAiRequest(rawBody)
      requestId = aiRequest.requestId
      const actor = await resolveActor(request, dependencies, aiRequest.guestId)
      actorType = actor.actorType
      const quota = await reserveQuota(dependencies, actor, aiRequest.requestId)
      remaining = quota.remaining
      modelStartedAt = dependencies.now()
      const answer = await dependencies.arkClient.ask(aiRequest.question)
      dependencies.logger.info(JSON.stringify({
        event: 'ai.request_completed',
        requestId,
        actorType,
        result: 'success',
        durationMs: dependencies.now() - startedAt,
        modelDurationMs: dependencies.now() - modelStartedAt,
        remaining: quota.remaining
      }))
      return jsonResponse({ requestId, answer, quota }, 200, corsHeaders)
    } catch (error) {
      const response = errorResponsePayload(error, requestId)
      recordFailure(dependencies.logger, response, {
        requestId,
        actorType,
        durationMs: dependencies.now() - startedAt,
        modelDurationMs: modelStartedAt === null
          ? null
          : dependencies.now() - modelStartedAt,
        remaining
      })
      return jsonResponse(response.body, response.status, corsHeaders)
    }
  }
}
