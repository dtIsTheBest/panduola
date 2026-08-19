import { SYNC_DEFAULTS } from '../account/config.js'

export const DIAGNOSTIC_METRICS = Object.freeze([
  'sync_attempt_total',
  'sync_success_total',
  'sync_failure_total',
  'sync_conflict_total',
  'sync_duration_ms',
  'sync_payload_bytes',
  'dirty_age_seconds',
  'auth_failure_total',
  'local_storage_failure_total',
  'recovery_copy_total'
])

export const DIAGNOSTIC_EVENTS = Object.freeze([
  'app.initialized',
  'data_space.changed',
  'data_space.migrated',
  'auth.session_restored',
  'auth.login_succeeded',
  'auth.login_failed',
  'auth.logged_out',
  'migration.started',
  'migration.resolved',
  'sync.state_changed',
  'sync.uploaded',
  'sync.downloaded',
  'sync.conflict',
  'sync.retry_scheduled',
  'sync.stale_response_discarded',
  'storage.write_failed',
  'recovery.copy_created',
  'recovery.data_restored',
  'web_lock.acquired',
  'web_lock.released',
  'web_lock.lease_taken_over'
])

const METRIC_NAMES = new Set(DIAGNOSTIC_METRICS)
const EVENT_NAMES = new Set(DIAGNOSTIC_EVENTS)
const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error'])
const CONTEXT_NUMBER_FIELDS = [
  'durationMs',
  'payloadBytes',
  'localRevision',
  'remoteRevision'
]
const DIAGNOSTIC_STORAGE_KEY = 'panduola_diagnostics'

function truncateIdentifier(value) {
  return typeof value === 'string' && value ? value.slice(0, 8) : undefined
}

export function maskEmail(value) {
  if (typeof value !== 'string') return undefined
  const separator = value.lastIndexOf('@')
  if (separator <= 0 || separator === value.length - 1) return undefined
  const local = value.slice(0, separator)
  const domain = value.slice(separator + 1)
  return `${local.slice(0, 1)}***@${domain}`
}

export function sanitizeDiagnosticContext(context = {}) {
  const sanitized = {}
  if (typeof context.syncAttemptId === 'string') {
    sanitized.syncAttemptId = truncateIdentifier(context.syncAttemptId)
  }
  if (typeof context.errorCode === 'string') {
    sanitized.errorCode = context.errorCode.slice(0, 80)
  }
  if (typeof context.hash === 'string') sanitized.hash = truncateIdentifier(context.hash)
  if (typeof context.deviceId === 'string') {
    sanitized.deviceId = truncateIdentifier(context.deviceId)
  }
  if (typeof context.email === 'string') sanitized.email = maskEmail(context.email)

  for (const field of CONTEXT_NUMBER_FIELDS) {
    if (Number.isFinite(context[field])) sanitized[field] = context[field]
  }
  return sanitized
}

function sanitizeStoredEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : ''
  if (!Number.isFinite(Date.parse(timestamp))) return null

  return {
    timestamp,
    level: LOG_LEVELS.has(entry.level) ? entry.level : 'info',
    event: EVENT_NAMES.has(entry.event) ? entry.event : 'diagnostic.invalid_event',
    runtime: entry.runtime === 'tauri' ? 'tauri' : 'web',
    appVersion: typeof entry.appVersion === 'string'
      ? entry.appVersion.slice(0, 40)
      : 'unknown',
    ...sanitizeDiagnosticContext(entry)
  }
}

function detectRuntime() {
  const targetWindow = globalThis.window
  return targetWindow?.__TAURI_INTERNALS__ || targetWindow?.__TAURI__
    ? 'tauri'
    : 'web'
}

function getDefaultStorage() {
  try {
    return globalThis.localStorage || null
  } catch {
    return null
  }
}

function getNonNegativeInteger(value, fallback) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback
}

function getPositiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

