import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import {
  isSafeExternalUrl,
  normalizeSafeExternalUrl,
  openExternalLink
} from '../src/utils/externalLinks.js'

let store
let normalizeData
let validateImportData
let currentSchemaVersion
let isTauriEnvironment
let buildCategoryLinkCountMap
let savedValue = null
let setItemCalls = 0
let visitDuringNextSaveId = null
let reentrantVisitPromise = null
let failNextSetItem = false
const storageValues = new Map()
const LEGACY_STORAGE_KEY = 'panduola_data'
const GUEST_SPACE_STORAGE_KEY = 'panduola_space:guest'

function setLegacyData(value) {
  storageValues.clear()
  storageValues.set(LEGACY_STORAGE_KEY, value)
  savedValue = value
}

before(async () => {
  globalThis.localStorage = {
    getItem(key) {
      return storageValues.get(key) ?? null
    },
    setItem(key, value) {
      if (failNextSetItem) {
        failNextSetItem = false
        throw new Error('storage unavailable')
      }
      storageValues.set(key, value)
      if (key.startsWith('panduola_space:')) {
        const envelope = JSON.parse(value)
        savedValue = JSON.stringify(envelope.snapshot)
      }
      setItemCalls += 1
      if (visitDuringNextSaveId) {
        const linkId = visitDuringNextSaveId
        visitDuringNextSaveId = null
        reentrantVisitPromise = store.recordVisit(linkId)
      }
    },
    removeItem(key) {
      storageValues.delete(key)
      if (key === GUEST_SPACE_STORAGE_KEY) savedValue = null
    }
  }

  const storeModule = await import('../src/data/store.js')
  store = storeModule.store
  normalizeData = storeModule.normalizeData
  validateImportData = storeModule.validateImportData
  currentSchemaVersion = storeModule.CURRENT_SCHEMA_VERSION
  isTauriEnvironment = storeModule.isTauriEnvironment
  const countModule = await import('../src/composables/useCategoryLinkCounts.js')
  buildCategoryLinkCountMap = countModule.buildCategoryLinkCountMap
})

test('安全外链仅接受 HTTP(S) 并隔离 opener', () => {
  assert.equal(isSafeExternalUrl('https://example.com/path'), true)
  assert.equal(isSafeExternalUrl('http://example.com'), true)
  assert.equal(isSafeExternalUrl('javascript:alert(1)'), false)
  assert.equal(isSafeExternalUrl('data:text/html,test'), false)
  assert.equal(normalizeSafeExternalUrl('not a url'), null)

  const openedWindow = { opener: 'source' }
  const calls = []
  const opened = openExternalLink('https://example.com', (...args) => {
    calls.push(args)
    return openedWindow
  })

  assert.equal(opened, true)
  assert.deepEqual(calls[0], ['https://example.com/', '_blank', 'noopener,noreferrer'])
  assert.equal(openedWindow.opener, null)
})

test('旧数据迁移到 Schema v2 并补充默认推荐标识', () => {
  const legacyData = {
    categories: [{ id: 'c1', name: '育儿知识', children: [] }],
    links: [
      {
        id: 'l1',
        title: '内置链接',
        url: 'https://example.com/default',
        categoryId: 'c1'
      },
      {
        id: 'custom',
        title: '用户链接',
        url: 'https://example.com/custom',
        categoryId: 'c1',
        favorite: true
      }
    ]
  }

  const migrated = normalizeData(legacyData)

  assert.equal(migrated.schemaVersion, currentSchemaVersion)
  assert.equal(migrated.links[0].isDefault, true)
  assert.equal(migrated.links[1].isDefault, false)
  assert.equal(migrated.links[1].favorite, true)
  assert.deepEqual(migrated.links[0].tags, [])
  assert.equal('isDefault' in legacyData.links[0], false)
})

test('导入校验拒绝无效结构和危险协议', () => {
  assert.throws(() => validateImportData({ categories: [], links: 'invalid' }), /categories 和 links/)
  assert.throws(() => validateImportData({
    categories: [{ id: 'c1', name: '分类' }],
    links: [{
      id: 'l1',
      title: '危险链接',
      url: 'javascript:alert(1)',
      categoryId: 'c1'
    }]
  }), /URL 协议/)
  assert.throws(() => validateImportData({
    categories: [{ id: 'c1', name: '分类', children: 'invalid' }],
    links: []
  }), /children/)
})

