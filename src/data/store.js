import { reactive } from 'vue'
import { AppError, ERROR_CODES } from '../account/errors.js'
import { isSafeExternalUrl } from '../utils/externalLinks.js'
import {
  GUEST_SPACE_KEY,
  assertValidSpaceKey,
  createDataSpaceRepository
} from './dataSpaceRepository.js'

export const CURRENT_SCHEMA_VERSION = 2

export function isTauriEnvironment(targetWindow = globalThis.window) {
  return Boolean(targetWindow && (targetWindow.__TAURI_INTERNALS__ || targetWindow.__TAURI__))
}

const isTauri = isTauriEnvironment()

async function getInvoke() {
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke
  }
  return null
}

export const AGE_STAGES = [
  {
    id: 'age0-1',
    title: '婴儿期',
    ageRange: '0–1 岁',
    description: '重点关注喂养、睡眠、疫苗接种与早期生长发育。'
  },
  {
    id: 'age1-3',
    title: '幼儿期',
    ageRange: '1–3 岁',
    description: '重点关注辅食营养、语言启蒙、行为习惯与居家安全。'
  },
  {
    id: 'age3-6',
    title: '学龄前',
    ageRange: '3–6 岁',
    description: '重点关注入园适应、社交能力、阅读启蒙与健康管理。'
  },
  {
    id: 'age6-9',
    title: '小学低年级',
    ageRange: '6–9 岁',
    description: '重点关注学习习惯、阅读兴趣、运动锻炼与规律作息。'
  },
  {
    id: 'age9-12',
    title: '小学高年级',
    ageRange: '9–12 岁',
    description: '重点关注自主学习、视力健康、兴趣发展与亲子沟通。'
  },
  {
    id: 'age12-15',
    title: '初中阶段',
    ageRange: '12–15 岁',
    description: '重点关注青春期变化、情绪管理、学习节奏与网络安全。'
  },
  {
    id: 'age15-18',
    title: '高中阶段',
    ageRange: '15–18 岁',
    description: '重点关注学业规划、身心健康、升学准备与专业选择。'
  },
  {
    id: 'age18-22',
    title: '大学阶段',
    ageRange: '18–22 岁',
    description: '重点关注独立生活、专业学习、财务管理与职业探索。'
  },
  {
    id: 'age22+',
    title: '成年阶段',
    ageRange: '22 岁 +',
    description: '重点关注职场发展、生活规划、健康管理与家庭关系。'
  }
]

const defaultCategories = [
  {
    id: 'c1',
    name: '育儿知识',
    icon: 'Baby',
    color: '#6366f1',
    children: [
      { id: 'c1-1', name: '喂养', icon: 'Utensils', color: '#8b5cf6', parentId: 'c1', ageStages: ['age0-1', 'age1-3'] },
      { id: 'c1-2', name: '睡眠', icon: 'Moon', color: '#06b6d4', parentId: 'c1', ageStages: ['age0-1', 'age1-3'] },
      { id: 'c1-3', name: '发育', icon: 'TrendingUp', color: '#10b981', parentId: 'c1', ageStages: ['age0-1', 'age1-3', 'age3-6'] },
      { id: 'c1-4', name: '教育', icon: 'GraduationCap', color: '#f59e0b', parentId: 'c1', ageStages: ['age3-6', 'age6-9', 'age9-12', 'age12-15', 'age15-18', 'age18-22'] }
    ]
  },
  {
    id: 'c2',
    name: '健康医疗',
    icon: 'Heart',
    color: '#ef4444',
    children: [
      { id: 'c2-1', name: '疫苗接种', icon: 'Syringe', color: '#ec4899', parentId: 'c2', ageStages: ['age0-1', 'age1-3'] },
      { id: 'c2-2', name: '常见病', icon: 'Stethoscope', color: '#f97316', parentId: 'c2', ageStages: ['age0-1', 'age1-3', 'age3-6', 'age6-9', 'age9-12', 'age12-15'] },
      { id: 'c2-3', name: '体检', icon: 'Activity', color: '#14b8a6', parentId: 'c2', ageStages: ['age0-1', 'age1-3', 'age3-6', 'age6-9', 'age9-12', 'age12-15', 'age15-18', 'age18-22', 'age22+'] }
    ]
  },
  {
    id: 'c3',
    name: '生活服务',
    icon: 'Home',
    color: '#10b981',
    children: [
      { id: 'c3-1', name: '母婴用品', icon: 'ShoppingBag', color: '#0ea5e9', parentId: 'c3', ageStages: ['age0-1', 'age1-3'] },
      { id: 'c3-2', name: '早教机构', icon: 'Building', color: '#84cc16', parentId: 'c3', ageStages: ['age3-6'] },
      { id: 'c3-3', name: '亲子活动', icon: 'Users', color: '#f43f5e', parentId: 'c3', ageStages: ['age1-3', 'age3-6', 'age6-9', 'age9-12'] }
    ]
  },
  {
    id: 'c4',
    name: '亲子阅读',
    icon: 'BookOpen',
    color: '#f59e0b',
    children: [
      { id: 'c4-1', name: '绘本推荐', icon: 'BookMarked', color: '#d946ef', parentId: 'c4', ageStages: ['age0-1', 'age1-3', 'age3-6'] },
      { id: 'c4-2', name: '故事音频', icon: 'Headphones', color: '#22d3ee', parentId: 'c4', ageStages: ['age1-3', 'age3-6'] }
    ]
  },
  {
    id: 'c5',
    name: '实用工具',
    icon: 'Wrench',
    color: '#64748b',
    children: [
      { id: 'c5-1', name: '身高体重', icon: 'Ruler', color: '#6366f1', parentId: 'c5', ageStages: ['age0-1', 'age1-3', 'age3-6', 'age6-9', 'age9-12', 'age12-15', 'age15-18'] },
      { id: 'c5-2', name: '作息记录', icon: 'Calendar', color: '#3b82f6', parentId: 'c5', ageStages: ['age0-1', 'age1-3', 'age3-6', 'age6-9'] },
      { id: 'c5-3', name: '辅食计算器', icon: 'Calculator', color: '#10b981', parentId: 'c5', ageStages: ['age0-1', 'age1-3'] }
    ]
  }
]