export class DiagnosticStore {
  constructor(options = {}) {
    this.storage = options.storage === undefined ? getDefaultStorage() : options.storage
    this.storageKey = options.storageKey || DIAGNOSTIC_STORAGE_KEY
    this.maxEntries = getNonNegativeInteger(
      options.maxEntries,
      SYNC_DEFAULTS.maxDiagnosticEntries
    )
    this.retentionMs = getPositiveInteger(
      options.retentionMs,
      SYNC_DEFAULTS.diagnosticRetentionMs
    )
    this.now = options.now || (() => Date.now())
    this.runtime = options.runtime || detectRuntime()
    this.appVersion = options.appVersion || 'unknown'
    this.entries = this.loadEntries()
    this.metrics = Object.fromEntries(DIAGNOSTIC_METRICS.map(name => [name, 0]))
  }

  loadEntries() {
    if (!this.storage) return []
    try {
      const parsed = JSON.parse(this.storage.getItem(this.storageKey) || '[]')
      if (!Array.isArray(parsed)) return []
      return this.pruneEntries(parsed)
    } catch {
      return []
    }
  }

  pruneEntries(entries) {
    if (this.maxEntries === 0) return []
    const oldestTimestamp = this.now() - this.retentionMs
    return entries
      .map(sanitizeStoredEntry)
      .filter(entry => entry && Date.parse(entry.timestamp) >= oldestTimestamp)
      .slice(-this.maxEntries)
  }

  persistEntries() {
    if (!this.storage) return
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.entries))
    } catch {
      // Diagnostics must never break the primary local data path.
    }
  }

  record(level, event, context = {}) {
    const normalizedLevel = LOG_LEVELS.has(level) ? level : 'info'
    const entry = {
      timestamp: new Date(this.now()).toISOString(),
      level: normalizedLevel,
      event: EVENT_NAMES.has(event) ? event : 'diagnostic.invalid_event',
      runtime: this.runtime,
      appVersion: this.appVersion,
      ...sanitizeDiagnosticContext(context)
    }
    this.entries = this.pruneEntries([...this.entries, entry])
    this.persistEntries()
    return Object.freeze({ ...entry })
  }

  incrementMetric(name, amount = 1) {
    if (!METRIC_NAMES.has(name) || !Number.isFinite(amount)) return false
    this.metrics[name] += amount
    return true
  }

  setMetric(name, value) {
    if (!METRIC_NAMES.has(name) || !Number.isFinite(value)) return false
    this.metrics[name] = value
    return true
  }

  exportReport(status = {}) {
    const parsedLastSyncedAt = typeof status.lastSyncedAt === 'string'
      ? Date.parse(status.lastSyncedAt)
      : Number.NaN
    const safeStatus = {
      syncStatus: typeof status.syncStatus === 'string'
        ? status.syncStatus.slice(0, 40)
        : undefined,
      lastSyncedAt: Number.isFinite(parsedLastSyncedAt)
        ? new Date(parsedLastSyncedAt).toISOString()
        : undefined,
      schemaVersion: Number.isFinite(status.schemaVersion) ? status.schemaVersion : undefined,
      remoteRevision: Number.isFinite(status.remoteRevision)
        ? status.remoteRevision
        : null,
      isDirty: Boolean(status.isDirty),
      payloadBytes: Number.isFinite(status.payloadBytes) ? status.payloadBytes : undefined,
      recoveryCopyCount: Number.isFinite(status.recoveryCopyCount)
        ? status.recoveryCopyCount
        : undefined,
      isSyncConfigured: Boolean(status.isSyncConfigured)
    }

    return {
      generatedAt: new Date(this.now()).toISOString(),
      runtime: this.runtime,
      appVersion: this.appVersion,
      status: safeStatus,
      metrics: { ...this.metrics },
      logs: this.entries.map(entry => ({ ...entry }))
    }
  }
}

export function createDiagnosticStore(options) {
  return new DiagnosticStore(options)
}
