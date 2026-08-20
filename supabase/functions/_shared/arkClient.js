import { AI_ERROR_CODES, AiFunctionError } from './aiAssistantCore.js'

const ARK_CHAT_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
const DEFAULT_TIMEOUT_MS = 18_000
const DEFAULT_MAX_OUTPUT_TOKENS = 800
const MAX_ANSWER_CHARACTERS = 12_000
const SYSTEM_PROMPT = `你是潘多拉家庭成长助手，面向 0-22 岁孩子的家长提供清晰、温和、可执行的建议。
只回答当前问题，不声称掌握用户未提供的个人信息。涉及医疗、心理、法律或安全风险时，明确说明回答仅供参考，并建议咨询专业人士；遇到呼吸困难、意识异常、自伤风险等紧急情况时，建议立即联系当地急救或专业机构。`

function parseRetryAfter(response) {
  const seconds = Number(response.headers.get('retry-after'))
  return Number.isFinite(seconds) ? Math.max(0, seconds) : null
}

function extractAnswer(payload) {
  const answer = payload?.choices?.[0]?.message?.content
  if (typeof answer !== 'string' || !answer.trim()) {
    throw new AiFunctionError(
      502,
      AI_ERROR_CODES.PROVIDER_ERROR,
      'AI 回答暂时不可用'
    )
  }
  return answer.trim().slice(0, MAX_ANSWER_CHARACTERS)
}

export function createArkClient({
  apiKey,
  modelId,
  thinkingMode,
  fetchImpl = globalThis.fetch?.bind(globalThis),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey || typeof modelId !== 'string' || !modelId) {
    throw new AiFunctionError(
      503,
      AI_ERROR_CODES.NOT_CONFIGURED,
      'AI 助手服务尚未完成配置'
    )
  }
  if (thinkingMode !== undefined && thinkingMode !== 'disabled') {
    throw new AiFunctionError(
      503,
      AI_ERROR_CODES.NOT_CONFIGURED,
      'AI 助手服务尚未完成配置'
    )
  }
  if (typeof fetchImpl !== 'function') {
    throw new AiFunctionError(
      503,
      AI_ERROR_CODES.SERVICE_UNAVAILABLE,
      'AI 助手暂时不可用'
    )
  }

  async function ask(question) {
    const controller = new AbortController()
    let didTimeout = false
    const timeoutId = globalThis.setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, timeoutMs)
    try {
      const requestPayload = {
        model: modelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: question }
        ],
        max_tokens: maxOutputTokens,
        temperature: 0.4
      }
      if (thinkingMode === 'disabled') {
        requestPayload.thinking = { type: 'disabled' }
      }
      const response = await fetchImpl(ARK_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      })
      if (response.status === 429) {
        controller.abort()
        throw new AiFunctionError(
          502,
          AI_ERROR_CODES.PROVIDER_ERROR,
          'AI 服务繁忙，请稍后重试',
          { retryAfterSeconds: parseRetryAfter(response) }
        )
      }
      if (!response.ok) {
        controller.abort()
        throw new AiFunctionError(
          502,
          AI_ERROR_CODES.PROVIDER_ERROR,
          'AI 服务暂时不可用'
        )
      }
      let payload
      try {
        payload = await response.json()
      } catch (error) {
        if (didTimeout) {
          throw new AiFunctionError(
            504,
            AI_ERROR_CODES.TIMEOUT,
            'AI 回答超时，请稍后重试',
            { cause: error }
          )
        }
        throw new AiFunctionError(
          502,
          AI_ERROR_CODES.PROVIDER_ERROR,
          'AI 服务返回了无效响应',
          { cause: error }
        )
      }
      return extractAnswer(payload)
    } catch (error) {
      if (error instanceof AiFunctionError) throw error
      if (didTimeout) {
        throw new AiFunctionError(
          504,
          AI_ERROR_CODES.TIMEOUT,
          'AI 回答超时，请稍后重试',
          { cause: error }
        )
      }
      throw new AiFunctionError(
        502,
        AI_ERROR_CODES.PROVIDER_ERROR,
        'AI 服务连接失败，请稍后重试',
        { cause: error }
      )
    } finally {
      globalThis.clearTimeout(timeoutId)
    }
  }

  return Object.freeze({ ask })
}
