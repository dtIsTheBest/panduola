import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ERROR_CODES } from '../src/account/errors.js'
import {
  GUEST_SPACE_KEY,
  createDataSpaceRepository,
  toUserSpaceKey
} from '../src/data/dataSpaceRepository.js'
import { normalizeData, store } from '../src/data/store.js'

const USER_A = '11111111-1111-4111-8111-111111111111'
const USER_B = '22222222-2222-4222-8222-222222222222'
const USER_C = '33333333-3333-4333-8333-333333333333'
const USER_D = '44444444-4444-4444-8444-444444444444'
const USER_E = '55555555-5555-4555-8555-555555555555'
const USER_F = '66666666-6666-4666-8666-666666666666'

function createMemoryStorage() {
  const values = new Map()
  let failWrite = () => false
  let failRead = () => false
  let writeObserver = () => {}

  return {
    values,
    getItem(key) {
      if (failRead(key)) throw new Error('read unavailable')
      return values.get(key) ?? null
    },
    setItem(key, value) {
      if (failWrite(key)) throw new Error('quota exceeded')
      values.set(key, value)
      writeObserver(key, value)
    },
    removeItem(key) {
      values.delete(key)
    },
    setWriteFailure(predicate) {
      failWrite = predicate
    },
    setReadFailure(predicate) {
      failRead = predicate
    },
    setWriteObserver(observer) {
      writeObserver = observer
    }
  }
}

function makeSnapshot(title, description = '') {
  return normalizeData({
    categories: [{ id: 'c1', name: '分类', children: [] }],
    links: [{
      id: 'l1',
      title,
      description,
      url: 'https://example.com',
      categoryId: 'c1'
    }]
  })
}

