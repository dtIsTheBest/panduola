import assert from 'node:assert/strict'
import { before, test } from 'node:test'

let store
let normalizeData
let validateImportData
let currentSchemaVersion
let defaultChildId
const storageValues = new Map()
let failNextWrite = false

function createLegacyRecord(id, measuredAt) {
  return {
    id,
    measuredAt,
    heightCm: 100,
    weightKg: 15,
    headCircumferenceCm: null,
    note: '',
    createdAt: 1,
    updatedAt: 1
  }
}

function createChild(id, name, timestamp = 1) {
  return { id, name, createdAt: timestamp, updatedAt: timestamp }
}

function createV3Snapshot(overrides = {}) {
  return {
    schemaVersion: 3,
    categories: [{ id: 'c1', name: '分类', children: [] }],
    links: [],
    growthChildren: [createChild('child-a', '大宝')],
    growthRecords: [],
    ...overrides
  }
}

before(async () => {
  globalThis.localStorage = {
    getItem(key) {
      return storageValues.get(key) ?? null
    },
    setItem(key, value) {
      if (failNextWrite) {
        failNextWrite = false
        throw new Error('storage unavailable')
      }
      storageValues.set(key, value)
    },
    removeItem(key) {
      storageValues.delete(key)
    }
  }
  const storeModule = await import('../src/data/store.js')
  store = storeModule.store
  normalizeData = storeModule.normalizeData
  validateImportData = storeModule.validateImportData
  currentSchemaVersion = storeModule.CURRENT_SCHEMA_VERSION
  defaultChildId = storeModule.DEFAULT_GROWTH_CHILD_ID
})

test('历史成长记录确定性迁移到默认孩子且不修改输入', () => {
  const legacy = {
    schemaVersion: 2,
    categories: [{ id: 'c1', name: '分类', children: [] }],
    links: [],
    growthRecords: [
      createLegacyRecord('growth-1', '2026-01-01'),
      createLegacyRecord('growth-2', '2026-01-01'),
      createLegacyRecord('growth-2', '2026-02-01')
    ]
  }
  const original = structuredClone(legacy)
  const first = normalizeData(legacy)
  const second = normalizeData(legacy)

  assert.equal(first.schemaVersion, currentSchemaVersion)
  assert.deepEqual(first, second)
  assert.deepEqual(legacy, original)
  assert.deepEqual(first.growthChildren, [{
    id: defaultChildId,
    name: '孩子 1',
    createdAt: 0,
    updatedAt: 0
  }])
  assert.equal(first.growthRecords.length, 3)
  assert.equal(new Set(first.growthRecords.map(record => record.id)).size, 3)
  assert.deepEqual(first.growthRecords.map(record => record.childId), [
    defaultChildId,
    defaultChildId,
    defaultChildId
  ])
  assert.equal(first.growthRecords.filter(record => record.measuredAt === '2026-01-01').length, 2)
})

test('Schema v3 接受同日不同孩子并校验孩子和记录边界', () => {
  const sameDateRecords = [
    { ...createLegacyRecord('growth-a', '2026-03-01'), childId: 'child-a' },
    { ...createLegacyRecord('growth-b', '2026-03-01'), childId: 'child-b' }
  ]
  const valid = validateImportData(createV3Snapshot({
    growthChildren: [
      createChild('child-a', '一'.repeat(20)),
      createChild('child-b', '二宝')
    ],
    growthRecords: sameDateRecords
  }))
  assert.equal(valid.growthRecords.length, 2)

  const grandfathered = validateImportData(createV3Snapshot({
    growthRecords: [
      { ...createLegacyRecord('legacy-a', '2026-03-02'), childId: 'child-a' },
      { ...createLegacyRecord('legacy-b', '2026-03-02'), childId: 'child-a' }
    ]
  }))
  assert.equal(grandfathered.growthRecords.length, 2)

  assert.throws(
    () => validateImportData(createV3Snapshot({ growthChildren: [] })),
    /孩子档案数量/
  )
  assert.throws(
    () => validateImportData(createV3Snapshot({
      growthChildren: [createChild('child-a', '一'.repeat(21))]
    })),
    /孩子档案的 ID、名称或时间无效/
  )
  assert.throws(
    () => validateImportData(createV3Snapshot({
      growthChildren: [createChild('child-a', '大宝'), createChild('child-b', '大宝')]
    })),
    /孩子名称不能重复/
  )
  assert.throws(
    () => validateImportData(createV3Snapshot({
      growthChildren: [createChild('child-a', '大宝'), createChild('child-a', '二宝')]
    })),
    /孩子档案 ID 不能重复/
  )
  assert.throws(
    () => validateImportData(createV3Snapshot({
      growthChildren: Array.from({ length: 21 }, (_, index) => (
        createChild(`child-${index}`, `孩子 ${index}`)
      ))
    })),
    /孩子档案数量/
  )
  assert.throws(
    () => validateImportData(createV3Snapshot({
      growthRecords: [{
        ...createLegacyRecord('growth-a', '2026-03-01'),
        childId: 'missing-child'
      }]
    })),
    /成长记录的 ID、日期、身高、体重、头围或备注无效/
  )
  assert.throws(
    () => validateImportData(createV3Snapshot({
      growthRecords: [
        { ...createLegacyRecord('same-id', '2026-03-01'), childId: 'child-a' },
        { ...createLegacyRecord('same-id', '2026-04-01'), childId: 'child-a' }
      ]
    })),
    /成长记录 ID 不能重复/
  )
  assert.throws(
    () => validateImportData({ ...createV3Snapshot(), schemaVersion: 4 }),
    /不支持的快照版本：4/
  )
  assert.throws(
    () => validateImportData({ ...createV3Snapshot(), schemaVersion: '3' }),
    /schemaVersion 必须是整数/
  )
  assert.throws(
    () => normalizeData({ ...createV3Snapshot(), schemaVersion: 4.5 }),
    /schemaVersion 必须是整数/
  )
})

