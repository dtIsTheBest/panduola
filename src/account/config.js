import { AppError, ERROR_CODES } from './errors.js'

export const SYNC_DEFAULTS = Object.freeze({
  debounceMs: 1500,
  requestTimeoutMs: 15_000,
  maxSnapshotBytes: 2 * 1024 * 1024,
  maxRetryDelayMs: 30_000,
  maxRecoveryCopies: 5,
  maxDiagnosticEntries: 200,
  diagnosticRetentionMs: 7 * 24 * 60 * 60 * 1000,
  webLockLeaseMs: 15_000,
  webLockHeartbeatMs: 5000,
  otpResendSeconds: 60
})

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue
  if (typeof value === 'boolean') return value
  return String(value).toLowerCase() === 'true'
}

function parseUrl(value, { allowHttpLocalhost = false } = {}) {
  if (!value) return null

  try {
    const url = new URL(String(value))
    const isLocalHttp = allowHttpLocalhost &&
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    if (url.protocol !== 'https:' && !isLocalHttp) return null
    return url.origin
  } catch {
    return null
  }
}

function decodeJwtPayload(value) {
  const parts = String(value).split('.')
  if (parts.length !== 3 || typeof globalThis.atob !== 'function') return null

  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - normalized.length % 4) % 4)
    return JSON.parse(globalThis.atob(normalized + padding))
  } catch {
    return null
  }
}

export function isPrivilegedSupabaseKey(value) {
  if (!value) return false
  const normalized = String(value).toLowerCase()
  if (normalized.startsWith('sb_secret_') || normalized.includes('service_role')) return true
  return decodeJwtPayload(value)?.role === 'service_role'
}

export function isPublishableSupabaseKey(value) {
  if (!value) return false
  const normalized = String(value).trim()
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(normalized)) return true
  return decodeJwtPayload(normalized)?.role === 'anon'
}

export function loadSyncConfig(
  env = {},
  { isProduction = false } = {}
) {
  const isSyncEnabled = parseBoolean(env.VITE_SYNC_ENABLED, true)
  const supabaseUrl = parseUrl(env.VITE_SUPABASE_URL, {
    allowHttpLocalhost: !isProduction
  })
  const publishableKey = typeof env.VITE_SUPABASE_PUBLISHABLE_KEY === 'string'
    ? env.VITE_SUPABASE_PUBLISHABLE_KEY.trim()
    : ''
  const isTelemetryEnabled = parseBoolean(env.VITE_TELEMETRY_ENABLED, false)
  const telemetryEndpoint = parseUrl(env.VITE_TELEMETRY_ENDPOINT, {
    allowHttpLocalhost: !isProduction
  })

  let configError = null
  if (isSyncEnabled && isPrivilegedSupabaseKey(publishableKey)) {
    configError = new AppError(
      ERROR_CODES.CONFIG_MISSING,
      '前端配置不能使用 Supabase 特权密钥'
    )
  } else if (isSyncEnabled && (
    !supabaseUrl ||
    !isPublishableSupabaseKey(publishableKey)
  )) {
    configError = new AppError(
      ERROR_CODES.CONFIG_MISSING,
      '云同步配置不完整或公开密钥无效，本地功能仍可正常使用'
    )
  }

  return Object.freeze({
    isSyncEnabled,
    isSyncAvailable: isSyncEnabled && !configError,
    supabaseUrl,
    publishableKey,
    isTelemetryEnabled: isTelemetryEnabled && Boolean(telemetryEndpoint),
    telemetryEndpoint,
    configError,
    defaults: SYNC_DEFAULTS
  })
}