function createRepository(storage, overrides = {}) {
  return createDataSpaceRepository({
    storage,
    normalizeSnapshot: normalizeData,
    now: () => new Date('2026-07-31T00:00:00.000Z'),
    randomUUID: (() => {
      let sequence = 0
      return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`
    })(),
    ...overrides
  })
}

test('数据空间键仅接受 guest 与 UUID 用户标识', async () => {
  assert.equal(toUserSpaceKey(USER_A), `user:${USER_A}`)
  assert.throws(() => toUserSpaceKey('not-a-uuid'), /用户标识格式无效/)
  await assert.rejects(
    createRepository(createMemoryStorage()).load('user:../../escape'),
    /数据空间标识无效/
  )
})

test('旧数据仅在新游客空间写入成功后完成迁移', async () => {
  const storage = createMemoryStorage()
  const legacyRaw = JSON.stringify({
    categories: [{ id: 'c1', name: '旧分类', children: [] }],
    links: []
  })
  storage.values.set('panduola_data', legacyRaw)
  const repository = createRepository(storage)

  const migrated = await repository.load(GUEST_SPACE_KEY)
  assert.equal(migrated.snapshot.schemaVersion, 2)
  assert.equal(migrated.snapshot.categories[0].name, '旧分类')
  assert.equal(storage.values.get('panduola_data'), legacyRaw)
  assert.ok(storage.values.has('panduola_space:guest'))

  const failedStorage = createMemoryStorage()
  failedStorage.values.set('panduola_data', legacyRaw)
  failedStorage.setWriteFailure(key => key === 'panduola_space:guest')
  const failedRepository = createRepository(failedStorage)
  await assert.rejects(
    failedRepository.load(GUEST_SPACE_KEY),
    error => error.code === ERROR_CODES.LOCAL_STORAGE_FAILED
  )
  assert.equal(failedStorage.values.get('panduola_data'), legacyRaw)
  assert.equal(failedStorage.values.has('panduola_space:guest'), false)
})

test('损坏旧数据先隔离，再允许调用方使用默认快照', async () => {
  const storage = createMemoryStorage()
  storage.values.set('panduola_data', '{broken')
  const repository = createRepository(storage)

  assert.equal(await repository.load(GUEST_SPACE_KEY), null)
  const quarantineEntries = [...storage.values.entries()]
    .filter(([key]) => key.startsWith('panduola_quarantine:guest:legacy:'))
  assert.equal(quarantineEntries.length, 1)
  assert.equal(JSON.parse(quarantineEntries[0][1]).rawValue, '{broken')
  assert.equal(storage.values.get('panduola_data'), '{broken')
})

test('游客与两个用户数据空间互不覆盖', async () => {
  const storage = createMemoryStorage()
  const repository = createRepository(storage)
  const userASpace = toUserSpaceKey(USER_A)
  const userBSpace = toUserSpaceKey(USER_B)

  await repository.save(GUEST_SPACE_KEY, makeSnapshot('游客'))
  await repository.save(userASpace, makeSnapshot('用户 A'))
  await repository.save(userBSpace, makeSnapshot('用户 B'))

  assert.equal((await repository.load(GUEST_SPACE_KEY)).snapshot.links[0].title, '游客')
  assert.equal((await repository.load(userASpace)).snapshot.links[0].title, '用户 A')
  assert.equal((await repository.load(userBSpace)).snapshot.links[0].title, '用户 B')
  assert.equal(
    new Set([
      storage.values.get('panduola_space:guest'),
      storage.values.get(`panduola_space:${userASpace}`),
      storage.values.get(`panduola_space:${userBSpace}`)
    ]).size,
    3
  )
})

test('恢复副本只保留最近五份且失败不覆盖当前快照', async () => {
  const storage = createMemoryStorage()
  const repository = createRepository(storage)
  const spaceKey = toUserSpaceKey(USER_A)
  await repository.save(spaceKey, makeSnapshot('当前版本'))

  for (let index = 1; index <= 6; index += 1) {
    await repository.saveRecoveryCopy(spaceKey, makeSnapshot(`副本 ${index}`), {
      reason: 'revision-conflict',
      source: 'cloud',
      remoteRevision: index
    })
  }

  const copies = await repository.listRecoveryCopies(spaceKey)
  assert.equal(copies.length, 5)
  assert.deepEqual(
    copies.map(copy => copy.snapshot.links[0].title),
    ['副本 2', '副本 3', '副本 4', '副本 5', '副本 6']
  )

  const currentKey = `panduola_space:${spaceKey}`
  const currentRaw = storage.values.get(currentKey)
  storage.setWriteFailure(key => key === `panduola_recoveries:${spaceKey}`)
  await assert.rejects(
    repository.saveRecoveryCopy(spaceKey, makeSnapshot('不能保存')),
    error => error.code === ERROR_CODES.LOCAL_STORAGE_FAILED
  )
  assert.equal(storage.values.get(currentKey), currentRaw)
})

test('损坏主空间从最近恢复副本修复且双重损坏不会覆盖隔离数据', async () => {
  const storage = createMemoryStorage()
  const repository = createRepository(storage)
  const spaceKey = toUserSpaceKey(USER_A)
  const currentKey = `panduola_space:${spaceKey}`
  const recoveryKey = `panduola_recoveries:${spaceKey}`

  await repository.save(spaceKey, makeSnapshot('旧当前版本'))
  await repository.saveRecoveryCopy(spaceKey, makeSnapshot('可信副本'), {
    reason: 'revision-conflict'
  })
  storage.values.set(currentKey, '{broken-current')

  const recovered = await repository.load(spaceKey)
  assert.equal(recovered.snapshot.links[0].title, '可信副本')
  assert.equal(
    JSON.parse(storage.values.get(currentKey)).snapshot.links[0].title,
    '可信副本'
  )

  storage.values.set(currentKey, '{broken-again')
  storage.values.set(recoveryKey, '{broken-recovery')
  assert.equal(await repository.load(spaceKey), null)
  const quarantines = [...storage.values.entries()]
    .filter(([key]) => key.startsWith(`panduola_quarantine:${spaceKey}:`))
  assert.equal(quarantines.length, 3)
  assert.ok(quarantines.some(([, value]) => (
    JSON.parse(value).rawValue === '{broken-again'
  )))
  assert.ok(quarantines.some(([, value]) => (
    JSON.parse(value).rawValue === '{broken-recovery'
  )))
})

test('存储读取失败与恢复写入失败统一回滚并返回 AppError', async () => {
  const storage = createMemoryStorage()
  const repository = createRepository(storage)
  const spaceKey = toUserSpaceKey(USER_B)
  storage.setReadFailure(key => key === `panduola_space:${spaceKey}`)

  await assert.rejects(
    repository.load(spaceKey),
    error => (
      error.code === ERROR_CODES.LOCAL_STORAGE_FAILED &&
      /read unavailable/.test(error.message)
    )
  )

  storage.setReadFailure(() => false)
  await repository.saveRecoveryCopy(spaceKey, makeSnapshot('恢复版本'))
  storage.values.set(`panduola_space:${spaceKey}`, '{broken')
  storage.setWriteFailure(key => key === `panduola_space:${spaceKey}`)
  await assert.rejects(
    repository.load(spaceKey),
    error => error.code === ERROR_CODES.LOCAL_STORAGE_FAILED
  )
  assert.equal(storage.values.get(`panduola_space:${spaceKey}`), '{broken')
})

test('设备标识安装内稳定且与业务快照分离', async () => {
  const storage = createMemoryStorage()
  const repository = createRepository(storage)
  const first = await repository.getOrCreateDeviceMetadata()
  const second = await repository.getOrCreateDeviceMetadata()

  assert.deepEqual(second, first)
  assert.match(first.deviceId, /^[0-9a-f-]{36}$/)
  await repository.save(GUEST_SPACE_KEY, makeSnapshot('游客'))
  const envelope = JSON.parse(storage.values.get('panduola_space:guest'))
  assert.equal('deviceId' in envelope.snapshot, false)
})

test('Store 每次成功本地提交只通知一次，云快照不产生本地提交', async () => {
  const storage = createMemoryStorage()
  globalThis.localStorage = storage
  await store.activateDataSpace(GUEST_SPACE_KEY)
  await store.replaceData(makeSnapshot('初始'))

  const events = []
  const unsubscribe = store.subscribeLocalCommits(event => events.push(event))
  await store.toggleFavorite('l1')
  const visit = store.recordVisit('l1')
  await Promise.all([visit, store.flushPendingVisits()])
  await store.applySnapshot(makeSnapshot('云端'), 'cloud')
  unsubscribe()

  assert.equal(events.length, 2)
  assert.deepEqual(events.map(event => event.source), ['local', 'visit'])
  assert.ok(events.every(event => event.spaceKey === GUEST_SPACE_KEY))
  assert.ok(events.every(event => Object.isFrozen(event.snapshot)))
  assert.ok(events.every(event => Object.isFrozen(event.snapshot.links[0])))
})

test('登录数据空间导入后持久化 dirty，业务快照不混入同步元数据', async () => {
  const storage = createMemoryStorage()
  globalThis.localStorage = storage
  const userSpace = toUserSpaceKey(USER_C)
  await store.activateDataSpace(userSpace)
  const events = []
  const unsubscribe = store.subscribeLocalCommits(event => events.push(event))

  await store.replaceData(makeSnapshot('登录导入'))
  unsubscribe()

  const envelope = JSON.parse(storage.values.get(`panduola_space:${userSpace}`))
  assert.equal(envelope.sync.dirty, true)
  assert.equal(events.at(-1).source, 'import')
  const exportedSnapshot = store.getSnapshot()
  assert.equal('sync' in exportedSnapshot, false)
  assert.equal('ownerKey' in exportedSnapshot, false)
  assert.equal('remoteRevision' in exportedSnapshot, false)
})

test('Store 空间切换隔离数据，目标写入失败时保持原状态', async () => {
  const storage = createMemoryStorage()
  globalThis.localStorage = storage
  const userASpace = toUserSpaceKey(USER_A)
  const userBSpace = toUserSpaceKey(USER_B)
  const userCSpace = toUserSpaceKey(USER_C)

  await store.activateDataSpace(userASpace)
  await store.replaceData(makeSnapshot('用户 A'))
  await store.activateDataSpace(userBSpace)
  await store.replaceData(makeSnapshot('用户 B'))
  await store.activateDataSpace(userASpace)
  assert.equal(store.links[0].title, '用户 A')

  const before = JSON.stringify(store.getSnapshot())
  storage.setWriteFailure(key => key === `panduola_space:${userCSpace}`)
  await assert.rejects(
    store.activateDataSpace(userCSpace),
    error => error.code === ERROR_CODES.LOCAL_STORAGE_FAILED
  )
  assert.equal(store.activeSpaceKey, userASpace)
  assert.equal(JSON.stringify(store.getSnapshot()), before)
})

test('Store 原子恢复副本并先备份当前版本', async () => {
  const storage = createMemoryStorage()
  globalThis.localStorage = storage
  const userASpace = toUserSpaceKey(USER_D)
  await store.activateDataSpace(userASpace)
  await store.replaceData(makeSnapshot('待恢复版本'))
  await store.saveRecoveryCopy(store.getSnapshot(), {
    reason: 'revision-conflict',
    source: 'cloud',
    remoteRevision: 3
  })
  const [targetCopy] = await store.listRecoveryCopies()
  await store.replaceData(makeSnapshot('恢复前当前版本'))
  await store.updateSyncMetadata({ dirty: false })
  const events = []
  const unsubscribe = store.subscribeLocalCommits(event => {
    events.push({
      source: event.source,
      dirty: store.getSyncMetadata().dirty,
      title: event.snapshot.links[0].title
    })
  })
  let concurrentUpdate = null
  storage.setWriteObserver(key => {
    if (key !== `panduola_recoveries:${userASpace}` || concurrentUpdate) return
    concurrentUpdate = store.replaceData(makeSnapshot('并发排队版本'))
  })

  assert.equal(
    await store.restoreRecoveryCopy(targetCopy.id, userASpace),
    true
  )
  assert.ok(concurrentUpdate)
  await concurrentUpdate
  unsubscribe()
  assert.equal(store.links[0].title, '并发排队版本')
  assert.deepEqual(events, [
    { source: 'recovery', dirty: true, title: '待恢复版本' },
    { source: 'import', dirty: true, title: '并发排队版本' }
  ])

  const copies = await store.listRecoveryCopies()
  assert.equal(copies.length, 2)
  assert.equal(copies.at(-1).snapshot.links[0].title, '恢复前当前版本')
  assert.equal(copies.at(-1).reason, 'manual-import')
})

test('Store 拒绝失效副本和账号空间变化且不修改当前数据', async () => {
  const storage = createMemoryStorage()
  globalThis.localStorage = storage
  const userASpace = toUserSpaceKey(USER_E)
  const userBSpace = toUserSpaceKey(USER_D)
  await store.activateDataSpace(userASpace)
  await store.replaceData(makeSnapshot('保持不变'))
  const before = JSON.stringify(store.getSnapshot())

  await assert.rejects(
    store.restoreRecoveryCopy('missing', userASpace),
    error => error.code === ERROR_CODES.LOCAL_DATA_CORRUPTED
  )
  await assert.rejects(
    store.restoreRecoveryCopy('missing', userBSpace),
    error => error.code === ERROR_CODES.LOCAL_REVISION_CONFLICT
  )
  assert.equal(JSON.stringify(store.getSnapshot()), before)
  assert.equal((await store.listRecoveryCopies()).length, 0)
})

test('Store 恢复前备份失败时保持当前数据且不发送恢复提交', async () => {
  const storage = createMemoryStorage()
  globalThis.localStorage = storage
  const userSpace = toUserSpaceKey(USER_F)
  await store.activateDataSpace(userSpace)
  await store.replaceData(makeSnapshot('目标副本'))
  await store.saveRecoveryCopy(store.getSnapshot(), {
    reason: 'revision-conflict',
    source: 'cloud'
  })
  const [targetCopy] = await store.listRecoveryCopies()
  await store.replaceData(makeSnapshot('必须保留的当前版本'))
  const events = []
  const unsubscribe = store.subscribeLocalCommits(event => events.push(event))
  storage.setWriteFailure(key => key === `panduola_recoveries:${userSpace}`)

  await assert.rejects(
    store.restoreRecoveryCopy(targetCopy.id, userSpace),
    error => error.code === ERROR_CODES.LOCAL_STORAGE_FAILED
  )
  unsubscribe()
  assert.equal(store.links[0].title, '必须保留的当前版本')
  assert.equal(events.some(event => event.source === 'recovery'), false)
})

test('Store 在单串行边界内使用最新 guest seed 且已有目标不依赖 guest', async () => {
  const storage = createMemoryStorage()
  globalThis.localStorage = storage
  const repository = createRepository(storage)
  const userASpace = toUserSpaceKey(USER_A)
  const userBSpace = toUserSpaceKey(USER_B)
  const userCSpace = toUserSpaceKey(USER_C)

  await store.activateDataSpace(userCSpace)
  await store.activateDataSpace(GUEST_SPACE_KEY)
  await store.replaceData(makeSnapshot('最新游客'))
  const created = await store.activateDataSpaceFromGuestIfAbsent(userASpace)
  assert.equal(created, true)
  assert.equal(store.links[0].title, '最新游客')

  await repository.save(userBSpace, makeSnapshot('已有用户 B'))
  storage.removeItem('panduola_space:guest')
  const existingCreated = await store.activateDataSpaceFromGuestIfAbsent(userBSpace)
  assert.equal(existingCreated, false)
  assert.equal(store.links[0].title, '已有用户 B')
})

test('createIfAbsent 不覆盖其他实例已创建的账号空间', async () => {
  const storage = createMemoryStorage()
  let lockCalls = 0
  let activeLocks = 0
  let maxActiveLocks = 0
  let lockTail = Promise.resolve()
  const sharedLock = {
    runExclusive(_key, operation) {
      lockCalls += 1
      const result = lockTail.then(async () => {
        activeLocks += 1
        maxActiveLocks = Math.max(maxActiveLocks, activeLocks)
        try {
          await new Promise(resolve => setImmediate(resolve))
          return await operation()
        } finally {
          activeLocks -= 1
        }
      })
      lockTail = result.catch(() => {})
      return result
    }
  }
  const firstRepository = createRepository(storage, {
    crossTabLock: sharedLock
  })
  const secondRepository = createRepository(storage, {
    crossTabLock: sharedLock
  })
  const spaceKey = toUserSpaceKey(USER_A)

  const results = await Promise.all([
    firstRepository.createIfAbsent(
      spaceKey,
      makeSnapshot('先创建'),
      { sync: { dirty: true } }
    ),
    secondRepository.createIfAbsent(
      spaceKey,
      makeSnapshot('后创建'),
      { sync: { dirty: true } }
    )
  ])
  assert.deepEqual([...results].sort(), [false, true])
  assert.equal(lockCalls, 2)
  assert.equal(maxActiveLocks, 1)

  const envelope = await secondRepository.load(spaceKey)
  const expectedTitle = results[0] ? '先创建' : '后创建'
  assert.equal(envelope.snapshot.links[0].title, expectedTitle)
})

test('接近 2 MiB 的本地空间加载 P95 不超过 300ms', async () => {
  const storage = createMemoryStorage()
  const repository = createRepository(storage)
  const largeSnapshot = makeSnapshot('大快照', '中'.repeat(600_000))
  await repository.save(GUEST_SPACE_KEY, largeSnapshot)

  const durations = []
  for (let index = 0; index < 10; index += 1) {
    const startedAt = performance.now()
    await repository.load(GUEST_SPACE_KEY)
    durations.push(performance.now() - startedAt)
  }
  durations.sort((left, right) => left - right)
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1]
  assert.ok(p95 <= 300, `P95 ${p95.toFixed(2)}ms 超过 300ms`)
})