const defaultLinks = [
  {
    id: 'l1',
    title: '宝宝辅食大全',
    url: 'https://example.com/baby-food',
    description: '0-3岁宝宝辅食食谱推荐，营养搭配指南',
    categoryId: 'c1-1',
    tags: ['辅食', '食谱', '营养'],
    ageStages: ['age0-1', 'age1-3'],
    createdAt: Date.now(),
    favorite: false,
    visitCount: 0,
    lastVisit: null,
    isDefault: true
  },
  {
    id: 'l2',
    title: '宝宝睡眠训练指南',
    url: 'https://example.com/sleep-training',
    description: '帮助宝宝建立良好睡眠习惯的实用方法',
    categoryId: 'c1-2',
    tags: ['睡眠', '训练', '习惯'],
    ageStages: ['age0-1', 'age1-3', 'age3-6'],
    createdAt: Date.now(),
    favorite: false,
    visitCount: 0,
    lastVisit: null,
    isDefault: true
  },
  {
    id: 'l3',
    title: '儿童生长发育标准表',
    url: 'https://example.com/growth-chart',
    description: '0-18岁儿童身高体重发育参考标准',
    categoryId: 'c1-3',
    tags: ['发育', '身高', '体重'],
    ageStages: ['age0-1', 'age1-3', 'age3-6', 'age6-9', 'age9-12', 'age12-15'],
    createdAt: Date.now(),
    favorite: false,
    visitCount: 0,
    lastVisit: null,
    isDefault: true
  },
  {
    id: 'l4',
    title: '国家免疫规划疫苗程序',
    url: 'https://example.com/vaccine-schedule',
    description: '中国儿童疫苗接种时间表及注意事项',
    categoryId: 'c2-1',
    tags: ['疫苗', '接种', '免疫'],
    ageStages: ['age0-1', 'age1-3', 'age3-6', 'age6-9', 'age9-12'],
    createdAt: Date.now(),
    favorite: true,
    visitCount: 0,
    lastVisit: null,
    isDefault: true
  },
  {
    id: 'l5',
    title: '宝宝常见病症状及护理',
    url: 'https://example.com/common-illness',
    description: '发烧、咳嗽、腹泻等常见症状的家庭护理方法',
    categoryId: 'c2-2',
    tags: ['常见病', '护理', '发烧'],
    ageStages: ['age0-1', 'age1-3', 'age3-6', 'age6-9', 'age9-12'],
    createdAt: Date.now(),
    favorite: false,
    visitCount: 0,
    lastVisit: null,
    isDefault: true
  },
  {
    id: 'l6',
    title: '优秀绘本推荐清单',
    url: 'https://example.com/picture-books',
    description: '0-6岁必读经典绘本推荐，培养阅读兴趣',
    categoryId: 'c4-1',
    tags: ['绘本', '阅读', '推荐'],
    ageStages: ['age1-3', 'age3-6'],
    createdAt: Date.now(),
    favorite: false,
    visitCount: 0,
    lastVisit: null,
    isDefault: true
  },
  {
    id: 'l7',
    title: '宝宝身高体重计算器',
    url: 'https://example.com/growth-calculator',
    description: '输入宝宝年龄和身高体重，查看发育百分位',
    categoryId: 'c5-1',
    tags: ['身高', '体重', '计算'],
    ageStages: ['age0-1', 'age1-3', 'age3-6', 'age6-9', 'age9-12', 'age12-15', 'age15-18'],
    createdAt: Date.now(),
    favorite: false,
    visitCount: 0,
    lastVisit: null,
    isDefault: true
  },
  {
    id: 'l8',
    title: '儿童视力保护指南',
    url: 'https://example.com/eye-care',
    description: '保护儿童视力的科学方法和注意事项',
    categoryId: 'c2-2',
    tags: ['视力', '保护', '眼睛'],
    ageStages: ['age3-6', 'age6-9', 'age9-12', 'age12-15'],
    createdAt: Date.now(),
    favorite: false,
    visitCount: 0,
    lastVisit: null,
    isDefault: true
  },
  {
    id: 'l9',
    title: '小学生学习方法指导',
    url: 'https://example.com/study-methods',
    description: '适合小学生的高效学习方法和习惯养成',
    categoryId: 'c1-4',
    tags: ['学习', '方法', '习惯'],
    ageStages: ['age6-9', 'age9-12'],
    createdAt: Date.now(),
    favorite: false,
    visitCount: 0,
    lastVisit: null,
    isDefault: true
  },
  {
    id: 'l10',
    title: '青春期心理辅导',
    url: 'https://example.com/adolescent-mental',
    description: '帮助青少年应对青春期的心理变化和挑战',
    categoryId: 'c1-4',
    tags: ['青春期', '心理', '辅导'],
    ageStages: ['age12-15', 'age15-18'],
    createdAt: Date.now(),
    favorite: false,
    visitCount: 0,
    lastVisit: null,
    isDefault: true
  },
  {
    id: 'l11',
    title: '高考志愿填报指南',
    url: 'https://example.com/gaokao-guide',
    description: '高考志愿填报的策略和注意事项',
    categoryId: 'c1-4',
    tags: ['高考', '志愿', '填报'],
    ageStages: ['age15-18'],
    createdAt: Date.now(),
    favorite: false,
    visitCount: 0,
    lastVisit: null,
    isDefault: true
  },
  {
    id: 'l12',
    title: '大学生职业规划',
    url: 'https://example.com/career-plan',
    description: '大学生如何规划未来职业发展方向',
    categoryId: 'c1-4',
    tags: ['职业', '规划', '大学'],
    ageStages: ['age18-22', 'age22+'],
    createdAt: Date.now(),
    favorite: false,
    visitCount: 0,
    lastVisit: null,
    isDefault: true
  }
]

