import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import {
  isPrivilegedSupabaseKey,
  isPublishableSupabaseKey,
  loadSyncConfig,
  SYNC_DEFAULTS
} from '../src/account/config.js'
import {
  AppError,
  ERROR_CODES,
  isAppError,
  toAppError
} from '../src/account/errors.js'
import {
  assertSnapshotSize,
  canonicalizeSnapshot,
  getUtf8ByteLength,
  prepareSnapshot
} from '../src/sync/snapshot.js'
import {
  DiagnosticStore,
  maskEmail,
  sanitizeDiagnosticContext
} from '../src/observability/diagnostics.js'

function createLegacyJwt(role) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({ role })}.signature`
}

function createSnapshot(overrides = {}) {
  return {
    schemaVersion: 2,
    categories: [{ id: 'c1', name: '育儿', children: [] }],
    links: [{
      id: 'l1',
      title: '示例',
      url: 'https://example.com',
      categoryId: 'c1'
    }],
    ...overrides
  }
}

function createMemoryStorage(initialValue = null) {
  let value = initialValue
  return {
    getItem() {
      return value
    },
    setItem(_key, nextValue) {
      value = nextValue
    },
    read() {
      return value
    }
  }
}

test('缺失、禁用和合法云配置按本地优先规则降级', () => {
  const missing = loadSyncConfig({})
  assert.equal(missing.isSyncEnabled, true)
  assert.equal(missing.isSyncAvailable, false)
  assert.equal(missing.configError.code, ERROR_CODES.CONFIG_MISSING)

  const disabled = loadSyncConfig({
    VITE_SYNC_ENABLED: 'false',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_should_not_be_used'
  })
  assert.equal(disabled.isSyncEnabled, false)
  assert.equal(disabled.isSyncAvailable, false)
  assert.equal(disabled.configError, null)

  const publishableKey = `sb_publishable_${'a'.repeat(24)}`
  const configured = loadSyncConfig({
    VITE_SUPABASE_URL: 'https://family.supabase.co/path',
    VITE_SUPABASE_PUBLISHABLE_KEY: ` ${publishableKey} `
  })
  assert.equal(configured.isSyncAvailable, true)
  assert.equal(configured.supabaseUrl, 'https://family.supabase.co')
  assert.equal(configured.publishableKey, publishableKey)
  assert.equal(configured.defaults.maxSnapshotBytes, 2 * 1024 * 1024)
  assert.equal(Object.isFrozen(configured), true)
  assert.equal(Object.isFrozen(SYNC_DEFAULTS), true)
})

test('公开 key 校验拒绝特权、任意字符串并兼容 legacy anon JWT', () => {
  const anonJwt = createLegacyJwt('anon')
  const serviceJwt = createLegacyJwt('service_role')

  assert.equal(isPublishableSupabaseKey(anonJwt), true)
  assert.equal(isPublishableSupabaseKey('postgres-password'), false)
  assert.equal(isPrivilegedSupabaseKey(serviceJwt), true)
  assert.equal(isPrivilegedSupabaseKey('sb_secret_example'), true)

  for (const key of ['postgres-password', serviceJwt, 'sb_secret_example']) {
    const config = loadSyncConfig({
      VITE_SUPABASE_URL: 'https://family.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: key
    })
    assert.equal(config.isSyncAvailable, false)
    assert.equal(config.configError.code, ERROR_CODES.CONFIG_MISSING)
  }
})

test('生产配置拒绝 HTTP，开发仅允许本机 HTTP', () => {
  const env = {
    VITE_SUPABASE_URL: 'http://localhost:54321',
    VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'b'.repeat(24)}`
  }
  assert.equal(loadSyncConfig(env).isSyncAvailable, true)
  assert.equal(loadSyncConfig(env, { isProduction: true }).isSyncAvailable, false)
  assert.equal(loadSyncConfig({
    ...env,
    VITE_SUPABASE_URL: 'http://example.com'
  }).isSyncAvailable, false)
})

test('AppError 保留机器可读字段但不会枚举或序列化 cause', () => {
  const cause = new Error('access_token=secret')
  const error = new AppError(ERROR_CODES.OFFLINE, '当前离线', {
    retryable: true,
    retryAfter: -10,
    cause
  })

  assert.equal(isAppError(error), true)
  assert.equal(error.retryable, true)
  assert.equal(error.retryAfter, 0)
  assert.equal(error.cause, cause)
  assert.equal(Object.keys(error).includes('cause'), false)
  assert.equal('cause' in error.toJSON(), false)
  assert.equal(JSON.stringify(error).includes('access_token'), false)
  assert.equal(toAppError(error), error)

  const wrapped = toAppError(cause, {
    code: ERROR_CODES.LOCAL_STORAGE_FAILED,
    message: '保存失败'
  })
  assert.equal(wrapped.code, ERROR_CODES.LOCAL_STORAGE_FAILED)
  assert.equal(wrapped.cause, cause)
})

