import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ERROR_CODES } from '../src/account/errors.js'
import { createTauriSessionStorage } from '../src/account/tauriSessionStorage.js'
import {
  GUEST_SPACE_KEY,
  createDataSpaceRepository,
  toUserSpaceKey
} from '../src/data/dataSpaceRepository.js'
import { normalizeData } from '../src/data/store.js'

const USER_ID = '11111111-1111-4111-8111-111111111111'

function makeSnapshot(title) {
  return normalizeData({
    categories: [{ id: 'c1', name: '分类', children: [] }],
    links: [{
      id: 'l1',
      title,
      description: '',
      url: 'https://example.com',
      categoryId: 'c1'
    }]
  })
}

function createTauriRepository(invoke) {
  return createDataSpaceRepository({
    isTauri: true,
    getInvoke: async () => invoke,
    normalizeSnapshot: normalizeData,
    now: () => new Date('2026-07-31T00:00:00.000Z'),
    randomUUID: () => '00000000-0000-4000-8000-000000000001'
  })
}

function createStrongholdFake({ existingClient = false } = {}) {
  const values = new Map()
  const calls = []
  const store = {
    async get(key) {
      calls.push(['get', key])
      return values.get(key) ?? null
    },
    async insert(key, value) {
      calls.push(['insert', key])
      values.set(key, value)
    },
    async remove(key) {
      calls.push(['remove', key])
      values.delete(key)
    }
  }
  const client = { getStore: () => store }
  const stronghold = {
    async loadClient(name) {
      calls.push(['loadClient', name])
      if (!existingClient) throw new Error('client missing')
      return client
    },
    async createClient(name) {
      calls.push(['createClient', name])
      return client
    },
    async save() {
      calls.push(['save'])
    }
  }
  const dependencies = {
    invoke: async command => {
      calls.push(['invoke', command])
      return 'vault-password'
    },
    getVaultPath: async () => '/app-data/panduola-session.hold',
    Stronghold: {
      async load(path, password) {
        calls.push(['load', path, password])
        return stronghold
      }
    }
  }
  return { calls, dependencies, values }
}

test('Stronghold Session 适配器首次建 client 后可读写删除且只初始化一次', async () => {
  const fake = createStrongholdFake()
  let dependencyLoads = 0
  const storage = createTauriSessionStorage({
    loadDependencies: async () => {
      dependencyLoads += 1
      return fake.dependencies
    }
  })

  assert.equal(await storage.getItem('session'), null)
  await storage.setItem('session', '令牌值')
  assert.equal(await storage.getItem('session'), '令牌值')
  await storage.removeItem('session')
  assert.equal(await storage.getItem('session'), null)

  assert.equal(dependencyLoads, 1)
  assert.equal(
    fake.calls.filter(([operation]) => operation === 'createClient').length,
    1
  )
  assert.ok(fake.calls.some(call => (
    call[0] === 'insert' && call[1] === 'supabase:session'
  )))
  assert.equal(fake.values.size, 0)
})

test('Stronghold Session 适配器复用已有 client 并校验键和值边界', async () => {
  const fake = createStrongholdFake({ existingClient: true })
  const storage = createTauriSessionStorage({
    loadDependencies: async () => fake.dependencies
  })

  await storage.setItem('a', '')
  assert.equal(await storage.getItem('a'), '')
  assert.equal(
    fake.calls.some(([operation]) => operation === 'createClient'),
    false
  )

  for (const invalidKey of ['', 'x'.repeat(257), 'line\nbreak', null]) {
    await assert.rejects(storage.getItem(invalidKey), TypeError)
  }
  await assert.rejects(storage.setItem('session', null), TypeError)
})

test('Stronghold 初始化与存取失败映射为明确错误且允许重试初始化', async () => {
  let attempts = 0
  const unavailable = createTauriSessionStorage({
    loadDependencies: async () => {
      attempts += 1
      throw new Error('keyring unavailable')
    }
  })

  for (let index = 0; index < 2; index += 1) {
    await assert.rejects(
      unavailable.getItem('session'),
      error => error.code === ERROR_CODES.CREDENTIAL_STORAGE_UNAVAILABLE
    )
  }
  assert.equal(attempts, 2)

  const fake = createStrongholdFake({ existingClient: true })
  fake.dependencies.Stronghold.load = async () => ({
    loadClient: async () => ({
      getStore: () => ({
        get: async () => {
          throw new Error('vault read failed')
        }
      })
    })
  })
  const failedRead = createTauriSessionStorage({
    loadDependencies: async () => fake.dependencies
  })
  await assert.rejects(
    failedRead.getItem('session'),
    error => error.code === ERROR_CODES.CREDENTIAL_STORAGE_UNAVAILABLE
  )
})