const defaultLinkIds = new Set(defaultLinks.map(link => link.id))
const VISIT_PERSIST_DELAY_MS = 200
let mutationQueue = Promise.resolve()
let visitPersistTimer = null
let pendingVisitUpdates = new Map()
let visitPersistWaiters = []
let activeDataReplacements = 0
let activeSpaceKey = GUEST_SPACE_KEY
const localCommitListeners = new Set()

function cloneData(value) {
  return JSON.parse(JSON.stringify(value))
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) {
    deepFreeze(child)
  }
  return value
}

function enqueueMutation(mutation) {
  const result = mutationQueue.then(mutation)
  mutationQueue = result.catch(() => {})
  return result
}

function emitLocalCommit(snapshot, source) {
  if (!localCommitListeners.size) return
  const readonlySnapshot = deepFreeze(cloneData(snapshot))
  const event = Object.freeze({
    spaceKey: activeSpaceKey,
    snapshot: readonlySnapshot,
    source
  })
  for (const listener of localCommitListeners) {
    try {
      listener(event)
    } catch (error) {
      console.error('Local commit listener failed:', error)
    }
  }
}

function flushVisitPersistence(storeInstance) {
  if (visitPersistTimer) {
    clearTimeout(visitPersistTimer)
    visitPersistTimer = null
  }
  if (!visitPersistWaiters.length) return Promise.resolve(false)

  const updates = pendingVisitUpdates
  const waiters = visitPersistWaiters
  pendingVisitUpdates = new Map()
  visitPersistWaiters = []
  const result = enqueueMutation(async () => {
    const links = [...storeInstance.links]
    const linkIndexes = new Map()
    links.forEach((link, index) => {
      if (!linkIndexes.has(link.id)) linkIndexes.set(link.id, index)
    })
    const appliedIds = new Set()
    for (const [id, update] of updates) {
      const index = linkIndexes.get(id)
      if (index === undefined) continue
      links[index] = {
        ...links[index],
        visitCount: (links[index].visitCount || 0) + update.count,
        lastVisit: update.lastVisit
      }
      appliedIds.add(id)
    }
    if (!appliedIds.size) return appliedIds

    const data = storeInstance.getSnapshot(storeInstance.categories, links)
    await commitData(storeInstance, data, { source: 'visit' })
    return appliedIds
  })
  result.then(
    appliedIds => waiters.forEach(({ id, resolve }) => resolve(appliedIds.has(id))),
    error => waiters.forEach(({ reject }) => reject(error))
  )
  return result.then(appliedIds => appliedIds.size > 0)
}