test('确定性快照保持数组顺序但忽略对象键顺序', async () => {
  const first = createSnapshot()
  const reorderedKeys = {
    links: first.links.map(link => ({
      categoryId: link.categoryId,
      url: link.url,
      title: link.title,
      id: link.id
    })),
    categories: first.categories,
    schemaVersion: first.schemaVersion
  }
  const reversedLinks = createSnapshot({
    links: [
      ...first.links,
      { ...first.links[0], id: 'l2', title: '第二个' }
    ].reverse()
  })

  const preparedFirst = await prepareSnapshot(first)
  const preparedReordered = await prepareSnapshot(reorderedKeys)
  const preparedReversed = await prepareSnapshot(reversedLinks)

  assert.equal(preparedFirst.canonicalJson, preparedReordered.canonicalJson)
  assert.equal(preparedFirst.hash, preparedReordered.hash)
  assert.notEqual(preparedFirst.hash, preparedReversed.hash)
  assert.equal(preparedFirst.hash.length, 64)
  assert.equal(
    preparedFirst.hash,
    createHash('sha256').update(preparedFirst.canonicalJson).digest('hex')
  )
})

test('快照大小按 UTF-8 字节计算并执行严格边界', () => {
  assert.equal(getUtf8ByteLength('亲子🙂'), Buffer.byteLength('亲子🙂', 'utf8'))
  const canonical = canonicalizeSnapshot(createSnapshot())
  const exactSize = getUtf8ByteLength(canonical)

  assert.equal(assertSnapshotSize(canonical, exactSize), exactSize)
  assert.throws(
    () => assertSnapshotSize(canonical, exactSize - 1),
    error => error.code === ERROR_CODES.SNAPSHOT_TOO_LARGE
  )
  for (const maxBytes of [0, -1, Number.NaN, Infinity, 1.5]) {
    assert.throws(() => assertSnapshotSize(canonical, maxBytes), TypeError)
  }
})

test('快照拒绝未来 Schema、非法结构和不可序列化字段', () => {
  assert.throws(
    () => canonicalizeSnapshot(createSnapshot({ schemaVersion: 3 })),
    error => error.code === ERROR_CODES.UNSUPPORTED_SCHEMA
  )
  assert.throws(
    () => canonicalizeSnapshot({ schemaVersion: 2, categories: [], links: null }),
    error => error.code === ERROR_CODES.INVALID_REMOTE_DATA
  )
  assert.throws(
    () => canonicalizeSnapshot(createSnapshot({ score: Number.NaN })),
    error => error.code === ERROR_CODES.INVALID_REMOTE_DATA
  )

  const cyclic = createSnapshot()
  cyclic.self = cyclic
  assert.throws(
    () => canonicalizeSnapshot(cyclic),
    error => error.code === ERROR_CODES.INVALID_REMOTE_DATA
  )
})

test('Web Crypto 缺失或失败时统一返回 AppError', async () => {
  const snapshot = createSnapshot()
  await assert.rejects(
    prepareSnapshot(snapshot, { cryptoApi: {} }),
    error => error instanceof AppError &&
      error.code === ERROR_CODES.REMOTE_UNAVAILABLE
  )

  const cause = new Error('digest failed')
  await assert.rejects(
    prepareSnapshot(snapshot, {
      cryptoApi: { subtle: { digest: async () => { throw cause } } }
    }),
    error => error instanceof AppError &&
      error.code === ERROR_CODES.REMOTE_UNAVAILABLE &&
      error.cause === cause &&
      !Object.keys(error).includes('cause')
  )
})

test('诊断上下文只保留白名单并脱敏标识和邮箱', () => {
  assert.equal(maskEmail('parent@example.com'), 'p***@example.com')
  assert.equal(maskEmail('invalid'), undefined)

  const sanitized = sanitizeDiagnosticContext({
    syncAttemptId: 'attempt-123456789',
    hash: 'abcdef1234567890',
    deviceId: 'device-123456789',
    email: 'parent@example.com',
    durationMs: 42,
    accessToken: 'secret-token',
    otp: '123456',
    payload: { links: ['private'] }
  })

  assert.deepEqual(sanitized, {
    syncAttemptId: 'attempt-',
    hash: 'abcdef12',
    deviceId: 'device-1',
    email: 'p***@example.com',
    durationMs: 42
  })
  assert.equal(JSON.stringify(sanitized).includes('secret'), false)
  assert.equal(JSON.stringify(sanitized).includes('123456'), false)
  assert.equal(JSON.stringify(sanitized).includes('private'), false)
})

