import {
  SUPPORTED_SNAPSHOT_SCHEMA_VERSION,
  assertSnapshotSize,
  assertSupportedSnapshot,
  canonicalizeSnapshot
} from '../sync/snapshot.js'
import { AppError, ERROR_CODES } from '../account/errors.js'
import { createCrossTabLock } from '../sync/crossTabLock.js'

export const LOCAL_FORMAT_VERSION = 1
export const GUEST_SPACE_KEY = 'guest'

const SPACE_STORAGE_PREFIX = 'panduola_space:'
const SYNC_STORAGE_PREFIX = 'panduola_sync:'
const RECOVERY_STORAGE_PREFIX = 'panduola_recoveries:'
const QUARANTINE_STORAGE_PREFIX = 'panduola_quarantine:'
const DEVICE_STORAGE_KEY = 'panduola_device'
const LEGACY_STORAGE_KEY = 'panduola_data'
const MAX_RECOVERY_COPIES = 5
const RECOVERY_REASONS = new Set([
  'first-login',
  'revision-conflict',
  'manual-import'
])
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function storageError(message, cause) {
  const detail =
    cause instanceof Error && cause.message
      ? `：${cause.message}`
      : typeof cause === 'string' && cause
        ? `：${cause}`
        : ''
  return new AppError(
    ERROR_CODES.LOCAL_STORAGE_FAILED,
    `${message}${detail}`,
    { cause }
  )
}

function corruptedDataError(message, cause) {
  return new AppError(ERROR_CODES.LOCAL_DATA_CORRUPTED, message, { cause })
}

function tauriCommandError(message, cause) {
  const rawMessage =
    typeof cause === 'string'
      ? cause
      : cause instanceof Error
        ? cause.message
        : ''
  const nativeCode = rawMessage.split(':', 1)[0]
  const code = {
    LOCAL_DATA_CORRUPTED: ERROR_CODES.LOCAL_DATA_CORRUPTED,
    LOCAL_STORAGE_FAILED: ERROR_CODES.LOCAL_STORAGE_FAILED,
    CREDENTIAL_STORAGE_UNAVAILABLE:
      ERROR_CODES.CREDENTIAL_STORAGE_UNAVAILABLE,
    INVALID_OWNER_KEY: ERROR_CODES.INVALID_REMOTE_DATA,
    INVALID_QUARANTINE_KIND: ERROR_CODES.INVALID_REMOTE_DATA
  }[nativeCode] ?? ERROR_CODES.LOCAL_STORAGE_FAILED
  return new AppError(code, rawMessage ? `${message}：${rawMessage}` : message, {
    cause
  })
}

function isAppErrorWithCode(error, code) {
  return error instanceof AppError && error.code === code
}

function defaultNow() {
  return new Date()
}

function createUuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

export function toUserSpaceKey(userId) {
  if (!UUID_PATTERN.test(userId)) {
    throw new TypeError('用户标识格式无效')
  }
  return `user:${userId.toLowerCase()}`
}

export function assertValidSpaceKey(spaceKey) {
  if (spaceKey === GUEST_SPACE_KEY) return spaceKey
  if (
    typeof spaceKey === 'string' &&
    spaceKey.startsWith('user:') &&
    UUID_PATTERN.test(spaceKey.slice(5))
  ) {
    return spaceKey.toLowerCase()
  }
  throw new TypeError('数据空间标识无效')
}

function normalizeSyncMetadata(value = {}) {
  const remoteRevision = value.remoteRevision
  const normalizedRevision =
    Number.isInteger(remoteRevision) && remoteRevision > 0 ? remoteRevision : null

  return {
    remoteRevision: normalizedRevision,
    dirty: value.dirty === true,
    lastSyncedHash:
      typeof value.lastSyncedHash === 'string' && value.lastSyncedHash
        ? value.lastSyncedHash
        : null,
    lastSyncedAt:
      typeof value.lastSyncedAt === 'string' && value.lastSyncedAt
        ? value.lastSyncedAt
        : null
  }
}