test('Tauri 游客旧数据在新空间成功写入后完成迁移并保留旧文件', async () => {
  const legacyRaw = JSON.stringify({
    schemaVersion: 2,
    categories: [{ id: 'c1', name: '分类', children: [] }],
    links: [{
      id: 'l1',
      title: '旧数据',
      description: '',
      url: 'https://example.com',
      categoryId: 'c1'
    }],
    growthRecords: [{
      id: 'legacy-growth',
      measuredAt: '2026-01-01',
      heightCm: 100,
      weightKg: 15,
      headCircumferenceCm: null,
      note: '',
      createdAt: 1,
      updatedAt: 1
    }]
  })
  const calls = []
  const invoke = async (command, args) => {
    calls.push([command, args])
    if (command === 'read_space_file') {
      return { data: '', quarantined: false }
    }
    if (command === 'read_legacy_data_file') {
      return { data: legacyRaw, quarantined: false }
    }
    if (command === 'save_space_file') return null
    throw new Error(`unexpected command: ${command}`)
  }

  const migrated = await createTauriRepository(invoke).load(GUEST_SPACE_KEY)
  assert.equal(migrated.snapshot.links[0].title, '旧数据')
  assert.equal(migrated.snapshot.schemaVersion, 3)
  assert.equal(migrated.snapshot.growthRecords[0].childId, 'growth-child-default')
  const saveCall = calls.find(([command]) => command === 'save_space_file')
  assert.equal(saveCall[1].ownerKey, GUEST_SPACE_KEY)
  assert.equal(JSON.parse(saveCall[1].data).ownerKey, GUEST_SPACE_KEY)
  assert.equal(JSON.parse(saveCall[1].data).snapshot.schemaVersion, 3)
  assert.equal(
    calls.some(([command]) => command === 'quarantine_data_file'),
    false
  )
})

test('Tauri 现有 v2 空间 envelope 迁移为 v3 并保留同步元数据', async () => {
  const legacyEnvelope = {
    localFormatVersion: 1,
    localRevision: 8,
    ownerKey: GUEST_SPACE_KEY,
    snapshot: {
      schemaVersion: 2,
      categories: [{ id: 'c1', name: '分类', children: [] }],
      links: [],
      growthRecords: []
    },
    sync: {
      remoteRevision: 4,
      dirty: false,
      lastSyncedHash: 'legacy-hash',
      lastSyncedAt: '2026-08-20T00:00:00.000Z'
    },
    updatedAt: '2026-08-20T00:00:00.000Z'
  }
  const invoke = async command => {
    if (command === 'read_space_file') {
      return { data: JSON.stringify(legacyEnvelope), quarantined: false }
    }
    throw new Error(`unexpected command: ${command}`)
  }
  const envelope = await createTauriRepository(invoke).load(GUEST_SPACE_KEY)

  assert.equal(envelope.snapshot.schemaVersion, 3)
  assert.equal(envelope.snapshot.growthChildren[0].id, 'growth-child-default')
  assert.equal(envelope.localRevision, 8)
  assert.equal(envelope.sync.remoteRevision, 4)
  assert.equal(envelope.sync.lastSyncedHash, 'legacy-hash')
})

test('Tauri 原生已隔离响应直接读取恢复副本并修复主空间', async () => {
  const spaceKey = toUserSpaceKey(USER_ID)
  const recovery = [{
    id: 'copy-1',
    reason: 'revision-conflict',
    createdAt: '2026-07-31T00:00:00.000Z',
    source: 'cloud',
    remoteRevision: 7,
    snapshot: makeSnapshot('可信副本')
  }]
  const calls = []
  const invoke = async (command, args) => {
    calls.push([command, args])
    if (command === 'read_space_file') {
      return { data: '', quarantined: true }
    }
    if (command === 'read_recovery_file') {
      return { data: JSON.stringify(recovery), quarantined: false }
    }
    if (command === 'save_space_file') return null
    throw new Error(`unexpected command: ${command}`)
  }

  const restored = await createTauriRepository(invoke).load(spaceKey)
  assert.equal(restored.snapshot.links[0].title, '可信副本')
  assert.equal(restored.sync.remoteRevision, 7)
  assert.equal(restored.sync.dirty, false)
  assert.equal(
    calls.some(([command]) => command === 'quarantine_data_file'),
    false
  )
})

test('Tauri 恢复写回失败立即终止且不继续读取 legacy', async () => {
  const recovery = [{
    id: 'copy-1',
    reason: 'revision-conflict',
    createdAt: '2026-07-31T00:00:00.000Z',
    source: 'local',
    remoteRevision: null,
    snapshot: makeSnapshot('恢复副本')
  }]
  const calls = []
  const invoke = async command => {
    calls.push(command)
    if (command === 'read_space_file') return '{broken'
    if (command === 'quarantine_data_file') return null
    if (command === 'read_recovery_file') return JSON.stringify(recovery)
    if (command === 'save_space_file') {
      throw new Error('LOCAL_STORAGE_FAILED: disk full')
    }
    if (command === 'read_legacy_data_file') {
      throw new Error('legacy must not be read')
    }
    throw new Error(`unexpected command: ${command}`)
  }

  await assert.rejects(
    createTauriRepository(invoke).load(GUEST_SPACE_KEY),
    error => (
      error.code === ERROR_CODES.LOCAL_STORAGE_FAILED &&
      /disk full/.test(error.message)
    )
  )
  assert.equal(calls.includes('read_legacy_data_file'), false)
})

test('Tauri 原生错误码在桥接层保持语义', async () => {
  const repository = createTauriRepository(async command => {
    if (command === 'read_space_file') {
      throw new Error('LOCAL_DATA_CORRUPTED: unreadable bytes')
    }
    throw new Error(`unexpected command: ${command}`)
  })

  await assert.rejects(
    repository.load(toUserSpaceKey(USER_ID)),
    error => error.code === ERROR_CODES.LOCAL_DATA_CORRUPTED
  )
})
