import { reactive } from 'vue'

const STORAGE_KEY = 'panduola_data'
const isTauri = typeof window !== 'undefined' && !!window.__TAURI__

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
    title: '襁褓奶霸',
    ageRange: '0–1 岁',
    description: '小小一只肉身挂件，除了吃奶就是大哭，全家 24 小时轮班伺候，人类幼崽顶级耗能原型机。'
  },
  {
    id: 'age1-3',
    title: '拆迁预备役',
    ageRange: '1–3 岁',
    description: '行走的碎钞机 + 移动破坏王，手抓万物、嘴尝天下，家里摆件存活全看运气，说话全靠外星语翻译。'
  },
  {
    id: 'age3-6',
    title: '幼儿园显眼包',
    ageRange: '3–6 岁',
    description: '每天上演分离大戏，在校乖巧回家发疯，会顶嘴会讨价还价，社交达人，零食谈判大师。'
  },
  {
    id: 'age6-9',
    title: '低年级野生选手',
    ageRange: '6–9 岁',
    description: '识字算数两手抓，书包比人重，写作业三分钟走神八回，文具每月固定失踪一批。'
  },
  {
    id: 'age9-12',
    title: '高年级顶嘴小能手',
    ageRange: '9–12 岁',
    description: '逻辑飞速觉醒，道理一套一套怼家长，爱藏漫画、偷摸看电视，口头保证永远不算数。'
  },
  {
    id: 'age12-15',
    title: '沉默高冷选手',
    ageRange: '12–15 岁',
    description: '房门永久紧闭，沟通全靠打字，嫌弃父母啰嗦，审美自成一派，情绪阴晴不定堪比天气预报。'
  },
  {
    id: 'age15-18',
    title: '高考渡劫人',
    ageRange: '15–18 岁',
    description: '早出晚归埋进试卷，全家静音模式，零花钱用来补充咖啡文具，全家一起陪跑渡劫。'
  },
  {
    id: 'age18-22',
    title: '远程放养人类',
    ageRange: '18–22 岁',
    description: '奔赴外地解锁自由生活，月度定点索要生活费，报喜不报忧，寒暑假短暂回家暂住。'
  },
  {
    id: 'age22+',
    title: '功德圆满・半成品出炉',
    ageRange: '22 岁 +',
    description: '二十多年投资顺利交付成品，独立副本正式开启，老父母终于熬出半口气！'
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
    lastVisit: null
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
    lastVisit: null
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
    lastVisit: null
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
    lastVisit: null
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
    lastVisit: null
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
    lastVisit: null
  }
]

async function loadData() {
  try {
    if (isTauri) {
      const invoke = await getInvoke()
      if (invoke) {
        const saved = await invoke('read_data_file')
        if (saved && typeof saved === 'string' && saved.length > 0) {
          return JSON.parse(saved)
        }
      }
    } else {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    }
  } catch (e) {
    console.error('Failed to load data:', e)
  }
  return { categories: defaultCategories, links: defaultLinks }
}

async function saveData(data) {
  try {
    const jsonStr = JSON.stringify(data)
    if (isTauri) {
      const invoke = await getInvoke()
      if (invoke) {
        await invoke('save_data_file', { data: jsonStr })
      }
    } else {
      localStorage.setItem(STORAGE_KEY, jsonStr)
    }
  } catch (e) {
    console.error('Failed to save data:', e)
  }
}

export const store = reactive({
  categories: defaultCategories,
  links: defaultLinks,
  initialized: false,
  
  async init() {
    if (this.initialized) return
    const data = await loadData()
    this.categories = data.categories || defaultCategories
    this.links = data.links || defaultLinks
    this.initialized = true
  },
  
  async addCategory(category) {
    this.categories.push(category)
    await saveData({ categories: this.categories, links: this.links })
  },
  
  async updateCategory(id, updates) {
    const category = this.categories.find(c => c.id === id)
    if (category) {
      Object.assign(category, updates)
      await saveData({ categories: this.categories, links: this.links })
    }
  },
  
  async deleteCategory(id) {
    this.categories = this.categories.filter(c => c.id !== id)
    this.links = this.links.filter(l => l.categoryId !== id)
    await saveData({ categories: this.categories, links: this.links })
  },
  
  async addLink(link) {
    this.links.push(link)
    await saveData({ categories: this.categories, links: this.links })
  },
  
  async updateLink(id, updates) {
    const link = this.links.find(l => l.id === id)
    if (link) {
      Object.assign(link, updates)
      await saveData({ categories: this.categories, links: this.links })
    }
  },
  
  async deleteLink(id) {
    this.links = this.links.filter(l => l.id !== id)
    await saveData({ categories: this.categories, links: this.links })
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
    const link = this.links.find(l => l.id === id)
    if (link) {
      link.favorite = !link.favorite
      await saveData({ categories: this.categories, links: this.links })
    }
  },
  
  async recordVisit(id) {
    const link = this.links.find(l => l.id === id)
    if (link) {
      link.visitCount = (link.visitCount || 0) + 1
      link.lastVisit = Date.now()
      await saveData({ categories: this.categories, links: this.links })
    }
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
