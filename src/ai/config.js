import { loadSyncConfig } from '../account/config.js'

export const AI_DEFAULTS = Object.freeze({
  requestTimeoutMs: 25_000,
  maxQuestionCharacters: 500,
  maxAnswerCharacters: 12_000,
  maxResponseBytes: 64 * 1024,
  functionName: 'ai-growth-assistant'
})

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue
  if (typeof value === 'boolean') return value
  return String(value).toLowerCase() === 'true'
}

function parseRequestTimeout(value) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1000 || parsed > 60_000) {
    return AI_DEFAULTS.requestTimeoutMs
  }
  return parsed
}

export function loadAiConfig(env = {}, options = {}) {
  const isEnabled = parseBoolean(env.VITE_AI_ENABLED, false)
  const connectionConfig = loadSyncConfig({
    ...env,
    VITE_SYNC_ENABLED: true
  }, options)
  const isAvailable = isEnabled && connectionConfig.isSyncAvailable
  return Object.freeze({
    isEnabled,
    isAvailable,
    configError: isEnabled ? connectionConfig.configError : null,
    supabaseUrl: connectionConfig.supabaseUrl,
    publishableKey: connectionConfig.publishableKey,
    functionName: AI_DEFAULTS.functionName,
    requestTimeoutMs: parseRequestTimeout(env.VITE_AI_REQUEST_TIMEOUT_MS),
    maxQuestionCharacters: AI_DEFAULTS.maxQuestionCharacters,
    maxAnswerCharacters: AI_DEFAULTS.maxAnswerCharacters,
    maxResponseBytes: AI_DEFAULTS.maxResponseBytes,
    clientConfig: Object.freeze({
      ...connectionConfig,
      isSyncAvailable: connectionConfig.isSyncAvailable
    })
  })
}