function scheduleVisitPersistence(storeInstance, id) {
  const currentUpdate = pendingVisitUpdates.get(id) || { count: 0, lastVisit: null }
  pendingVisitUpdates.set(id, {
    count: currentUpdate.count + 1,
    lastVisit: Date.now()
  })
  const result = new Promise((resolve, reject) => {
    visitPersistWaiters.push({ id, resolve, reject })
  })
  if (!visitPersistTimer) {
    visitPersistTimer = setTimeout(() => {
      void flushVisitPersistence(storeInstance).catch(() => {})
    }, VISIT_PERSIST_DELAY_MS)
  }
  return result
}

function cancelVisitPersistence() {
  if (visitPersistTimer) {
    clearTimeout(visitPersistTimer)
    visitPersistTimer = null
  }
  pendingVisitUpdates = new Map()
  const waiters = visitPersistWaiters
  visitPersistWaiters = []
  waiters.forEach(({ resolve }) => resolve(false))
}

function normalizeStringArray(value, fieldName, strict) {
  if (strict && value !== undefined && (!Array.isArray(value) || value.some(item => typeof item !== 'string'))) {
    throw new TypeError(`${fieldName} 必须是字符串数组`)
  }
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

function normalizeCategory(category, path, strict, parentId) {
  const source = category && typeof category === 'object' ? category : {}
  if (strict && (typeof source.id !== 'string' || typeof source.name !== 'string')) {
    throw new TypeError('分类 id 和 name 必须是字符串')
  }
  if (strict && source.children !== undefined && !Array.isArray(source.children)) {
    throw new TypeError('分类 children 必须是数组')
  }

  const id = typeof source.id === 'string' && source.id ? source.id : `legacy-category-${path}`
  const children = (Array.isArray(source.children) ? source.children : [])
    .map((child, index) => normalizeCategory(child, `${path}-${index}`, strict, id))

  return {
    ...cloneData(source),
    id,
    name: typeof source.name === 'string' ? source.name : '未命名分类',
    icon: typeof source.icon === 'string' ? source.icon : 'Folder',
    color: typeof source.color === 'string' ? source.color : '#64748b',
    ...(parentId ? { parentId } : {}),
    ageStages: normalizeStringArray(source.ageStages, 'category.ageStages', strict),
    children
  }
}

function normalizeLink(link, index, strict) {
  const source = link && typeof link === 'object' ? link : {}
  if (strict && (
    typeof source.id !== 'string' ||
    typeof source.title !== 'string' ||
    typeof source.categoryId !== 'string' ||
    !isSafeExternalUrl(source.url)
  )) {
    throw new TypeError('链接 id、title、categoryId 或 URL 协议无效')
  }

  const id = typeof source.id === 'string' && source.id ? source.id : `legacy-link-${index}`
  return {
    ...cloneData(source),
    id,
    title: typeof source.title === 'string' ? source.title : '未命名链接',
    url: typeof source.url === 'string' ? source.url : '',
    description: typeof source.description === 'string' ? source.description : '',
    categoryId: typeof source.categoryId === 'string' ? source.categoryId : '',
    tags: normalizeStringArray(source.tags, 'link.tags', strict),
    ageStages: normalizeStringArray(source.ageStages, 'link.ageStages', strict),
    createdAt: Number.isFinite(source.createdAt) ? source.createdAt : 0,
    favorite: Boolean(source.favorite),
    visitCount: Number.isFinite(source.visitCount) ? Math.max(0, source.visitCount) : 0,
    lastVisit: Number.isFinite(source.lastVisit) ? source.lastVisit : null,
    isDefault: typeof source.isDefault === 'boolean'
      ? source.isDefault
      : defaultLinkIds.has(id)
  }
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function normalizeMeasurement(value, minimum, maximum) {
  const number = Number(value)
  return Number.isFinite(number) && number >= minimum && number <= maximum
    ? number
    : null
}

function normalizeGrowthRecord(record, index, strict) {
  const source = record && typeof record === 'object' ? record : {}
  const heightCm = normalizeMeasurement(source.heightCm, 20, 250)
  const weightKg = normalizeMeasurement(source.weightKg, 0.5, 300)
  const headCircumferenceCm = source.headCircumferenceCm === null || source.headCircumferenceCm === undefined
    ? null
    : normalizeMeasurement(source.headCircumferenceCm, 20, 80)
  const valid = (
    typeof source.id === 'string' &&
    source.id.length > 0 &&
    isValidDateOnly(source.measuredAt) &&
    heightCm !== null &&
    weightKg !== null &&
    (headCircumferenceCm !== null || source.headCircumferenceCm === null || source.headCircumferenceCm === undefined) &&
    (source.note === undefined || typeof source.note === 'string')
  )

  if (!valid) {
    if (strict) {
      throw new TypeError('成长记录的 ID、日期、身高、体重、头围或备注无效')
    }
    return null
  }

  return {
    id: source.id || `legacy-growth-${index}`,
    measuredAt: source.measuredAt,
    heightCm,
    weightKg,
    headCircumferenceCm,
    note: typeof source.note === 'string' ? source.note.slice(0, 200) : '',
    createdAt: Number.isFinite(source.createdAt) ? source.createdAt : 0,
    updatedAt: Number.isFinite(source.updatedAt) ? source.updatedAt : 0
  }
}

function normalizeDataInternal(rawData, strict) {
  if (!rawData || !Array.isArray(rawData.categories) || !Array.isArray(rawData.links)) {
    throw new TypeError('数据文件必须包含 categories 和 links 数组')
  }
  if (strict && rawData.growthRecords !== undefined && !Array.isArray(rawData.growthRecords)) {
    throw new TypeError('growthRecords 必须是数组')
  }

  const categories = rawData.categories.map((category, index) => (
    normalizeCategory(category, String(index), strict)
  ))
  const links = rawData.links.map((link, index) => normalizeLink(link, index, strict))
  const growthRecords = (Array.isArray(rawData.growthRecords) ? rawData.growthRecords : [])
    .map((record, index) => normalizeGrowthRecord(record, index, strict))
    .filter(Boolean)

  if (strict) {
    const categoryIds = new Set()
    for (const category of categories) {
      categoryIds.add(category.id)
      for (const child of category.children) categoryIds.add(child.id)
    }
    if (links.some(link => !categoryIds.has(link.categoryId))) {
      throw new TypeError('链接引用了不存在的分类')
    }
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    categories,
    links,
    growthRecords
  }
}

export function normalizeData(rawData) {
  return normalizeDataInternal(rawData, false)
}

export function validateImportData(rawData) {
  return normalizeDataInternal(rawData, true)
}

function getDefaultData() {
  return normalizeData({
    categories: defaultCategories,
    links: defaultLinks
  })
}

const dataSpaceRepository = createDataSpaceRepository({
  normalizeSnapshot: normalizeData,
  isTauri,
  getInvoke
})
let unsubscribeGuestSpaceChanges = null
let guestSpaceReloadQueue = Promise.resolve()
let guestSpaceSubscriptionGeneration = 0

function configureGuestSpaceChanges(storeInstance) {
  guestSpaceSubscriptionGeneration += 1
  const subscriptionGeneration = guestSpaceSubscriptionGeneration
  unsubscribeGuestSpaceChanges?.()
  unsubscribeGuestSpaceChanges = null
  if (activeSpaceKey !== GUEST_SPACE_KEY) return
  unsubscribeGuestSpaceChanges = dataSpaceRepository.subscribeSpaceChanges(
    GUEST_SPACE_KEY,
    () => {
      guestSpaceReloadQueue = guestSpaceReloadQueue.then(() => (
        enqueueMutation(async () => {
          if (
            activeSpaceKey !== GUEST_SPACE_KEY ||
            subscriptionGeneration !== guestSpaceSubscriptionGeneration
          ) return
          const currentSnapshot = storeInstance.getSnapshot()
          await dataSpaceRepository.saveRecoveryCopy(
            GUEST_SPACE_KEY,
            currentSnapshot,
            { reason: 'revision-conflict', source: 'local' }
          )
          if (
            activeSpaceKey !== GUEST_SPACE_KEY ||
            subscriptionGeneration !== guestSpaceSubscriptionGeneration
          ) return
          const envelope = await dataSpaceRepository.load(GUEST_SPACE_KEY)
          if (
            !envelope ||
            activeSpaceKey !== GUEST_SPACE_KEY ||
            subscriptionGeneration !== guestSpaceSubscriptionGeneration
          ) return
          storeInstance.categories = envelope.snapshot.categories
          storeInstance.links = envelope.snapshot.links
          storeInstance.growthRecords = envelope.snapshot.growthRecords
        })
      )).catch(() => {})
    }
  )
}

async function loadOrCreateDataSpace(spaceKey) {
  const envelope = await dataSpaceRepository.load(spaceKey)
  if (envelope) return envelope.snapshot

  const data = getDefaultData()
  await dataSpaceRepository.save(spaceKey, data, {
    sync: { dirty: false }
  })
  return data
}

async function loadData() {
  return loadOrCreateDataSpace(activeSpaceKey)
}

async function commitData(storeInstance, data, { source = 'local', sync } = {}) {
  try {
    await dataSpaceRepository.save(activeSpaceKey, data, {
      sync: sync ?? { dirty: source !== 'cloud' }
    })
  } catch (error) {
    if (error?.code !== ERROR_CODES.LOCAL_REVISION_CONFLICT) throw error
    try {
      await dataSpaceRepository.saveRecoveryCopy(activeSpaceKey, data, {
        reason: 'revision-conflict',
        source: 'local',
        remoteRevision: dataSpaceRepository.getSyncMetadata(activeSpaceKey)
          .remoteRevision
      })
    } catch (recoveryError) {
      throw new AppError(
        ERROR_CODES.RECOVERY_WRITE_FAILED,
        '其他标签页已更新数据，但当前修改无法备份',
        { cause: recoveryError }
      )
    }
    const envelope = await dataSpaceRepository.load(activeSpaceKey)
    if (envelope) {
      storeInstance.categories = envelope.snapshot.categories
      storeInstance.links = envelope.snapshot.links
      storeInstance.growthRecords = envelope.snapshot.growthRecords
    }
    throw error
  }
  storeInstance.categories = data.categories
  storeInstance.links = data.links
  storeInstance.growthRecords = data.growthRecords
  if (source !== 'cloud') {
    emitLocalCommit(data, source)
  }
}

export const store = reactive({
  categories: cloneData(defaultCategories),
  links: cloneData(defaultLinks),
  growthRecords: [],
  initialized: false,
  activeSpaceKey: GUEST_SPACE_KEY,

  getSnapshot(categories = this.categories, links = this.links, growthRecords = this.growthRecords) {
    return normalizeData({ categories, links, growthRecords })
  },

  async init() {
    if (this.initialized) return
    return enqueueMutation(async () => {
      if (this.initialized) return
      const data = await loadData()
      this.categories = data.categories
      this.links = data.links
      this.growthRecords = data.growthRecords
      this.initialized = true
      configureGuestSpaceChanges(this)
    })
  },

  async replaceData(rawData) {
    const data = validateImportData(rawData)
    activeDataReplacements += 1
    cancelVisitPersistence()
    try {
      return await enqueueMutation(async () => {
        await commitData(this, data, { source: 'import' })
      })
    } finally {
      activeDataReplacements -= 1
    }
  },

  async activateDataSpace(spaceKey) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    if (this.initialized && normalizedSpaceKey === activeSpaceKey) return

    activeDataReplacements += 1
    try {
      await flushVisitPersistence(this)
      return await enqueueMutation(async () => {
        const data = await loadOrCreateDataSpace(normalizedSpaceKey)
        activeSpaceKey = normalizedSpaceKey
        this.activeSpaceKey = normalizedSpaceKey
        this.categories = data.categories
        this.links = data.links
        this.growthRecords = data.growthRecords
        this.initialized = true
        configureGuestSpaceChanges(this)
      })
    } finally {
      activeDataReplacements -= 1
    }
  },

  async hasDataSpace(spaceKey) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    const envelope = await dataSpaceRepository.load(normalizedSpaceKey)
    return Boolean(envelope)
  },

  async initializeDataSpace(spaceKey, rawData) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    const data = validateImportData(rawData)
    return enqueueMutation(() => (
      dataSpaceRepository.save(normalizedSpaceKey, data, {
        sync: { dirty: true }
      })
    ))
  },

  async initializeDataSpaceIfAbsent(spaceKey, rawData) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    const data = validateImportData(rawData)
    return enqueueMutation(() => (
      dataSpaceRepository.createIfAbsent(normalizedSpaceKey, data, {
        sync: { dirty: true }
      })
    ))
  },

  async activateDataSpaceFromGuestIfAbsent(spaceKey) {
    const normalizedSpaceKey = assertValidSpaceKey(spaceKey)
    activeDataReplacements += 1
    try {
      await flushVisitPersistence(this)
      return await enqueueMutation(async () => {
        let envelope = await dataSpaceRepository.load(normalizedSpaceKey)
        let created = false
        if (!envelope) {
          const guestEnvelope = activeSpaceKey === GUEST_SPACE_KEY
            ? null
            : await dataSpaceRepository.load(GUEST_SPACE_KEY)
          if (activeSpaceKey !== GUEST_SPACE_KEY && !guestEnvelope) {
            throw new AppError(
              ERROR_CODES.LOCAL_DATA_CORRUPTED,
              '游客数据空间不存在，已停止初始化新账号'
            )
          }
          const seedSnapshot = guestEnvelope?.snapshot ?? this.getSnapshot()
          created = await dataSpaceRepository.createIfAbsent(
            normalizedSpaceKey,
            seedSnapshot,
            { sync: { dirty: true } }
          )
          envelope = created
            ? { snapshot: seedSnapshot }
            : await dataSpaceRepository.load(normalizedSpaceKey)
        }
        if (!envelope) {
          throw new AppError(
            ERROR_CODES.LOCAL_STORAGE_FAILED,
            '账号数据空间初始化后仍不可用'
          )
        }
        const data = envelope.snapshot
        activeSpaceKey = normalizedSpaceKey
        this.activeSpaceKey = normalizedSpaceKey
        this.categories = data.categories
        this.links = data.links
        this.growthRecords = data.growthRecords
        this.initialized = true
        configureGuestSpaceChanges(this)
        return created
      })
    } finally {
      activeDataReplacements -= 1
    }
  },

  async applySnapshot(rawData, source = 'cloud', { sync } = {}) {
    const data = validateImportData(rawData)
    activeDataReplacements += 1
    cancelVisitPersistence()
    try {
      return await enqueueMutation(async () => {
        await commitData(this, data, { source, sync })
      })
    } finally {
      activeDataReplacements -= 1
    }
  },

  subscribeLocalCommits(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('本地提交监听器必须是函数')
    }
    localCommitListeners.add(listener)
    return () => localCommitListeners.delete(listener)
  },

  saveRecoveryCopy(snapshot, options) {
    return dataSpaceRepository.saveRecoveryCopy(activeSpaceKey, snapshot, options)
  },

  listRecoveryCopies() {
    return dataSpaceRepository.listRecoveryCopies(activeSpaceKey)
  },

  async restoreRecoveryCopy(copyId, expectedSpaceKey) {
    const normalizedExpectedSpace = assertValidSpaceKey(expectedSpaceKey)
    activeDataReplacements += 1
    try {
      await flushVisitPersistence(this)
      return await enqueueMutation(async () => {
        if (activeSpaceKey !== normalizedExpectedSpace) {
          throw new AppError(
            ERROR_CODES.LOCAL_REVISION_CONFLICT,
            '账号数据空间已变化，已取消恢复'
          )
        }
        const copies = await dataSpaceRepository.listRecoveryCopies(activeSpaceKey)
        const copy = copies.find(item => item.id === copyId)
        if (!copy) {
          throw new AppError(
            ERROR_CODES.LOCAL_DATA_CORRUPTED,
            '恢复副本不存在或已失效'
          )
        }
        const currentSnapshot = this.getSnapshot()
        const metadata = dataSpaceRepository.getSyncMetadata(activeSpaceKey)
        await dataSpaceRepository.saveRecoveryCopy(
          activeSpaceKey,
          currentSnapshot,
          {
            reason: 'manual-import',
            source: 'local',
            remoteRevision: metadata.remoteRevision
          }
        )
        const data = validateImportData(copy.snapshot)
        await commitData(this, data, { source: 'recovery' })
        return true
      })
    } finally {
      activeDataReplacements -= 1
    }
  },

  getSyncMetadata() {
    return dataSpaceRepository.getSyncMetadata(activeSpaceKey)
  },

  getLocalRevision() {
    return dataSpaceRepository.getLocalRevision(activeSpaceKey)
  },

  async updateSyncMetadata(sync, options) {
    return enqueueMutation(() => (
      dataSpaceRepository.updateSyncMetadata(activeSpaceKey, sync, options)
    ))
  },

  async reloadActiveDataSpace() {
    activeDataReplacements += 1
    cancelVisitPersistence()
    try {
      return await enqueueMutation(async () => {
        const envelope = await dataSpaceRepository.load(activeSpaceKey)
        if (!envelope) return false
        this.categories = envelope.snapshot.categories
        this.links = envelope.snapshot.links
        this.growthRecords = envelope.snapshot.growthRecords
        return true
      })
    } finally {
      activeDataReplacements -= 1
    }
  },

  subscribeExternalDataChanges(listener) {
    return dataSpaceRepository.subscribeSpaceChanges(activeSpaceKey, listener)
  },

  getOrCreateDeviceMetadata() {
    return dataSpaceRepository.getOrCreateDeviceMetadata()
  },

  async waitForPendingWrites() {
    await flushVisitPersistence(this)
    await mutationQueue
  },

  async addCategory(category) {
    return enqueueMutation(async () => {
      const categories = [...this.categories, cloneData(category)]
      const data = this.getSnapshot(categories, this.links)
      await commitData(this, data)
    })
  },

  async updateCategory(id, updates) {
    return enqueueMutation(async () => {
      const index = this.categories.findIndex(category => category.id === id)
      if (index < 0) return false

      const categories = [...this.categories]
      categories[index] = { ...categories[index], ...cloneData(updates) }
      const data = this.getSnapshot(categories, this.links)
      await commitData(this, data)
      return true
    })
  },

  async upsertCategory(category) {
    return enqueueMutation(async () => {
      const categories = cloneData(this.categories)
      if (!category.parentId) {
        const index = categories.findIndex(item => item.id === category.id)
        if (index >= 0) {
          categories[index] = cloneData(category)
        } else {
          categories.push(cloneData(category))
        }
      } else {
        const parentIndex = categories.findIndex(item => item.id === category.parentId)
        if (parentIndex < 0) throw new Error('父分类不存在')

        const children = categories[parentIndex].children || []
        const childIndex = children.findIndex(item => item.id === category.id)
        if (childIndex >= 0) {
          children[childIndex] = cloneData(category)
        } else {
          children.push(cloneData(category))
        }
        categories[parentIndex].children = children
      }

      const data = this.getSnapshot(categories, this.links)
      await commitData(this, data)
      return true
    })
  },

  async deleteCategory(id) {
    return enqueueMutation(async () => {
      const category = this.categories.find(item => item.id === id)
      if (!category) return false

      const removedIds = new Set([id, ...(category.children || []).map(child => child.id)])
      const categories = this.categories.filter(item => item.id !== id)
      const links = this.links.filter(link => !removedIds.has(link.categoryId))
      const data = this.getSnapshot(categories, links)
      await commitData(this, data)
      return true
    })
  },

  async deleteSubcategory(parentId, childId) {
    return enqueueMutation(async () => {
      const parentIndex = this.categories.findIndex(item => item.id === parentId)
      if (parentIndex < 0) return false

      const categories = cloneData(this.categories)
      const originalChildren = categories[parentIndex].children || []
      const children = originalChildren.filter(child => child.id !== childId)
      if (children.length === originalChildren.length) return false

      categories[parentIndex].children = children
      const links = this.links.filter(link => link.categoryId !== childId)
      const data = this.getSnapshot(categories, links)
      await commitData(this, data)
      return true
    })
  },

  async addLink(link) {
    return enqueueMutation(async () => {
      const links = [...this.links, cloneData(link)]
      const data = this.getSnapshot(this.categories, links)
      await commitData(this, data)
    })
  },

  async updateLink(id, updates) {
    return enqueueMutation(async () => {
      const index = this.links.findIndex(link => link.id === id)
      if (index < 0) return false

      const links = [...this.links]
      links[index] = { ...links[index], ...cloneData(updates) }
      const data = this.getSnapshot(this.categories, links)
      await commitData(this, data)
      return true
    })
  },

  async deleteLink(id) {
    return enqueueMutation(async () => {
      const links = this.links.filter(link => link.id !== id)
      if (links.length === this.links.length) return false

      const data = this.getSnapshot(this.categories, links)
      await commitData(this, data)
      return true
    })
  },

  async upsertGrowthRecord(rawRecord) {
    const record = normalizeGrowthRecord(rawRecord, 0, true)
    return enqueueMutation(async () => {
      const growthRecords = [...this.growthRecords]
      const index = growthRecords.findIndex(item => item.id === record.id)
      if (index >= 0) {
        growthRecords[index] = record
      } else {
        growthRecords.push(record)
      }
      const data = this.getSnapshot(this.categories, this.links, growthRecords)
      await commitData(this, data)
      return true
    })
  },

  async deleteGrowthRecord(id) {
    return enqueueMutation(async () => {
      const growthRecords = this.growthRecords.filter(record => record.id !== id)
      if (growthRecords.length === this.growthRecords.length) return false

      const data = this.getSnapshot(this.categories, this.links, growthRecords)
      await commitData(this, data)
      return true
    })
  },

  getLinksByCategory(categoryId) {
    return this.links.filter(l => l.categoryId === categoryId)
  },
  
  getCategoryById(id) {
    for (const category of this.categories) {
      if (category.id === id) return category
      if (category.children) {
        const child = category.children.find(c => c.id === id)
        if (child) return child
      }
    }
    return null
  },
  
  getAllCategoriesFlat() {
    const result = []
    for (const category of this.categories) {
      result.push(category)
      if (category.children) {
        result.push(...category.children)
      }
    }
    return result
  },
  
  async toggleFavorite(id) {
    return enqueueMutation(async () => {
      const index = this.links.findIndex(link => link.id === id)
      if (index < 0) return false

      const links = [...this.links]
      links[index] = { ...links[index], favorite: !links[index].favorite }
      const data = this.getSnapshot(this.categories, links)
      await commitData(this, data)
      return true
    })
  },

  recordVisit(id) {
    if (activeDataReplacements > 0) return Promise.resolve(false)
    if (!this.links.some(link => link.id === id)) return Promise.resolve(false)
    return scheduleVisitPersistence(this, id)
  },

  flushPendingVisits() {
    return flushVisitPersistence(this)
  },
  
  getFavoriteLinks() {
    return this.links.filter(l => l.favorite)
  },
  
  getMostVisitedLinks(limit = 10) {
    return [...this.links].sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0)).slice(0, limit)
  }
})

export function generateId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
}
