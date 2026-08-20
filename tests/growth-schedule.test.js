import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeData, store, validateImportData } from '../src/data/store.js'
import {
  addDays,
  getOccurrenceStatus,
  getScheduleOccurrences,
  isValidDateOnly
} from '../src/utils/growthSchedule.js'

function item(id, recurrence, startDate = '2026-08-20') {
  return {
    id,
    childId: null,
    title: id,
    type: 'habit',
    startDate,
    startTime: '08:00',
    recurrence,
    note: '',
    createdAt: 1,
    updatedAt: 1
  }
}

test('日期工具覆盖闰日和非法日期', () => {
  assert.equal(isValidDateOnly('2024-02-29'), true)
  assert.equal(isValidDateOnly('2025-02-29'), false)
  assert.equal(addDays('2024-02-28', 1), '2024-02-29')
})

test('一次性、每日和每周日程按窗口展开并独立完成', () => {
  const items = [item('once', 'none'), item('daily', 'daily'), item('weekly', 'weekly')]
  const completions = [{
    id: 'completion-1',
    scheduleId: 'daily',
    occurrenceDate: '2026-08-21',
    completedAt: 1
  }]
  const occurrences = getScheduleOccurrences(items, completions, '2026-08-20', '2026-08-27')

  assert.equal(occurrences.filter(value => value.id === 'once').length, 1)
  assert.equal(occurrences.filter(value => value.id === 'daily').length, 8)
  assert.equal(occurrences.filter(value => value.id === 'weekly').length, 2)
  assert.equal(
    occurrences.find(value => value.id === 'daily' && value.occurrenceDate === '2026-08-21').completed,
    true
  )
  assert.throws(
    () => getScheduleOccurrences(items, completions, '2026-01-01', '2026-12-31'),
    /不能超过 31 天/
  )
  assert.equal(
    occurrences.find(value => value.id === 'daily' && value.occurrenceDate === '2026-08-22').completed,
    false
  )
})

test('日程状态区分完成、逾期、今天和未来', () => {
  const base = { occurrenceDate: '2026-08-20', startTime: '08:00', completed: false }
  assert.equal(getOccurrenceStatus({ ...base, completed: true }, '2026-08-20', '09:00'), 'completed')
  assert.equal(getOccurrenceStatus(base, '2026-08-20', '09:00'), 'overdue')
  assert.equal(getOccurrenceStatus({ ...base, startTime: '10:00' }, '2026-08-20', '09:00'), 'today')
  assert.equal(getOccurrenceStatus({ ...base, occurrenceDate: '2026-08-21' }, '2026-08-20'), 'upcoming')
})

test('Schema v3 确定性迁移为空日程集合且 v4 严格校验引用', () => {
  const migrated = normalizeData({
    schemaVersion: 3,
    categories: [],
    links: [],
    growthChildren: [{
      id: 'growth-child-default',
      name: '孩子 1',
      createdAt: 0,
      updatedAt: 0
    }],
    growthRecords: []
  })
  assert.equal(migrated.schemaVersion, 4)
  assert.deepEqual(migrated.scheduleItems, [])
  assert.deepEqual(migrated.scheduleCompletions, [])

  assert.throws(() => validateImportData({
    ...migrated,
    scheduleItems: [item('invalid-child', 'none')].map(value => ({
      ...value,
      childId: 'missing-child'
    }))
  }), /成长日程的标题、归属、类型、日期、时间、重复规则或备注无效/)

  const weekly = item('weekly-import', 'weekly')
  assert.throws(() => validateImportData({
    ...migrated,
    scheduleItems: [weekly],
    scheduleCompletions: [{
      id: 'bad-completion',
      scheduleId: weekly.id,
      occurrenceDate: '2026-08-21',
      completedAt: 1
    }]
  }), /成长日程完成记录无效/)
})

test('Store 日程完成幂等、非法 occurrence 拒绝且模板编辑清理失效完成', async () => {
  const values = new Map()
  globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  }
  await store.init()
  const base = normalizeData({ categories: [], links: [] })
  await store.replaceData(base)
  const schedule = item('weekly-store', 'weekly')
  await store.upsertScheduleItem(schedule, { expectedDataGeneration: store.dataGeneration })

  assert.equal(await store.setScheduleOccurrenceCompleted(
    schedule.id,
    '2026-08-27',
    true,
    { expectedDataGeneration: store.dataGeneration }
  ), true)
  const completionId = store.scheduleCompletions[0].id
  assert.equal(await store.setScheduleOccurrenceCompleted(
    schedule.id,
    '2026-08-27',
    true,
    { expectedDataGeneration: store.dataGeneration }
  ), false)
  assert.equal(store.scheduleCompletions[0].id, completionId)
  await assert.rejects(
    store.setScheduleOccurrenceCompleted(schedule.id, '2026-08-21', true),
    /不是日程发生日期/
  )
  await assert.rejects(
    store.setScheduleOccurrenceCompleted(schedule.id, '2026-08-27', 'false'),
    /completed 必须是布尔值/
  )

  await store.upsertScheduleItem({ ...schedule, startDate: '2026-08-21', updatedAt: 2 })
  assert.equal(store.scheduleCompletions.length, 0)
  await store.setScheduleOccurrenceCompleted(schedule.id, '2026-08-28', true)
  assert.equal(store.scheduleCompletions.length, 1)
  assert.equal(await store.deleteScheduleItem(schedule.id), true)
  assert.equal(store.scheduleItems.length, 0)
  assert.equal(store.scheduleCompletions.length, 0)
})