test('分类和子分类变更通过统一接口持久化', async () => {
  storageValues.clear()
  savedValue = null
  await store.replaceData({
    categories: [{ id: 'c1', name: '育儿知识', children: [] }],
    links: []
  })

  await store.upsertCategory({
    id: 'c1-1',
    name: '睡眠',
    parentId: 'c1',
    children: []
  })

  let persisted = JSON.parse(savedValue)
  assert.equal(persisted.categories[0].children[0].name, '睡眠')

  await store.deleteSubcategory('c1', 'c1-1')
  persisted = JSON.parse(savedValue)
  assert.deepEqual(persisted.categories[0].children, [])
})

test('旧数据中的不安全链接被保留但不会阻断迁移', async () => {
  setLegacyData(JSON.stringify({
    categories: [{ id: 'c1', name: '旧分类', children: [] }],
    links: [{
      id: 'legacy',
      title: '旧 FTP 链接',
      url: 'ftp://example.com/file',
      categoryId: 'c1'
    }]
  }))
  store.initialized = false

  await store.init()

  assert.equal(store.links.length, 1)
  assert.equal(store.links[0].id, 'legacy')
  assert.equal(store.links[0].description, '')
  assert.equal(store.links[0].url, 'ftp://example.com/file')
  assert.equal(JSON.parse(savedValue).schemaVersion, currentSchemaVersion)
})

test('并发更新通过写入队列合并到最新状态', async () => {
  await store.replaceData({
    categories: [{ id: 'c1', name: '分类', children: [] }],
    links: [
      { id: 'a', title: 'A', url: 'https://example.com/a', categoryId: 'c1' },
      { id: 'b', title: 'B', url: 'https://example.com/b', categoryId: 'c1' }
    ]
  })

  await Promise.all([
    store.updateLink('a', { favorite: true }),
    store.updateLink('b', { favorite: true })
  ])

  assert.equal(store.links.find(link => link.id === 'a').favorite, true)
  assert.equal(store.links.find(link => link.id === 'b').favorite, true)
  const persisted = JSON.parse(savedValue)
  assert.equal(persisted.links.find(link => link.id === 'a').favorite, true)
  assert.equal(persisted.links.find(link => link.id === 'b').favorite, true)
})

test('Tauri 2 环境检测兼容 internals 和全局 API 标记', () => {
  assert.equal(isTauriEnvironment({ __TAURI_INTERNALS__: {} }), true)
  assert.equal(isTauriEnvironment({ __TAURI__: {} }), true)
  assert.equal(isTauriEnvironment({}), false)
})

test('初始化与用户写操作共享同一串行边界', async () => {
  setLegacyData(JSON.stringify({
    categories: [{ id: 'c1', name: '分类', children: [] }],
    links: [{
      id: 'a',
      title: 'A',
      url: 'https://example.com/a',
      categoryId: 'c1',
      favorite: false
    }]
  }))
  store.initialized = false

  await Promise.all([
    store.init(),
    store.toggleFavorite('a')
  ])

  assert.equal(store.links[0].favorite, true)
  assert.equal(JSON.parse(savedValue).links[0].favorite, true)
})

test('分类链接计数单次扫描并汇总一级分类', () => {
  assert.equal(buildCategoryLinkCountMap([], []).size, 0)

  const counts = buildCategoryLinkCountMap(
    [{
      id: 'parent',
      children: [{ id: 'child-a' }, { id: 'child-b' }]
    }],
    [
      { categoryId: 'parent' },
      { categoryId: 'child-a' },
      { categoryId: 'child-a' },
      { categoryId: 'other' }
    ]
  )

  assert.equal(counts.get('parent'), 3)
  assert.equal(counts.get('child-a'), 2)
  assert.equal(counts.get('child-b') || 0, 0)
  assert.equal(counts.get('other'), 1)
})