function validateSyncMetadata(value) {
  const validRevision =
    value?.remoteRevision === null ||
    (Number.isInteger(value?.remoteRevision) && value.remoteRevision > 0)
  const validHash =
    value?.lastSyncedHash === null ||
    typeof value?.lastSyncedHash === 'string'
  const validTimestamp =
    value?.lastSyncedAt === null ||
    typeof value?.lastSyncedAt === 'string'
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !validRevision ||
    typeof value.dirty !== 'boolean' ||
    !validHash ||
    !validTimestamp
  ) {
    throw corruptedDataError('本地同步元数据无效')
  }
  return normalizeSyncMetadata(value)
}

function createEnvelope(
  spaceKey,
  snapshot,
  now,
  sync = {},
  localRevision = 0
) {
  return {
    localFormatVersion: LOCAL_FORMAT_VERSION,
    localRevision,
    ownerKey: spaceKey,
    snapshot,
    sync: normalizeSyncMetadata(sync),
    updatedAt: now().toISOString()
  }
}

function validateEnvelope(rawEnvelope, expectedSpaceKey, normalizeSnapshot) {
  if (!rawEnvelope || typeof rawEnvelope !== 'object' || Array.isArray(rawEnvelope)) {
    throw corruptedDataError('本地数据空间格式无效')
  }

  if (rawEnvelope.localFormatVersion > LOCAL_FORMAT_VERSION) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_SCHEMA,
      '本地数据由更高版本应用创建，请升级后再试'
    )
  }
  if (rawEnvelope.localFormatVersion !== LOCAL_FORMAT_VERSION) {
    throw corruptedDataError('本地数据空间版本无效')
  }
  if (rawEnvelope.ownerKey !== expectedSpaceKey) {
    throw corruptedDataError('本地数据空间归属不匹配')
  }
  const localRevision = rawEnvelope.localRevision ?? 0
  if (!Number.isSafeInteger(localRevision) || localRevision < 0) {
    throw corruptedDataError('本地数据空间 revision 无效')
  }

  const snapshot = validateSnapshot(rawEnvelope.snapshot, normalizeSnapshot)

  return {
    localFormatVersion: LOCAL_FORMAT_VERSION,
    localRevision,
    ownerKey: expectedSpaceKey,
    snapshot,
    sync: validateSyncMetadata(rawEnvelope.sync),
    updatedAt:
      typeof rawEnvelope.updatedAt === 'string'
        ? rawEnvelope.updatedAt
        : new Date(0).toISOString()
  }
}

function validateSnapshot(rawSnapshot, normalizeSnapshot) {
  if (
    Number.isInteger(rawSnapshot?.schemaVersion) &&
    rawSnapshot.schemaVersion > SUPPORTED_SNAPSHOT_SCHEMA_VERSION
  ) {
    throw new AppError(
      ERROR_CODES.UNSUPPORTED_SCHEMA,
      `不支持的快照版本：${rawSnapshot.schemaVersion}`
    )
  }
  const snapshot = normalizeSnapshot(rawSnapshot)
  assertSupportedSnapshot(snapshot)
  assertSnapshotSize(canonicalizeSnapshot(snapshot))
  return snapshot
}

function parseJson(rawValue, message) {
  try {
    return JSON.parse(rawValue)
  } catch (error) {
    throw corruptedDataError(message, error)
  }
}

function getWebStorage(providedStorage) {
  try {
    const storage = providedStorage ?? globalThis.localStorage
    if (!storage) {
      throw storageError('当前环境不支持本地数据存储')
    }
    return storage
  } catch (error) {
    if (error instanceof AppError) throw error
    throw storageError('无法访问本地数据存储', error)
  }
}

