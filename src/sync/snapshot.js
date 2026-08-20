import { SYNC_DEFAULTS } from '../account/config.js'
import { AppError, ERROR_CODES } from '../account/errors.js'

export const SUPPORTED_SNAPSHOT_SCHEMA_VERSION = 3

function serializeCanonicalValue(value, ancestors) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AppError(
        ERROR_CODES.INVALID_REMOTE_DATA,
        '快照包含无法序列化的数值'
      )
    }
    return JSON.stringify(value)
  }
  if (typeof value !== 'object') {
    throw new AppError(
      ERROR_CODES.INVALID_REMOTE_DATA,
      '快照包含无法序列化的字段'
    )
  }
  if (ancestors.has(value)) {
    throw new AppError(
      ERROR_CODES.INVALID_REMOTE_DATA,
      '快照不能包含循环引用'
    )
  }

  ancestors.add(value)
  let result
  if (Array.isArray(value)) {
    result = `[${value.map(item => serializeCanonicalValue(item, ancestors)).join(',')}]`
  } else {
    const entries = Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${serializeCanonicalValue(value[key], ancestors)}`)
    result = `{${entries.join(',')}}`
  }
  ancestors.delete(value)
  return result
}

export function assertSupportedSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new AppError(ERROR_CODES.INVALID_REMOTE_DATA, '快照格式无效')
  }
  if (snapshot.schemaVersion !== SUPPORTED_SNAPSHOT_SCHEMA_VERSION) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_SCHEMA,
      `不支持的快照版本：${String(snapshot.schemaVersion)}`
    )
  }
  if (!Array.isArray(snapshot.categories) || !Array.isArray(snapshot.links)) {
    throw new AppError(
      ERROR_CODES.INVALID_REMOTE_DATA,
      '快照必须包含 categories 和 links 数组'
    )
  }
  return snapshot
}

export function assertReadableSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new AppError(ERROR_CODES.INVALID_REMOTE_DATA, '快照格式无效')
  }
  if (
    !Number.isInteger(snapshot.schemaVersion) ||
    snapshot.schemaVersion < 1 ||
    snapshot.schemaVersion > SUPPORTED_SNAPSHOT_SCHEMA_VERSION
  ) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_SCHEMA,
      `不支持的快照版本：${String(snapshot.schemaVersion)}`
    )
  }
  if (!Array.isArray(snapshot.categories) || !Array.isArray(snapshot.links)) {
    throw new AppError(
      ERROR_CODES.INVALID_REMOTE_DATA,
      '快照必须包含 categories 和 links 数组'
    )
  }
  return snapshot
}

export function canonicalizeSnapshot(snapshot) {
  assertSupportedSnapshot(snapshot)
  return serializeCanonicalValue(snapshot, new Set())
}

export function canonicalizeReadableSnapshot(snapshot) {
  assertReadableSnapshot(snapshot)
  return serializeCanonicalValue(snapshot, new Set())
}

export function getUtf8ByteLength(value) {
  return new TextEncoder().encode(value).byteLength
}

function assertValidMaxBytes(maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError('maxBytes 必须是正整数')
  }
}

function assertEncodedSnapshotSize(encodedSnapshot, maxBytes) {
  assertValidMaxBytes(maxBytes)
  if (encodedSnapshot.byteLength > maxBytes) {
    throw new AppError(
      ERROR_CODES.SNAPSHOT_TOO_LARGE,
      `快照大小 ${encodedSnapshot.byteLength} bytes 超过限制 ${maxBytes} bytes`
    )
  }
  return encodedSnapshot.byteLength
}

export function assertSnapshotSize(
  canonicalSnapshot,
  maxBytes = SYNC_DEFAULTS.maxSnapshotBytes
) {
  const encodedSnapshot = new TextEncoder().encode(canonicalSnapshot)
  return assertEncodedSnapshotSize(encodedSnapshot, maxBytes)
}

function toHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function hashSnapshotBytes(encodedSnapshot, cryptoApi) {
  if (!cryptoApi?.subtle) {
    throw new AppError(
      ERROR_CODES.REMOTE_UNAVAILABLE,
      '当前运行环境不支持 Web Crypto'
    )
  }

  try {
    const digest = await cryptoApi.subtle.digest('SHA-256', encodedSnapshot)
    return toHex(new Uint8Array(digest))
  } catch (error) {
    throw new AppError(
      ERROR_CODES.REMOTE_UNAVAILABLE,
      '无法计算快照摘要',
      { cause: error }
    )
  }
}

async function prepareCanonicalSnapshot(
  canonicalJson,
  cryptoApi,
  maxBytes = SYNC_DEFAULTS.maxSnapshotBytes
) {
  const encodedSnapshot = new TextEncoder().encode(canonicalJson)
  const byteLength = assertEncodedSnapshotSize(encodedSnapshot, maxBytes)
  const hash = await hashSnapshotBytes(encodedSnapshot, cryptoApi)
  return Object.freeze({ canonicalJson, hash, byteLength })
}

export async function prepareReadableSnapshot(
  snapshot,
  { cryptoApi = globalThis.crypto } = {}
) {
  const canonicalJson = canonicalizeReadableSnapshot(snapshot)
  return prepareCanonicalSnapshot(canonicalJson, cryptoApi)
}

export async function hashCanonicalSnapshot(
  canonicalSnapshot,
  cryptoApi = globalThis.crypto
) {
  return hashSnapshotBytes(new TextEncoder().encode(canonicalSnapshot), cryptoApi)
}

export async function prepareSnapshot(snapshot, options = {}) {
  const canonicalJson = canonicalizeSnapshot(snapshot)
  return prepareCanonicalSnapshot(
    canonicalJson,
    options.cryptoApi ?? globalThis.crypto,
    options.maxBytes ?? SYNC_DEFAULTS.maxSnapshotBytes
  )
}
