import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEVELOPMENT_GUIDE_SOURCES,
  DEVELOPMENT_STAGE_GUIDANCE,
  GROWTH_STANDARD_GROUPS,
  HEALTH_CHECKUP_GROUPS,
  VISION_CHECKUP_GROUPS,
  getDevelopmentStageGuidance
} from '../src/data/childDevelopmentGuide.js'
import { normalizeData, validateImportData } from '../src/data/store.js'
import { isSafeExternalUrl } from '../src/utils/externalLinks.js'

const CHILD_AGE_STAGE_IDS = [
  'age0-1',
  'age1-3',
  'age3-6',
  'age6-9',
  'age9-12',
  'age12-15',
  'age15-18'
]

test('成长标准覆盖七岁以下、学龄期身高和学龄期 BMI', () => {
  assert.deepEqual(GROWTH_STANDARD_GROUPS.map(group => group.id), [
    'under-7',
    'school-height',
    'school-bmi'
  ])
  assert.equal(GROWTH_STANDARD_GROUPS[0].indicators.includes('0～3 岁年龄别头围'), true)
  assert.equal(GROWTH_STANDARD_GROUPS.every(Object.isFrozen), true)
})

test('儿童阶段均映射到适用标准且成年阶段安全降级', () => {
  for (const stageId of CHILD_AGE_STAGE_IDS) {
    const guidance = getDevelopmentStageGuidance(stageId)
    assert.ok(guidance)
    assert.ok(guidance.standardIds.length >= 1)
  }
  assert.equal(getDevelopmentStageGuidance('age22+'), null)
  assert.equal(getDevelopmentStageGuidance('unknown'), null)
  assert.equal(getDevelopmentStageGuidance('toString'), null)
  assert.equal(getDevelopmentStageGuidance('__proto__'), null)
  assert.equal(Object.isFrozen(DEVELOPMENT_STAGE_GUIDANCE), true)
})

test('儿童健康和眼保健时间点均完整覆盖十三次服务', () => {
  const healthCheckupCount = HEALTH_CHECKUP_GROUPS.reduce((total, group) => total + group.points.length, 0)
  const visionCheckupCount = VISION_CHECKUP_GROUPS.reduce((total, group) => total + group.count, 0)

  assert.equal(healthCheckupCount, 13)
  assert.equal(visionCheckupCount, 13)
})

test('官方资料全部使用国家卫生机构 HTTPS 地址', () => {
  const allowedHosts = new Set(['www.nhc.gov.cn', 'www.ndcpa.gov.cn', 'www.chinacdc.cn'])
  for (const source of DEVELOPMENT_GUIDE_SOURCES) {
    assert.equal(isSafeExternalUrl(source.url), true)
    const parsed = new URL(source.url)
    assert.equal(parsed.protocol, 'https:')
    assert.equal(allowedHosts.has(parsed.hostname), true)
  }
})

test('系统占位资源会升级为官方链接且保留使用数据', () => {
  const migrated = normalizeData({
    categories: [{ id: 'c1', name: '育儿知识', children: [] }],
    links: [{
      id: 'l3',
      title: '儿童生长发育标准表',
      url: 'https://example.com/growth-chart',
      categoryId: 'c1',
      favorite: true,
      visitCount: 7
    }]
  })

  assert.equal(migrated.links[0].title, '7岁以下儿童生长标准')
  assert.equal(migrated.links[0].url.startsWith('https://www.nhc.gov.cn/'), true)
  assert.equal(migrated.links[0].favorite, true)
  assert.equal(migrated.links[0].visitCount, 7)
  assert.deepEqual(migrated.links[0].ageStages, ['age0-1', 'age1-3', 'age3-6', 'age6-9'])
})

test('关键官方资源的年龄标签与标准适用范围一致', () => {
  const migrated = normalizeData({
    categories: [{ id: 'c1', name: '育儿知识', children: [] }],
    links: [
      { id: 'l4', title: '疫苗', url: 'https://example.com/vaccine-schedule', categoryId: 'c1' },
      { id: 'l7', title: '身高', url: 'https://example.com/growth-calculator', categoryId: 'c1' },
      { id: 'l8', title: '视力', url: 'https://example.com/eye-care', categoryId: 'c1' }
    ]
  })

  assert.equal(migrated.links[0].ageStages.includes('age12-15'), true)
  assert.deepEqual(migrated.links[1].ageStages, ['age6-9', 'age9-12', 'age12-15', 'age15-18'])
  assert.deepEqual(migrated.links[1].tags, ['身高', '发育', '标准'])
  assert.deepEqual(migrated.links[2].ageStages, ['age0-1', 'age1-3', 'age3-6', 'age6-9'])
})

test('用户自定义 URL 保持原样且旧备份中的系统占位链接确定性迁移', () => {
  const baseData = {
    categories: [{ id: 'c1', name: '育儿知识', children: [] }],
    links: [{
      id: 'l3',
      title: '我的生长资料',
      url: 'https://family.example.org/growth',
      categoryId: 'c1'
    }]
  }
  assert.equal(normalizeData(baseData).links[0].url, 'https://family.example.org/growth')

  const importedBackup = {
    ...baseData,
    links: [{
      id: 'l3',
      title: '导入的占位资料',
      url: 'https://example.com/growth-chart',
      categoryId: 'c1'
    }]
  }
  const imported = validateImportData(importedBackup)
  assert.equal(imported.links[0].url.startsWith('https://www.nhc.gov.cn/'), true)
  assert.equal(importedBackup.links[0].url, 'https://example.com/growth-chart')
  assert.deepEqual(normalizeData(imported), imported)
})
