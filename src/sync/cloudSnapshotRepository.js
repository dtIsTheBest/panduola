import { AppError, ERROR_CODES } from '../account/errors.js'
import { SYNC_DEFAULTS } from '../account/config.js'
import {
  assertSnapshotSize,
  assertSupportedSnapshot,
  canonicalizeSnapshot,
  prepareReadableSnapshot,
  prepareSnapshot,
  SUPPORTED_SNAPSHOT_SCHEMA_VERSION
} from './snapshot.js'

const SNAPSHOT_READ_COLUMNS = [
  'schema_version',
  'payload',
  'payload_hash',
  'revision',
  'updated_at',
  'updated_by_device'
].join(',')
const SNAPSHOT_WRITE_COLUMNS = [
  'schema_version',
  'payload_hash',
  'revision',
  'updated_at',
  'updated_by_device'
].join(',')
const HASH_PATTERN = /^[0-9a-f]{64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function resolveGetClient({ client, clientProvider }) {
  if (client) return async () => client
  if (typeof clientProvider?.getClient === 'function') {
    return () => clientProvider.getClient()
  }
  throw new TypeError('云端快照仓库需要 Supabase client 或 clientProvider')
}

function getErrorText(error) {
  return `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase()
}

function isOffline(error) {
  return globalThis.navigator?.onLine === false ||
    error instanceof TypeError ||
    getErrorText(error).includes('fetch')
}

function isTimeout(error) {
  return error?.name === 'TimeoutError' ||
    getErrorText(error).includes('timed out')
}

function mapRemoteError(error, { conflictOnDuplicate = false } = {}) {
  if (error instanceof AppError) return error

  const status = Number(error?.status)
  const text = getErrorText(error)
  if (conflictOnDuplicate && (
    status === 409 ||
    error?.code === '23505' ||
    text.includes('duplicate')
  )) {
    return new AppError(
      ERROR_CODES.REVISION_CONFLICT,
      '云端快照已由其他客户端创建',
      { cause: error }
    )
  }
  if (isTimeout(error)) {
    return new AppError(
      ERROR_CODES.REMOTE_UNAVAILABLE,
      '云端快照请求超时',
      { cause: error, retryable: true }
    )
  }
  if (isOffline(error)) {
    return new AppError(ERROR_CODES.OFFLINE, '当前网络不可用', {
      cause: error,
      retryable: true
    })
  }
  if (
    status === 401 ||
    status === 403 ||
    error?.code === '42501' ||
    text.includes('row-level security')
  ) {
    return new AppError(ERROR_CODES.UNAUTHORIZED, '没有访问云端快照的权限', {
      cause: error
    })
  }
  return new AppError(ERROR_CODES.REMOTE_UNAVAILABLE, '云端快照服务暂时不可用', {
    cause: error,
    retryable: !Number.isFinite(status) || status === 429 || status >= 500
  })
}

function parseRevision(value) {
  const revision = typeof value === 'string' ? Number(value) : value
  if (!Number.isSafeInteger(revision) || revision <= 0) {
    throw new AppError(
      ERROR_CODES.INVALID_REMOTE_DATA,
      '云端快照 revision 无效'
    )
  }
  return revision
}

function parseUpdatedAt(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new AppError(
      ERROR_CODES.INVALID_REMOTE_DATA,
      '云端快照更新时间无效'
    )
  }
  return value
}

async function validateRemoteRow(row, normalizeSnapshot, cryptoApi) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new AppError(ERROR_CODES.INVALID_REMOTE_DATA, '云端快照记录无效')
  }

  if (row.schema_version !== row.payload?.schemaVersion) {
    throw new AppError(
      ERROR_CODES.INVALID_REMOTE_DATA,
      '云端快照 Schema 元数据不一致'
    )
  }
  if (!HASH_PATTERN.test(String(row.payload_hash))) {
    throw new AppError(
      ERROR_CODES.INVALID_REMOTE_DATA,
      '云端快照 hash 格式无效'
    )
  }
  if (!UUID_PATTERN.test(String(row.updated_by_device))) {
    throw new AppError(
      ERROR_CODES.INVALID_REMOTE_DATA,
      '云端快照设备标识无效'
    )
  }

  const originalPrepared = await prepareReadableSnapshot(row.payload, { cryptoApi })
  if (originalPrepared.hash !== row.payload_hash) {
    throw new AppError(
      ERROR_CODES.REMOTE_DATA_CORRUPTED,
      '云端快照完整性校验失败'
    )
  }

  let snapshot
  try {
    snapshot = normalizeSnapshot(row.payload)
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(
      ERROR_CODES.INVALID_REMOTE_DATA,
      '云端快照未通过业务数据校验',
      { cause: error }
    )
  }

  assertSupportedSnapshot(snapshot)
  if (row.schema_version === SUPPORTED_SNAPSHOT_SCHEMA_VERSION) {
    const normalizedPrepared = await prepareSnapshot(snapshot, { cryptoApi })
    if (normalizedPrepared.hash !== originalPrepared.hash) {
      throw new AppError(
        ERROR_CODES.INVALID_REMOTE_DATA,
        '当前 Schema 的云端快照未规范化'
      )
    }
  } else {
    assertSnapshotSize(canonicalizeSnapshot(snapshot))
  }

  return Object.freeze({
    snapshot,
    revision: parseRevision(row.revision),
    payloadHash: originalPrepared.hash,
    updatedAt: parseUpdatedAt(row.updated_at),
    updatedByDevice: String(row.updated_by_device).toLowerCase()
  })
}

function validateWriteMetadata(row, expectedHash) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new AppError(ERROR_CODES.INVALID_REMOTE_DATA, '云端写入结果无效')
  }
  if (
    row.schema_version !== undefined &&
    row.schema_version !== SUPPORTED_SNAPSHOT_SCHEMA_VERSION
  ) {
    throw new AppError(
      ERROR_CODES.INVALID_REMOTE_DATA,
      '云端写入结果的 Schema 无效'
    )
  }
  if (row.payload_hash !== expectedHash) {
    throw new AppError(
      ERROR_CODES.REMOTE_DATA_CORRUPTED,
      '云端写入结果的 hash 不一致'
    )
  }
  if (!UUID_PATTERN.test(String(row.updated_by_device))) {
    throw new AppError(
      ERROR_CODES.INVALID_REMOTE_DATA,
      '云端快照设备标识无效'
    )
  }
  return Object.freeze({
    revision: parseRevision(row.revision),
    payloadHash: expectedHash,
    updatedAt: parseUpdatedAt(row.updated_at),
    updatedByDevice: String(row.updated_by_device).toLowerCase()
  })
}

function validateExpectedRevision(expectedRevision) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision <= 0) {
    throw new TypeError('expectedRevision 必须是正安全整数')
  }
}

function getRpcRow(data) {
  if (Array.isArray(data)) return data[0] ?? null
  return data ?? null
}

async function runWithDeadline(timeoutMs, request) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('requestTimeoutMs 必须是正整数')
  }

  const controller = new AbortController()
  let didTimeout = false
  const timeoutId = globalThis.setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)
  try {
    return await request(controller.signal)
  } catch (error) {
    if (!didTimeout) throw error
    const timeoutError = new Error('Supabase operation timed out', {
      cause: error
    })
    timeoutError.name = 'TimeoutError'
    throw timeoutError
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

export function createCloudSnapshotRepository({
  client,
  clientProvider,
  deviceId,
  normalizeSnapshot,
  cryptoApi = globalThis.crypto,
  requestTimeoutMs = SYNC_DEFAULTS.requestTimeoutMs
} = {}) {
  const getClient = resolveGetClient({ client, clientProvider })
  if (!UUID_PATTERN.test(String(deviceId))) {
    throw new TypeError('deviceId 必须是 UUID')
  }
  if (typeof normalizeSnapshot !== 'function') {
    throw new TypeError('normalizeSnapshot 必须是函数')
  }
  const normalizedDeviceId = String(deviceId).toLowerCase()

  async function prepareLocalSnapshot(snapshot) {
    assertSupportedSnapshot(snapshot)
    let normalized
    try {
      normalized = normalizeSnapshot(snapshot)
    } catch (error) {
      if (error instanceof AppError) throw error
      throw new AppError(
        ERROR_CODES.INVALID_REMOTE_DATA,
        '本地快照未通过业务数据校验',
        { cause: error }
      )
    }
    assertSupportedSnapshot(normalized)
    const prepared = await prepareSnapshot(normalized, { cryptoApi })
    return { normalized, prepared }
  }

  async function load() {
    const supabase = await getClient()
    let result
    try {
      result = await runWithDeadline(requestTimeoutMs, signal => (
        supabase
          .from('user_snapshots')
          .select(SNAPSHOT_READ_COLUMNS)
          .abortSignal(signal)
          .maybeSingle()
      ))
    } catch (error) {
      throw mapRemoteError(error)
    }
    if (result.error) throw mapRemoteError(result.error)
    if (!result.data) return null
    return validateRemoteRow(result.data, normalizeSnapshot, cryptoApi)
  }

  async function create(snapshot) {
    const { normalized, prepared } = await prepareLocalSnapshot(snapshot)
    const supabase = await getClient()
    let result
    try {
      result = await runWithDeadline(requestTimeoutMs, signal => (
        supabase
          .from('user_snapshots')
          .insert({
            schema_version: normalized.schemaVersion,
            payload: normalized,
            payload_hash: prepared.hash,
            updated_by_device: normalizedDeviceId
          })
          .select(SNAPSHOT_WRITE_COLUMNS)
          .abortSignal(signal)
          .single()
      ))
    } catch (error) {
      throw mapRemoteError(error, { conflictOnDuplicate: true })
    }
    if (result.error) {
      throw mapRemoteError(result.error, { conflictOnDuplicate: true })
    }
    return Object.freeze({
      snapshot: normalized,
      ...validateWriteMetadata(result.data, prepared.hash)
    })
  }

  async function compareAndSwap(expectedRevision, snapshot) {
    validateExpectedRevision(expectedRevision)
    const { normalized, prepared } = await prepareLocalSnapshot(snapshot)
    const supabase = await getClient()
    let result
    try {
      result = await runWithDeadline(requestTimeoutMs, signal => (
        supabase
          .rpc('compare_and_swap_user_snapshot', {
            expected_revision: expectedRevision,
            new_schema_version: normalized.schemaVersion,
            new_payload: normalized,
            new_payload_hash: prepared.hash,
            new_updated_by_device: normalizedDeviceId
          })
          .abortSignal(signal)
      ))
    } catch (error) {
      throw mapRemoteError(error)
    }
    if (result.error) throw mapRemoteError(result.error)

    const row = getRpcRow(result.data)
    if (!row?.succeeded) {
      throw new AppError(
        ERROR_CODES.REVISION_CONFLICT,
        '云端快照版本已变化'
      )
    }
    return Object.freeze({
      snapshot: normalized,
      ...validateWriteMetadata(row, prepared.hash)
    })
  }

  return Object.freeze({ load, create, compareAndSwap })
}