export function createDataSpaceRepository({
  storage: providedStorage,
  normalizeSnapshot,
  isTauri = false,
  getInvoke,
  crossTabLock: providedCrossTabLock,
  now = defaultNow,
  randomUUID = createUuid
} = {}) {
  if (typeof normalizeSnapshot !== 'function') {
    throw new TypeError('缺少数据标准化函数')
  }

  const syncMetadataCache = new Map()
  const localRevisionCache = new Map()
  const crossTabLock = providedCrossTabLock ?? createCrossTabLock({
    storage: providedStorage
  })
  let quarantineSequence = 0

  function spaceStorageKey(spaceKey) {
    return `${SPACE_STORAGE_PREFIX}${spaceKey}`
  }

  function recoveryStorageKey(spaceKey) {
    return `${RECOVERY_STORAGE_PREFIX}${spaceKey}`
  }

  function syncStorageKey(spaceKey) {
    return `${SYNC_STORAGE_PREFIX}${spaceKey}`
  }

  function readStorageItem(storage, key, message = '读取本地数据失败') {
    try {
      return storage.getItem(key)
    } catch (error) {
      throw storageError(message, error)
    }
  }

  function parseRecoveryCopies(rawValue) {
    if (!rawValue) return []

    const parsed = parseJson(rawValue, '恢复副本数据已损坏')
    if (!Array.isArray(parsed)) {
      throw corruptedDataError('恢复副本格式无效')
    }

    return parsed
      .map(copy => {
        if (!copy || typeof copy !== 'object') return null
        try {
          return {
            id: typeof copy.id === 'string' ? copy.id : randomUUID(),
            reason: typeof copy.reason === 'string' ? copy.reason : 'unknown',
            createdAt:
              typeof copy.createdAt === 'string'
                ? copy.createdAt
                : new Date(0).toISOString(),
            source: copy.source === 'cloud' ? 'cloud' : 'local',
            remoteRevision:
              Number.isInteger(copy.remoteRevision) && copy.remoteRevision > 0
                ? copy.remoteRevision
                : null,
            snapshot: validateSnapshot(copy.snapshot, normalizeSnapshot)
          }
        } catch (error) {
          if (isAppErrorWithCode(error, ERROR_CODES.UNSUPPORTED_SCHEMA)) throw error
          return null
        }
      })
      .filter(Boolean)
      .slice(-MAX_RECOVERY_COPIES)
  }

  function readRecoveryCopies(storage, spaceKey) {
    const key = recoveryStorageKey(spaceKey)
    const rawValue = readStorageItem(storage, key, '读取恢复副本失败')
    return parseRecoveryCopies(rawValue)
  }

  function quarantine(storage, storageKey, rawValue, spaceKey) {
    const timestamp = now().toISOString().replace(/[:.]/g, '-')
    quarantineSequence += 1
    const kind = storageKey.startsWith(RECOVERY_STORAGE_PREFIX)
      ? 'recovery'
      : storageKey.startsWith(SYNC_STORAGE_PREFIX)
        ? 'sync'
      : storageKey === LEGACY_STORAGE_KEY
        ? 'legacy'
        : 'space'
    const quarantineKey =
      `${QUARANTINE_STORAGE_PREFIX}${spaceKey}:${kind}:${timestamp}:${quarantineSequence}`
    try {
      storage.setItem(
        quarantineKey,
        JSON.stringify({
          storageKey,
          quarantinedAt: now().toISOString(),
          rawValue
        })
      )
    } catch (error) {
      throw corruptedDataError('损坏数据无法安全隔离，已停止覆盖本地数据', error)
    }
  }

  function readWebSyncMetadata(
    storage,
    spaceKey,
    localRevision,
    fallback = {}
  ) {
    const key = syncStorageKey(spaceKey)
    const rawValue = readStorageItem(storage, key, '读取本地同步元数据失败')
    if (!rawValue) return normalizeSyncMetadata(fallback)
    try {
      const record = parseJson(rawValue, '本地同步元数据已损坏')
      if (record.localRevision !== localRevision) {
        return normalizeSyncMetadata(fallback)
      }
      return validateSyncMetadata(record)
    } catch (error) {
      quarantine(storage, key, rawValue, spaceKey)
      try {
        storage.removeItem(key)
      } catch {
        // The quarantined copy remains available even if the invalid source cannot be removed.
      }
      return normalizeSyncMetadata(fallback)
    }
  }

  function readPersistedLocalRevision(storage, spaceKey) {
    const rawValue = readStorageItem(
      storage,
      spaceStorageKey(spaceKey),
      '读取本地数据 revision 失败'
    )
    if (!rawValue) return 0
    const envelope = parseJson(rawValue, '本地数据空间已损坏')
    if (
      envelope?.ownerKey !== spaceKey ||
      envelope.localFormatVersion !== LOCAL_FORMAT_VERSION
    ) {
      throw corruptedDataError('本地数据空间格式无效')
    }
    const localRevision = envelope.localRevision ?? 0
    if (!Number.isSafeInteger(localRevision) || localRevision < 0) {
      throw corruptedDataError('本地数据空间 revision 无效')
    }
    return localRevision
  }

  function loadLegacySnapshot(storage) {
    const legacyRaw = readStorageItem(storage, LEGACY_STORAGE_KEY)
    if (!legacyRaw) return null
    try {
      const legacyValue = parseJson(legacyRaw, '旧版本地数据已损坏')
      return validateSnapshot(legacyValue, normalizeSnapshot)
    } catch (error) {
      if (
        isAppErrorWithCode(error, ERROR_CODES.UNSUPPORTED_SCHEMA) ||
        isAppErrorWithCode(error, ERROR_CODES.LOCAL_STORAGE_FAILED)
      ) {
        throw error
      }
      quarantine(storage, LEGACY_STORAGE_KEY, legacyRaw, GUEST_SPACE_KEY)
      return null
    }
  }

  function migrateLegacyGuest(storage) {
    const snapshot = loadLegacySnapshot(storage)
    if (!snapshot) return null

    const envelope = createEnvelope(GUEST_SPACE_KEY, snapshot, now)
    try {
      storage.setItem(spaceStorageKey(GUEST_SPACE_KEY), JSON.stringify(envelope))
    } catch (error) {
      throw storageError('旧版数据迁移失败，原数据已保留', error)
    }
    syncMetadataCache.set(GUEST_SPACE_KEY, envelope.sync)
    localRevisionCache.set(GUEST_SPACE_KEY, envelope.localRevision)
    return envelope
  }

  function recoverCorruptedSpace(storage, spaceKey, storageKey, rawValue) {
    quarantine(storage, storageKey, rawValue, spaceKey)

    try {
      const recoveries = readRecoveryCopies(storage, spaceKey)
      const latest = recoveries[recoveries.length - 1]
      if (latest) {
        const envelope = createEnvelope(spaceKey, latest.snapshot, now, {
          remoteRevision: latest.remoteRevision,
          dirty: latest.source !== 'cloud'
        })
        try {
          storage.setItem(storageKey, JSON.stringify(envelope))
        } catch (error) {
          throw storageError('恢复本地数据失败', error)
        }
        syncMetadataCache.set(spaceKey, envelope.sync)
        localRevisionCache.set(spaceKey, envelope.localRevision)
        return envelope
      }
    } catch (error) {
      if (
        isAppErrorWithCode(error, ERROR_CODES.UNSUPPORTED_SCHEMA) ||
        isAppErrorWithCode(error, ERROR_CODES.LOCAL_STORAGE_FAILED)
      ) {
        throw error
      }
      const recoveryKey = recoveryStorageKey(spaceKey)
      const recoveryRaw = readStorageItem(
        storage,
        recoveryKey,
        '读取损坏的恢复副本失败'
      )
      if (recoveryRaw) quarantine(storage, recoveryKey, recoveryRaw, spaceKey)
    }

    if (spaceKey === GUEST_SPACE_KEY) {
      const migrated = migrateLegacyGuest(storage)
      if (migrated) return migrated
    }
    try {
      storage.removeItem(storageKey)
    } catch (error) {
      throw storageError('移除已隔离的损坏数据失败', error)
    }
    syncMetadataCache.delete(spaceKey)
    localRevisionCache.delete(spaceKey)
    return null
  }

  async function getTauriInvoke() {
    if (typeof getInvoke !== 'function') {
      throw storageError('桌面端存储接口不可用')
    }
    try {
      const invoke = await getInvoke()
      if (typeof invoke !== 'function') {
        throw storageError('桌面端存储接口不可用')
      }
      return invoke
    } catch (error) {
      if (error instanceof AppError) throw error
      throw storageError('桌面端存储接口不可用', error)
    }
  }

  async function invokeTauri(invoke, command, args, message) {
    try {
      return await invoke(command, args)
    } catch (error) {
      if (error instanceof AppError) throw error
      throw tauriCommandError(message, error)
    }
  }

  function unpackTauriReadResult(result) {
    if (typeof result === 'string') {
      return { data: result, quarantined: false }
    }
    return {
      data: typeof result?.data === 'string' ? result.data : '',
      quarantined: result?.quarantined === true
    }
  }

  async function migrateLegacyGuestFromTauri(invoke) {
    const legacyResult = unpackTauriReadResult(
      await invokeTauri(
        invoke,
        'read_legacy_data_file',
        undefined,
        '读取桌面端旧版数据失败'
      )
    )
    if (legacyResult.quarantined) return null
    const legacyRaw = legacyResult.data
    if (!legacyRaw) return null

    let snapshot
    try {
      snapshot = validateSnapshot(
        parseJson(legacyRaw, '桌面端旧版数据已损坏'),
        normalizeSnapshot
      )
    } catch (error) {
      if (isAppErrorWithCode(error, ERROR_CODES.UNSUPPORTED_SCHEMA)) throw error
      await invokeTauri(
        invoke,
        'quarantine_data_file',
        {
          ownerKey: GUEST_SPACE_KEY,
          kind: 'legacy'
        },
        '隔离桌面端旧版数据失败'
      )
      return null
    }

    const envelope = createEnvelope(GUEST_SPACE_KEY, snapshot, now)
    await invokeTauri(
      invoke,
      'save_space_file',
      {
        ownerKey: GUEST_SPACE_KEY,
        data: JSON.stringify(envelope)
      },
      '迁移桌面端旧版数据失败'
    )
    syncMetadataCache.set(GUEST_SPACE_KEY, envelope.sync)
    localRevisionCache.set(GUEST_SPACE_KEY, envelope.localRevision)
    return envelope
  }

  async function recoverCorruptedTauriSpace(
    invoke,
    spaceKey,
    { alreadyQuarantined = false } = {}
  ) {
    if (!alreadyQuarantined) {
      await invokeTauri(
        invoke,
        'quarantine_data_file',
        { ownerKey: spaceKey, kind: 'space' },
        '隔离桌面端损坏数据失败'
      )
    }

    const recoveryResult = unpackTauriReadResult(
      await invokeTauri(
        invoke,
        'read_recovery_file',
        { ownerKey: spaceKey },
        '读取桌面端恢复副本失败'
      )
    )
    const recoveryRaw = recoveryResult.quarantined ? '' : recoveryResult.data
    if (recoveryRaw) {
      let copies
      try {
        copies = parseRecoveryCopies(recoveryRaw)
      } catch (error) {
        if (isAppErrorWithCode(error, ERROR_CODES.UNSUPPORTED_SCHEMA)) throw error
        await invokeTauri(
          invoke,
          'quarantine_data_file',
          { ownerKey: spaceKey, kind: 'recovery' },
          '隔离桌面端损坏恢复副本失败'
        )
        copies = []
      }

      const latest = copies[copies.length - 1]
      if (latest) {
        const envelope = createEnvelope(spaceKey, latest.snapshot, now, {
          remoteRevision: latest.remoteRevision,
          dirty: latest.source !== 'cloud'
        })
        await invokeTauri(
          invoke,
          'save_space_file',
          { ownerKey: spaceKey, data: JSON.stringify(envelope) },
          '恢复桌面端数据失败'
        )
        syncMetadataCache.set(spaceKey, envelope.sync)
        localRevisionCache.set(spaceKey, envelope.localRevision)
        return envelope
      }
    }

    if (spaceKey === GUEST_SPACE_KEY) {
      const migrated = await migrateLegacyGuestFromTauri(invoke)
      if (migrated) return migrated
    }
    syncMetadataCache.delete(spaceKey)
    localRevisionCache.delete(spaceKey)
    return null
  }

  async function loadFromTauri(spaceKey) {
    const invoke = await getTauriInvoke()
    const readResult = unpackTauriReadResult(
      await invokeTauri(
        invoke,
        'read_space_file',
        { ownerKey: spaceKey },
        '读取桌面端本地数据失败'
      )
    )
    if (readResult.quarantined) {
      return recoverCorruptedTauriSpace(invoke, spaceKey, {
        alreadyQuarantined: true
      })
    }
    const savedData = readResult.data
    if (!savedData) {
      syncMetadataCache.delete(spaceKey)
      localRevisionCache.delete(spaceKey)
      return spaceKey === GUEST_SPACE_KEY
        ? migrateLegacyGuestFromTauri(invoke)
        : null
    }

    try {
      const envelope = validateEnvelope(
        parseJson(savedData, '桌面端本地数据已损坏'),
        spaceKey,
        normalizeSnapshot
      )
      syncMetadataCache.set(spaceKey, envelope.sync)
      localRevisionCache.set(spaceKey, envelope.localRevision)
      return clone(envelope)
    } catch (error) {
      if (isAppErrorWithCode(error, ERROR_CODES.UNSUPPORTED_SCHEMA)) throw error
      return recoverCorruptedTauriSpace(invoke, spaceKey)
    }
  }

  async function load(spaceKey) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    if (isTauri) return loadFromTauri(normalizedSpaceKey)

    const storage = getWebStorage(providedStorage)
    const key = spaceStorageKey(normalizedSpaceKey)
    const rawValue = readStorageItem(storage, key)

    if (!rawValue) {
      syncMetadataCache.delete(normalizedSpaceKey)
      localRevisionCache.delete(normalizedSpaceKey)
      return normalizedSpaceKey === GUEST_SPACE_KEY
        ? migrateLegacyGuest(storage)
        : null
    }

    try {
      const envelope = validateEnvelope(
        parseJson(rawValue, '本地数据空间已损坏'),
        normalizedSpaceKey,
        normalizeSnapshot
      )
      envelope.sync = readWebSyncMetadata(
        storage,
        normalizedSpaceKey,
        envelope.localRevision,
        envelope.sync
      )
      syncMetadataCache.set(normalizedSpaceKey, envelope.sync)
      localRevisionCache.set(normalizedSpaceKey, envelope.localRevision)
      return clone(envelope)
    } catch (error) {
      if (
        isAppErrorWithCode(error, ERROR_CODES.UNSUPPORTED_SCHEMA) ||
        isAppErrorWithCode(error, ERROR_CODES.LOCAL_STORAGE_FAILED)
      ) {
        throw error
      }
      return recoverCorruptedSpace(storage, normalizedSpaceKey, key, rawValue)
    }
  }

  async function saveToTauri(spaceKey, envelope) {
    const invoke = await getTauriInvoke()
    await invokeTauri(
      invoke,
      'save_space_file',
      { ownerKey: spaceKey, data: JSON.stringify(envelope) },
      '保存桌面端本地数据失败'
    )
  }

  async function save(spaceKey, rawSnapshot, { sync } = {}) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    const snapshot = validateSnapshot(rawSnapshot, normalizeSnapshot)
    const existingSync = syncMetadataCache.get(normalizedSpaceKey)
    let envelope

    if (isTauri) {
      const localRevision = (localRevisionCache.get(normalizedSpaceKey) ?? 0) + 1
      envelope = createEnvelope(
        normalizedSpaceKey,
        snapshot,
        now,
        sync ? { ...existingSync, ...sync } : existingSync,
        localRevision
      )
      await saveToTauri(normalizedSpaceKey, envelope)
    } else {
      envelope = await crossTabLock.runExclusive(
        `local-space:${normalizedSpaceKey}`,
        async () => {
          const storage = getWebStorage(providedStorage)
          const persistedRevision = readPersistedLocalRevision(
            storage,
            normalizedSpaceKey
          )
          const expectedRevision = localRevisionCache.get(normalizedSpaceKey)
            ?? persistedRevision
          if (persistedRevision !== expectedRevision) {
            throw new AppError(
              ERROR_CODES.LOCAL_REVISION_CONFLICT,
              '其他标签页已更新当前数据，已停止覆盖'
            )
          }
          const persistedSync = readWebSyncMetadata(
            storage,
            normalizedSpaceKey,
            persistedRevision,
            existingSync
          )
          const nextEnvelope = createEnvelope(
            normalizedSpaceKey,
            snapshot,
            now,
            sync ? { ...persistedSync, ...sync } : persistedSync,
            persistedRevision + 1
          )
          try {
            storage.setItem(
              spaceStorageKey(normalizedSpaceKey),
              JSON.stringify(nextEnvelope)
            )
          } catch (error) {
            throw storageError('保存本地数据失败', error)
          }
          return nextEnvelope
        }
      )
    }

    syncMetadataCache.set(normalizedSpaceKey, envelope.sync)
    localRevisionCache.set(normalizedSpaceKey, envelope.localRevision)
  }

  async function createIfAbsent(spaceKey, rawSnapshot, { sync } = {}) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    const snapshot = validateSnapshot(rawSnapshot, normalizeSnapshot)
    if (isTauri) {
      const envelope = createEnvelope(
        normalizedSpaceKey,
        snapshot,
        now,
        sync,
        1
      )
      const invoke = await getTauriInvoke()
      const created = await invokeTauri(
        invoke,
        'create_space_file_if_absent',
        {
          ownerKey: normalizedSpaceKey,
          data: JSON.stringify(envelope)
        },
        '初始化桌面端数据空间失败'
      )
      if (created) {
        syncMetadataCache.set(normalizedSpaceKey, envelope.sync)
        localRevisionCache.set(normalizedSpaceKey, envelope.localRevision)
      }
      return created === true
    }

    return crossTabLock.runExclusive(
      `local-space:${normalizedSpaceKey}`,
      async () => {
        const storage = getWebStorage(providedStorage)
        const existingRaw = readStorageItem(
          storage,
          spaceStorageKey(normalizedSpaceKey)
        )
        if (existingRaw) return false
        const envelope = createEnvelope(
          normalizedSpaceKey,
          snapshot,
          now,
          sync,
          1
        )
        try {
          storage.setItem(
            spaceStorageKey(normalizedSpaceKey),
            JSON.stringify(envelope)
          )
        } catch (error) {
          throw storageError('初始化本地数据空间失败', error)
        }
        syncMetadataCache.set(normalizedSpaceKey, envelope.sync)
        localRevisionCache.set(normalizedSpaceKey, envelope.localRevision)
        return true
      }
    )
  }

  async function updateSyncMetadata(
    spaceKey,
    sync,
    { expectedLocalRevision } = {}
  ) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    let metadata
    let actualLocalRevision
    let didSnapshotChange = false

    if (isTauri) {
      const current = await loadFromTauri(normalizedSpaceKey)
      if (!current) throw storageError('本地数据空间不存在')
      actualLocalRevision = current.localRevision
      metadata = normalizeSyncMetadata({ ...current.sync, ...sync })
      const envelope = createEnvelope(
        normalizedSpaceKey,
        current.snapshot,
        now,
        metadata,
        current.localRevision
      )
      await saveToTauri(normalizedSpaceKey, envelope)
    } else {
      const storage = getWebStorage(providedStorage)
      const localRevision = readPersistedLocalRevision(storage, normalizedSpaceKey)
      actualLocalRevision = localRevision
      const persistedSync = readWebSyncMetadata(
        storage,
        normalizedSpaceKey,
        localRevision,
        syncMetadataCache.get(normalizedSpaceKey)
      )
      didSnapshotChange = Number.isSafeInteger(expectedLocalRevision) &&
        expectedLocalRevision !== localRevision
      metadata = normalizeSyncMetadata({
        ...persistedSync,
        ...sync,
        dirty: didSnapshotChange
          ? true
          : sync.dirty ?? persistedSync.dirty
      })
      try {
        storage.setItem(
          syncStorageKey(normalizedSpaceKey),
          JSON.stringify({ ...metadata, localRevision })
        )
      } catch (error) {
        throw storageError('保存本地同步元数据失败', error)
      }
    }

    syncMetadataCache.set(normalizedSpaceKey, metadata)
    return Object.freeze({
      metadata: clone(metadata),
      actualLocalRevision,
      didSnapshotChange
    })
  }

  async function saveRecoveryCopy(
    spaceKey,
    rawSnapshot,
    { reason = 'manual-import', source = 'local', remoteRevision = null } = {}
  ) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    const snapshot = validateSnapshot(rawSnapshot, normalizeSnapshot)
    const copy = {
      id: randomUUID(),
      reason: RECOVERY_REASONS.has(reason) ? reason : 'manual-import',
      createdAt: now().toISOString(),
      source: source === 'cloud' ? 'cloud' : 'local',
      remoteRevision:
        Number.isInteger(remoteRevision) && remoteRevision > 0
          ? remoteRevision
          : null,
      snapshot
    }

    if (isTauri) {
      const invoke = await getTauriInvoke()
      const recoveryResult = unpackTauriReadResult(
        await invokeTauri(
          invoke,
          'read_recovery_file',
          { ownerKey: normalizedSpaceKey },
          '读取桌面端恢复副本失败'
        )
      )
      const recoveryRaw = recoveryResult.quarantined ? '' : recoveryResult.data
      const copies = parseRecoveryCopies(recoveryRaw)
      copies.push(copy)
      await invokeTauri(
        invoke,
        'save_recovery_file',
        {
          ownerKey: normalizedSpaceKey,
          data: JSON.stringify(copies.slice(-MAX_RECOVERY_COPIES))
        },
        '保存桌面端恢复副本失败'
      )
      return clone(copy)
    }

    await crossTabLock.runExclusive(
      `recovery:${normalizedSpaceKey}`,
      async () => {
        const storage = getWebStorage(providedStorage)
        try {
          const copies = readRecoveryCopies(storage, normalizedSpaceKey)
          copies.push(copy)
          storage.setItem(
            recoveryStorageKey(normalizedSpaceKey),
            JSON.stringify(copies.slice(-MAX_RECOVERY_COPIES))
          )
        } catch (error) {
          if (error instanceof AppError) throw error
          throw storageError('保存恢复副本失败', error)
        }
      }
    )
    return clone(copy)
  }

  async function listRecoveryCopies(spaceKey) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    if (isTauri) {
      const invoke = await getTauriInvoke()
      const recoveryResult = unpackTauriReadResult(
        await invokeTauri(
          invoke,
          'read_recovery_file',
          { ownerKey: normalizedSpaceKey },
          '读取桌面端恢复副本失败'
        )
      )
      const recoveryRaw = recoveryResult.quarantined ? '' : recoveryResult.data
      return clone(parseRecoveryCopies(recoveryRaw))
    }
    const storage = getWebStorage(providedStorage)
    try {
      return clone(readRecoveryCopies(storage, normalizedSpaceKey))
    } catch (error) {
      if (error instanceof AppError) throw error
      throw storageError('读取恢复副本失败', error)
    }
  }

  function getSyncMetadata(spaceKey) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    const metadata = syncMetadataCache.get(normalizedSpaceKey)
    return clone(normalizeSyncMetadata(metadata))
  }

  function getLocalRevision(spaceKey) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    return localRevisionCache.get(normalizedSpaceKey) ?? 0
  }

  function subscribeSpaceChanges(spaceKey, listener) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    if (typeof listener !== 'function') throw new TypeError('listener 必须是函数')
    const eventTarget = globalThis.window
    if (isTauri || typeof eventTarget?.addEventListener !== 'function') {
      return () => {}
    }
    const storageKey = spaceStorageKey(normalizedSpaceKey)
    const handleStorage = event => {
      if (event.key === storageKey) listener()
    }
    eventTarget.addEventListener('storage', handleStorage)
    return () => eventTarget.removeEventListener('storage', handleStorage)
  }

  async function getOrCreateDeviceMetadata() {
    if (isTauri) {
      const invoke = await getTauriInvoke()
      const saved = await invokeTauri(
        invoke,
        'read_device_file',
        undefined,
        '读取桌面端设备标识失败'
      )
      if (saved) {
        const metadata = parseJson(saved, '桌面端设备标识已损坏')
        if (
          metadata &&
          UUID_PATTERN.test(metadata.deviceId) &&
          typeof metadata.createdAt === 'string'
        ) {
          return clone(metadata)
        }
        throw corruptedDataError('桌面端设备标识格式无效')
      }

      const metadata = {
        deviceId: randomUUID(),
        createdAt: now().toISOString()
      }
      await invokeTauri(
        invoke,
        'save_device_file',
        { data: JSON.stringify(metadata) },
        '保存桌面端设备标识失败'
      )
      return metadata
    }

    const storage = getWebStorage(providedStorage)
    try {
      const saved = readStorageItem(
        storage,
        DEVICE_STORAGE_KEY,
        '读取设备标识失败'
      )
      if (saved) {
        const metadata = parseJson(saved, '设备标识已损坏')
        if (
          metadata &&
          UUID_PATTERN.test(metadata.deviceId) &&
          typeof metadata.createdAt === 'string'
        ) {
          return clone(metadata)
        }
      }

      const metadata = {
        deviceId: randomUUID(),
        createdAt: now().toISOString()
      }
      storage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(metadata))
      return metadata
    } catch (error) {
      if (error instanceof AppError) throw error
      throw storageError('设备标识保存失败', error)
    }
  }

  return {
    load,
    save,
    createIfAbsent,
    updateSyncMetadata,
    saveRecoveryCopy,
    listRecoveryCopies,
    getSyncMetadata,
    getLocalRevision,
    subscribeSpaceChanges,
    getOrCreateDeviceMetadata
  }
}