test('孩子与成长记录 CRUD 按归属隔离并原子持久化', async () => {
  storageValues.clear()
  await store.init()
  await store.replaceData(createV3Snapshot())
  await store.addGrowthChild(createChild('child-b', '二宝', 2))
  await store.upsertGrowthRecord({
    ...createLegacyRecord('growth-a', '2026-04-01'),
    childId: 'child-a'
  })
  await store.upsertGrowthRecord({
    ...createLegacyRecord('growth-b', '2026-04-01'),
    childId: 'child-b'
  })

  assert.equal(store.growthChildren.length, 2)
  assert.equal(store.growthRecords.length, 2)
  await assert.rejects(
    store.upsertGrowthRecord({
      ...createLegacyRecord('growth-a', '2026-05-01'),
      childId: 'child-b'
    }),
    /不能转移到其他孩子/
  )
  assert.equal(await store.deleteGrowthRecord('growth-a', 'child-b'), false)
  assert.equal(store.growthRecords.length, 2)
  assert.equal(await store.deleteGrowthRecord('growth-a', 'child-a'), true)
  assert.equal(store.growthRecords.length, 1)

  await assert.rejects(store.renameGrowthChild('child-b', '大宝'), /孩子名称不能重复/)
  assert.equal(await store.renameGrowthChild('child-b', '小宝', 3), true)
  assert.equal(store.growthChildren.find(child => child.id === 'child-b').name, '小宝')

  await Promise.all([
    store.addGrowthChild(createChild('child-c', '三宝', 4)),
    store.addGrowthChild(createChild('child-d', '四宝', 5))
  ])
  assert.equal(store.growthChildren.length, 4)

  const snapshotBeforeFailure = structuredClone(store.getSnapshot())
  failNextWrite = true
  await assert.rejects(store.renameGrowthChild('child-b', '小宝新名', 6), /保存本地数据失败/)
  assert.deepEqual(store.getSnapshot(), snapshotBeforeFailure)

  const savedEnvelope = JSON.parse(storageValues.get('panduola_space:guest'))
  assert.equal(savedEnvelope.snapshot.schemaVersion, 3)
  assert.deepEqual(savedEnvelope.snapshot.growthRecords.map(record => record.childId), ['child-b'])
})

test('旧 UI 单孩缺参兼容且多孩缺参 fail-closed', async () => {
  await store.replaceData(createV3Snapshot())
  await store.upsertGrowthRecord(createLegacyRecord('legacy-ui', '2026-06-01'))
  assert.equal(store.growthRecords[0].childId, 'child-a')
  assert.equal(await store.deleteGrowthRecord('legacy-ui'), true)

  await store.addGrowthChild(createChild('child-b', '二宝', 2))
  await assert.rejects(
    store.upsertGrowthRecord(createLegacyRecord('missing-child', '2026-06-02')),
    /成长记录的 ID、日期、身高、体重、头围或备注无效/
  )
  assert.equal(await store.deleteGrowthRecord('missing-child'), false)
})

test('历史同日记录可原日期编辑但不能新增更多重复', async () => {
  await store.replaceData(createV3Snapshot({
    growthRecords: [
      { ...createLegacyRecord('legacy-a', '2026-07-01'), childId: 'child-a' },
      { ...createLegacyRecord('legacy-b', '2026-07-01'), childId: 'child-a' }
    ]
  }))
  await store.upsertGrowthRecord({
    ...store.growthRecords[0],
    weightKg: 16,
    updatedAt: 2
  })
  assert.equal(store.growthRecords.find(record => record.id === 'legacy-a').weightKg, 16)
  await assert.rejects(
    store.upsertGrowthRecord({
      ...createLegacyRecord('new-duplicate', '2026-07-01'),
      childId: 'child-a'
    }),
    /该孩子在所选日期已经有成长记录/
  )
})

test('权威替换 generation 阻止旧写入且普通提交不递增', async () => {
  const beforeReplace = store.dataGeneration
  await store.replaceData(createV3Snapshot())
  assert.equal(store.dataGeneration, beforeReplace + 1)

  const currentGeneration = store.dataGeneration
  await store.upsertGrowthRecord({
    ...createLegacyRecord('generation-record', '2026-08-01'),
    childId: 'child-a'
  }, { expectedDataGeneration: currentGeneration })
  assert.equal(store.dataGeneration, currentGeneration)

  await store.replaceData(createV3Snapshot())
  await assert.rejects(
    store.addGrowthChild(createChild('stale-child', '旧操作'), {
      expectedDataGeneration: currentGeneration
    }),
    /数据已更新，请重新操作/
  )
})