test('连续访问通过串行队列合并为一次持久化', async () => {
  await store.replaceData({
    categories: [{ id: 'c1', name: '分类', children: [] }],
    links: [{
      id: 'a',
      title: 'A',
      url: 'https://example.com/a',
      categoryId: 'c1',
      visitCount: 0
    }]
  })
  setItemCalls = 0

  const firstVisit = store.recordVisit('a')
  const secondVisit = store.recordVisit('a')
  assert.equal(store.links[0].visitCount, 0)

  const flush = store.flushPendingVisits()
  await Promise.all([firstVisit, secondVisit, flush])

  assert.equal(store.links[0].visitCount, 2)
  assert.equal(setItemCalls, 1)
  assert.equal(JSON.parse(savedValue).links[0].visitCount, 2)
})

test('队列写入进行中产生的访问不会被旧快照覆盖', async () => {
  await store.replaceData({
    categories: [{ id: 'c1', name: '分类', children: [] }],
    links: [{
      id: 'a',
      title: 'A',
      url: 'https://example.com/a',
      categoryId: 'c1',
      visitCount: 0,
      favorite: false
    }]
  })

  visitDuringNextSaveId = 'a'
  reentrantVisitPromise = null
  await store.toggleFavorite('a')
  const flush = store.flushPendingVisits()
  await Promise.all([reentrantVisitPromise, flush])

  assert.equal(store.links[0].favorite, true)
  assert.equal(store.links[0].visitCount, 1)
  const persisted = JSON.parse(savedValue).links[0]
  assert.equal(persisted.favorite, true)
  assert.equal(persisted.visitCount, 1)
})

test('访问批次写入期间的新访问进入下一批次', async () => {
  await store.replaceData({
    categories: [{ id: 'c1', name: '分类', children: [] }],
    links: [{
      id: 'a',
      title: 'A',
      url: 'https://example.com/a',
      categoryId: 'c1',
      visitCount: 0
    }]
  })

  const firstVisit = store.recordVisit('a')
  visitDuringNextSaveId = 'a'
  reentrantVisitPromise = null
  await store.flushPendingVisits()
  await firstVisit
  const secondFlush = store.flushPendingVisits()
  await Promise.all([reentrantVisitPromise, secondFlush])

  assert.equal(store.links[0].visitCount, 2)
  assert.equal(JSON.parse(savedValue).links[0].visitCount, 2)
})

test('完整数据导入取消旧访问批次且不污染同 ID 链接', async () => {
  await store.replaceData({
    categories: [{ id: 'c1', name: '分类', children: [] }],
    links: [{
      id: 'a',
      title: '旧链接',
      url: 'https://example.com/old',
      categoryId: 'c1',
      visitCount: 0
    }]
  })

  const obsoleteVisit = store.recordVisit('a')
  await store.replaceData({
    categories: [{ id: 'c1', name: '分类', children: [] }],
    links: [{
      id: 'a',
      title: '导入链接',
      url: 'https://example.com/imported',
      categoryId: 'c1',
      visitCount: 10
    }]
  })

  assert.equal(await obsoleteVisit, false)
  assert.equal(await store.flushPendingVisits(), false)
  assert.equal(store.links[0].visitCount, 10)
  assert.equal(JSON.parse(savedValue).links[0].visitCount, 10)
})

test('访问批次写入失败会拒绝调用方且允许后续重试', async () => {
  await store.replaceData({
    categories: [{ id: 'c1', name: '分类', children: [] }],
    links: [{
      id: 'a',
      title: 'A',
      url: 'https://example.com/a',
      categoryId: 'c1',
      visitCount: 0
    }]
  })

  const originalConsoleError = console.error
  console.error = () => {}
  try {
    const failedVisit = store.recordVisit('a')
    failNextSetItem = true
    const failedFlush = store.flushPendingVisits()
    await Promise.all([
      assert.rejects(failedVisit, /storage unavailable/),
      assert.rejects(failedFlush, /storage unavailable/)
    ])
  } finally {
    console.error = originalConsoleError
  }
  assert.equal(store.links[0].visitCount, 0)

  const retryVisit = store.recordVisit('a')
  await Promise.all([retryVisit, store.flushPendingVisits()])
  assert.equal(store.links[0].visitCount, 1)
})