test('诊断日志按数量和时间淘汰并容忍存储失败', () => {
  let now = Date.UTC(2026, 6, 31, 0, 0, 0)
  const storage = createMemoryStorage()
  const diagnostics = new DiagnosticStore({
    storage,
    maxEntries: 2,
    retentionMs: 1000,
    now: () => now,
    runtime: 'web',
    appVersion: '1.0.0'
  })

  diagnostics.record('info', 'app.initialized')
  now += 500
  diagnostics.record('warn', 'sync.retry_scheduled', { errorCode: 'OFFLINE' })
  now += 600
  diagnostics.record('error', 'storage.write_failed')

  assert.equal(diagnostics.entries.length, 2)
  assert.deepEqual(
    diagnostics.entries.map(entry => entry.event),
    ['sync.retry_scheduled', 'storage.write_failed']
  )
  assert.equal(JSON.parse(storage.read()).length, 2)

  const failing = new DiagnosticStore({
    storage: {
      getItem() {
        throw new Error('read failed')
      },
      setItem() {
        throw new Error('quota exceeded')
      }
    },
    now: () => now
  })
  assert.doesNotThrow(() => failing.record('info', 'app.initialized'))
  assert.equal(failing.entries.length, 1)
})

test('诊断日志零上限不保存，非法上限回退默认值', () => {
  const zero = new DiagnosticStore({ storage: null, maxEntries: 0 })
  zero.record('info', 'app.initialized')
  assert.equal(zero.entries.length, 0)

  const fallback = new DiagnosticStore({
    storage: null,
    maxEntries: Number.NaN,
    retentionMs: 0
  })
  assert.equal(fallback.maxEntries, SYNC_DEFAULTS.maxDiagnosticEntries)
  assert.equal(fallback.retentionMs, SYNC_DEFAULTS.diagnosticRetentionMs)
})

test('持久化诊断内容重新加载时再次执行字段白名单', () => {
  const timestamp = '2026-07-31T00:00:00.000Z'
  const storage = createMemoryStorage(JSON.stringify([{
    timestamp,
    level: 'error',
    event: 'attacker-controlled-token',
    runtime: 'tauri',
    appVersion: '1.0.0',
    email: 'parent@example.com',
    payload: { secret: true },
    accessToken: 'secret-token'
  }]))
  const diagnostics = new DiagnosticStore({
    storage,
    now: () => Date.parse(timestamp)
  })
  const serialized = JSON.stringify(diagnostics.entries)

  assert.equal(diagnostics.entries[0].event, 'diagnostic.invalid_event')
  assert.equal(diagnostics.entries[0].email, 'p***@example.com')
  assert.equal(serialized.includes('payload'), false)
  assert.equal(serialized.includes('accessToken'), false)
  assert.equal(serialized.includes('secret-token'), false)
})

test('诊断指标和导出报告拒绝未知字段与业务数据', () => {
  const now = Date.parse('2026-07-31T08:00:00.000Z')
  const diagnostics = new DiagnosticStore({
    storage: null,
    now: () => now,
    runtime: 'tauri',
    appVersion: '1.2.3'
  })

  assert.equal(diagnostics.incrementMetric('sync_attempt_total'), true)
  assert.equal(diagnostics.setMetric('sync_duration_ms', 25), true)
  assert.equal(diagnostics.incrementMetric('unknown_metric'), false)
  diagnostics.record('info', 'sync.uploaded', {
    payloadBytes: 100,
    payload: { links: ['private'] }
  })

  const report = diagnostics.exportReport({
    syncStatus: 'idle',
    lastSyncedAt: '2026-07-31T07:59:00.000Z',
    schemaVersion: 2,
    remoteRevision: 3,
    isDirty: false,
    payloadBytes: 100,
    recoveryCopyCount: 1,
    isSyncConfigured: true,
    accessToken: 'secret-token',
    snapshot: createSnapshot()
  })
  const serialized = JSON.stringify(report)

  assert.equal(report.metrics.sync_attempt_total, 1)
  assert.equal(report.metrics.sync_duration_ms, 25)
  assert.equal(report.status.remoteRevision, 3)
  assert.equal(serialized.includes('secret-token'), false)
  assert.equal(serialized.includes('example.com'), false)
  assert.equal(serialized.includes('"snapshot"'), false)
})
