<template>
  <div class="dashboard">
    <div class="banner-tip-row">
      <transition name="fade" mode="out-in">
        <div v-if="selectedAgeStageInfo" class="age-stage-banner" :style="{ background: `linear-gradient(135deg, ${selectedAgeStageInfo.color}25 0%, ${selectedAgeStageInfo.color}05 100%)`, borderColor: selectedAgeStageInfo.color + '30' }">
          <div class="banner-icon" :style="{ backgroundColor: selectedAgeStageInfo.color + '15' }">
            <component :is="selectedAgeStageInfo.icon" :style="{ color: selectedAgeStageInfo.color }" :size="32" />
          </div>
          <div class="banner-content">
            <div class="banner-title">当前阶段：<span>{{ selectedAgeStageInfo.title }}</span></div>
            <div class="banner-desc">{{ selectedAgeStageInfo.description }}</div>
          </div>
          <button class="banner-toggle" aria-label="清除年龄阶段筛选" title="清除年龄阶段筛选" @click="$emit('clear-age-stage')">
            <X :size="16" />
          </button>
        </div>
        <div v-else class="age-stage-banner banner-empty">
          <div class="banner-empty-icon">
            <Users :size="28" />
          </div>
          <div class="banner-empty-content">
            <div class="banner-empty-title">先选择孩子所处的成长阶段</div>
            <div class="banner-empty-desc">内容会按年龄自动筛选；也可以直接浏览全部资源</div>
          </div>
        </div>
      </transition>
      <div class="tip-wrapper">
        <div class="tip-section-inline">
          <div class="tip-header">
            <Lightbulb :size="18" />
            <h3>今日提醒</h3>
          </div>
          <p class="tip-text">{{ currentTip }}</p>
        </div>
      </div>
    </div>

    <div class="stats-row">
      <button type="button" class="stat-card stat-link" @click="$emit('stat-click', { type: 'categories' })">
        <div class="stat-icon" style="background-color: rgba(59, 130, 246, 0.15)">
          <FolderOpen :size="20" style="color: #3b82f6" />
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ totalCategories }}</div>
          <div class="stat-label">资源分类</div>
        </div>
        <ChevronRight :size="16" class="stat-arrow" />
      </button>
      <button type="button" class="stat-card stat-link" @click="$emit('stat-click', { type: 'all' })">
        <div class="stat-icon" style="background-color: rgba(16, 185, 129, 0.15)">
          <Link :size="20" style="color: #10b981" />
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ totalLinks }}</div>
          <div class="stat-label">全部资源</div>
        </div>
        <ChevronRight :size="16" class="stat-arrow" />
      </button>
      <button type="button" class="stat-card stat-link" @click="$emit('stat-click', { type: 'favorites' })">
        <div class="stat-icon" style="background-color: rgba(245, 158, 11, 0.15)">
          <Star :size="20" style="color: #f59e0b" />
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ favoriteCount }}</div>
          <div class="stat-label">我的收藏</div>
        </div>
        <ChevronRight :size="16" class="stat-arrow" />
      </button>
      <button type="button" class="stat-card stat-link" @click="$emit('stat-click', { type: 'today' })">
        <div class="stat-icon" style="background-color: rgba(239, 68, 68, 0.15)">
          <Clock :size="20" style="color: #ef4444" />
        </div>
        <div class="stat-info">
          <div class="stat-value">{{ todayAdded }}</div>
          <div class="stat-label">今日收录</div>
        </div>
        <ChevronRight :size="16" class="stat-arrow" />
      </button>
    </div>

    <section class="dashboard-content-hub" aria-label="育儿内容导航">
      <div class="content-tabs" role="tablist" aria-label="育儿内容分类">
        <button
          v-for="(tab, index) in contentTabs"
          :id="`dashboard-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          class="content-tab"
          :class="{ active: activeContentTab === tab.id }"
          role="tab"
          :aria-selected="activeContentTab === tab.id"
          aria-controls="dashboard-content-panel"
          :tabindex="activeContentTab === tab.id ? 0 : -1"
          @click="activeContentTab = tab.id"
          @keydown="handleContentTabKeydown($event, index)"
        >
          <component :is="tab.icon" :size="17" />
          <span>{{ tab.label }}</span>
          <span class="content-tab-count">{{ tab.count }}</span>
        </button>
      </div>

      <transition name="content-tab" mode="out-in">
        <div
          id="dashboard-content-panel"
          :key="activeContentTab"
          class="content-tab-panel"
          role="tabpanel"
          :aria-labelledby="`dashboard-tab-${activeContentTab}`"
          tabindex="0"
        >
          <div v-if="activeContentTab === 'quick'" class="quick-actions">
            <button
              v-for="action in quickActions"
              :key="action.id"
              type="button"
              class="action-card"
              @click="handleAction(action)"
            >
              <div class="action-icon" :style="{ backgroundColor: action.color + '15' }">
                <component :is="action.icon" :style="{ color: action.color }" :size="24" />
              </div>
              <div class="action-info">
                <div class="action-title">{{ action.title }}</div>
                <div class="action-desc">{{ action.description }}</div>
              </div>
              <ChevronRight :size="16" class="action-arrow" />
            </button>
          </div>

          <template v-if="activeContentTab === 'recent'">
            <div class="tab-panel-toolbar">
              <span>最近收录的成长资源</span>
              <button class="btn btn-secondary btn-sm" @click="$emit('view-all-links')">进入资源库</button>
            </div>
            <div class="recent-links">
              <button
                v-for="link in recentLinks"
                :key="link.id"
                type="button"
                class="recent-link-card"
                @click="openLink(link)"
              >
                <div class="recent-link-favicon">
                  <Globe :size="16" />
                </div>
                <div class="recent-link-info">
                  <div class="recent-link-header">
                    <span class="recent-link-title">{{ link.title }}</span>
                    <span v-if="link.isDefault" class="link-tag tag-default">精选</span>
                  </div>
                  <div class="recent-link-category">{{ getCategoryName(link.categoryId) }}</div>
                </div>
                <ExternalLink :size="14" />
              </button>
            </div>
          </template>

          <div v-if="activeContentTab === 'popular'" class="category-grid">
            <button
              v-for="category in popularCategories"
              :key="category.id"
              type="button"
              class="category-card"
              @click="$emit('category-select', category)"
            >
              <div class="category-icon" :style="{ backgroundColor: category.color + '15' }">
                <component :is="getIcon(category.icon)" :style="{ color: category.color }" :size="20" />
              </div>
              <div class="category-info">
                <div class="category-name">{{ category.name }}</div>
                <div class="category-link-count">{{ category.linkCount }} 条资源</div>
              </div>
            </button>
          </div>

          <div v-if="activeContentTab === 'recommended'" class="recent-links">
            <button
              v-for="link in defaultLinks"
              :key="link.id"
              type="button"
              class="recent-link-card"
              @click="openLink(link)"
            >
              <div class="recent-link-favicon">
                <component :is="getCategoryIcon(link.categoryId)" :size="16" />
              </div>
              <div class="recent-link-info">
                <div class="recent-link-header">
                  <span class="recent-link-title">{{ link.title }}</span>
                  <span class="link-tag tag-default">精选</span>
                </div>
                <div class="recent-link-category">{{ getCategoryName(link.categoryId) }}</div>
              </div>
              <ExternalLink :size="14" />
            </button>
          </div>

          <template v-if="activeContentTab === 'favorites'">
            <div class="tab-panel-toolbar">
              <span>你保存的常用资源</span>
              <button class="btn btn-secondary btn-sm" @click="$emit('stat-click', { type: 'favorites' })">查看全部收藏</button>
            </div>
            <div class="recent-links">
              <button
                v-for="link in favoriteLinks"
                :key="link.id"
                type="button"
                class="recent-link-card"
                @click="openLink(link)"
              >
                <div class="recent-link-favicon fav">
                  <Star :size="16" />
                </div>
                <div class="recent-link-info">
                  <div class="recent-link-header">
                    <span class="recent-link-title">{{ link.title }}</span>
                    <span v-if="link.isDefault" class="link-tag tag-default">精选</span>
                  </div>
                  <div class="recent-link-category">{{ getCategoryName(link.categoryId) }}</div>
                </div>
                <ExternalLink :size="14" />
              </button>
              <div v-if="favoriteLinks.length === 0" class="empty-state">
                <Star :size="24" class="text-gray-300" />
                <p>还没有收藏资源</p>
                <span class="empty-hint">在资源卡片上点击星标即可收藏</span>
              </div>
            </div>
          </template>
        </div>
      </transition>
    </section>

    <div class="ai-search-full">
      <AISearch />
    </div>

    <VaccineGuide
      :visible="showVaccineGuide"
      :selected-age-stages="props.selectedAgeStages"
      @close="showVaccineGuide = false"
    />
    <GrowthTracker :visible="showGrowthTracker" @close="showGrowthTracker = false" />
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import {
  ChevronRight, Globe, ExternalLink, BookOpen, Syringe,
  Activity, Calendar, Calculator, Clock, TrendingUp, Users,
  GraduationCap, Stethoscope, Lightbulb, Star, Link, FolderOpen,
  Baby, Wrench, Flower2, Moon, Rocket, Sun, Award, X,
  Utensils, Shield, Heart, BookMarked, Briefcase, Building
} from 'lucide-vue-next'
import { store, AGE_STAGES } from '@/data/store'
import { openExternalLink } from '@/utils/externalLinks'
import { useCategoryLinkCounts } from '@/composables/useCategoryLinkCounts'
import AISearch from './AISearch.vue'
import GrowthTracker from './GrowthTracker.vue'
import VaccineGuide from './VaccineGuide.vue'

const props = defineProps({
  selectedAgeStages: {
    type: Array,
    default: () => []
  }
})

defineEmits(['category-select', 'view-all-links', 'clear-age-stage', 'stat-click'])

const activeContentTab = ref('quick')
const showGrowthTracker = ref(false)
const showVaccineGuide = ref(false)
const { getCategoryLinkCount } = useCategoryLinkCounts()

const stageIcons = {
  'age0-1': Baby,
  'age1-3': Wrench,
  'age3-6': Flower2,
  'age6-9': BookOpen,
  'age9-12': GraduationCap,
  'age12-15': Moon,
  'age15-18': Rocket,
  'age18-22': Sun,
  'age22+': Award
}

const stageColors = {
  'age0-1': '#f472b6',
  'age1-3': '#fb923c',
  'age3-6': '#fbbf24',
  'age6-9': '#34d399',
  'age9-12': '#60a5fa',
  'age12-15': '#a78bfa',
  'age15-18': '#f87171',
  'age18-22': '#94a3b8',
  'age22+': '#64748b'
}

const selectedAgeStageInfo = computed(() => {
  if (props.selectedAgeStages.length === 0) return null
  const stageId = props.selectedAgeStages[0]
  const stage = AGE_STAGES.find(s => s.id === stageId)
  if (!stage) return null
  return {
    ...stage,
    icon: stageIcons[stageId],
    color: stageColors[stageId]
  }
})

const iconMap = {
  BookOpen, Wrench: Activity, Utensils: Calculator,
  Moon: Clock, TrendingUp, GraduationCap: BookOpen, Syringe, Stethoscope,
  Activity, ShoppingBag: Users, Building: Users, Users, BookMarked: BookOpen,
  Headphones: Activity, Ruler: TrendingUp, Calendar, Calculator, Folder: BookOpen
}

const tipsByStage = {
  'age0-1': [
    '新生儿每天需要16-20小时的睡眠，建立规律的作息对宝宝发育很重要',
    '母乳喂养时要确保宝宝含接姿势正确，避免乳头损伤',
    '宝宝出生后两周开始补充维生素D，每天400IU',
    '给新生儿洗澡时要注意水温，保持在38-40℃左右',
    '不要给1岁以下宝宝喝蜂蜜水，可能引起肉毒杆菌中毒',
    '新生儿脐带脱落前要保持干燥，避免沾水感染'
  ],
  'age1-3': [
    '辅食添加要从单一食物开始，每次只添加一种新食物，观察3-5天',
    '1-3岁是语言发展关键期，多和宝宝交流，鼓励表达',
    '宝宝发烧时不要惊慌，38.5℃以下可以物理降温',
    '选择适合年龄段的玩具，可以促进宝宝的认知和运动能力发展',
    '培养宝宝良好的饮食习惯，不挑食不偏食',
    '注意宝宝的口腔卫生，出牙后开始刷牙'
  ],
  'age3-6': [
    '幼儿园阶段要培养孩子的自理能力，自己穿衣吃饭',
    '培养孩子的阅读习惯要从小开始，亲子共读是很好的方式',
    '定期带宝宝进行体检，及时发现和解决生长发育中的问题',
    '鼓励孩子多和同龄人交往，发展社交能力',
    '合理安排孩子的学习和玩耍时间，避免过度早教',
    '注意保护孩子的视力，控制电子屏幕使用时间'
  ],
  'age6-9': [
    '小学低年级要培养良好的学习习惯，每天固定时间写作业',
    '书包重量不宜超过体重的10%，保护孩子的脊柱',
    '培养孩子的兴趣爱好，但不要报太多兴趣班',
    '鼓励孩子多阅读，扩大知识面',
    '注意孩子的坐姿，预防近视和驼背',
    '培养孩子的时间管理能力'
  ],
  'age9-12': [
    '高年级孩子开始有自己的想法，要学会倾听和沟通',
    '培养孩子的自主学习能力，减少家长辅导',
    '关注孩子的心理健康，及时发现情绪变化',
    '鼓励孩子参加体育锻炼，保持身体健康',
    '培养孩子的责任感，可以适当分配家务',
    '帮助孩子建立正确的价值观'
  ],
  'age12-15': [
    '青春期孩子需要更多的空间和理解，沟通时要注意方式方法',
    '关注孩子的生理变化，进行必要的性教育',
    '引导孩子正确使用网络，避免沉迷游戏',
    '培养孩子的情绪管理能力，学会表达感受',
    '尊重孩子的隐私，不要偷看日记或聊天记录',
    '鼓励孩子参与家庭决策，增强责任感'
  ],
  'age15-18': [
    '高三阶段要注意劳逸结合，保证充足睡眠',
    '帮助孩子制定合理的复习计划，不要盲目刷题',
    '关注孩子的心理状态，及时疏导考试压力',
    '不要给孩子过多的考试压力，尽力就好',
    '提前了解高考志愿填报相关知识',
    '鼓励孩子发展特长，为未来发展打下基础'
  ],
  'age18-22': [
    '大学期间要学会独立生活，自己管理时间和财务',
    '鼓励孩子参加社团活动，拓展人脉和视野',
    '关注孩子的学业，但不要过度干涉',
    '帮助孩子规划职业方向，了解行业动态',
    '培养孩子的理财意识，合理规划生活费',
    '鼓励孩子多读书多旅行，丰富人生阅历'
  ],
  'age22+': [
    '刚步入职场要保持学习心态，不断提升自己',
    '帮助孩子建立良好的职业规划',
    '关注孩子的生活状态，但保持适当距离',
    '鼓励孩子独立解决问题，培养责任感',
    '提醒孩子注意身体健康，定期体检',
    '支持孩子的人生选择，做坚强的后盾'
  ]
}

const defaultTips = [
  '先选择成长阶段，首页内容和资源库会同步筛选',
  '把经常查看的资料加入收藏，下次可以更快找到',
  '涉及健康、用药或紧急情况时，请优先咨询专业人士',
  '定期整理资源分类和标签，搜索会更准确'
]

const currentTip = computed(() => {
  let tips = defaultTips
  if (props.selectedAgeStages.length > 0) {
    const stageId = props.selectedAgeStages[0]
    tips = tipsByStage[stageId] || defaultTips
  }
  return tips[Math.floor(Date.now() / 3600000) % tips.length]
})

const totalCategories = computed(() => {
  let count = store.categories.length
  for (const cat of store.categories) {
    if (cat.children) count += cat.children.length
  }
  return count
})

const totalLinks = computed(() => store.links.length)

const favoriteCount = computed(() => store.links.filter(l => l.favorite).length)

const todayAdded = computed(() => {
  const today = new Date().setHours(0, 0, 0, 0)
  return store.links.filter(l => l.createdAt >= today).length
})

const favoriteLinks = computed(() => {
  let links = store.links.filter(l => l.favorite)

  if (props.selectedAgeStages.length > 0) {
    const stageId = props.selectedAgeStages[0]
    links = links.filter(link => linkMatchesAgeStage(link, stageId))
  }

  return links.slice(0, 4)
})

const quickActionsByStage = {
  'age0-1': [
    { id: 'vaccine', icon: Syringe, title: '疫苗接种', description: '新生儿疫苗时间表', color: '#ef4444' },
    { id: 'growth', icon: TrendingUp, title: '生长曲线', description: '记录宝宝身高体重', color: '#3b82f6' },
    { id: 'feeding', icon: Utensils, title: '喂养指南', description: '母乳喂养/奶粉喂养', color: '#10b981' },
    { id: 'sleep', icon: Moon, title: '睡眠规律', description: '建立宝宝作息习惯', color: '#8b5cf6' }
  ],
  'age1-3': [
    { id: 'vaccine', icon: Syringe, title: '疫苗接种', description: '幼儿疫苗时间表', color: '#ef4444' },
    { id: 'food', icon: Calculator, title: '辅食添加', description: '科学搭配宝宝辅食', color: '#10b981' },
    { id: 'milestones', icon: Activity, title: '发育里程碑', description: '大运动精细运动', color: '#3b82f6' },
    { id: 'safety', icon: Shield, title: '居家安全', description: '防摔防撞防护', color: '#f59e0b' }
  ],
  'age3-6': [
    { id: 'kindergarten', icon: Building, title: '入园准备', description: '幼儿园适应指南', color: '#3b82f6' },
    { id: 'learning', icon: BookOpen, title: '启蒙学习', description: '识字算数早教', color: '#10b981' },
    { id: 'social', icon: Users, title: '社交能力', description: '培养宝宝社交技巧', color: '#8b5cf6' },
    { id: 'health', icon: Stethoscope, title: '健康管理', description: '常见病预防护理', color: '#ef4444' }
  ],
  'age6-9': [
    { id: 'study', icon: BookOpen, title: '学习方法', description: '小学生学习技巧', color: '#3b82f6' },
    { id: 'homework', icon: GraduationCap, title: '作业辅导', description: '高效完成作业', color: '#10b981' },
    { id: 'reading', icon: BookMarked, title: '阅读习惯', description: '培养阅读兴趣', color: '#8b5cf6' },
    { id: 'hobby', icon: Lightbulb, title: '兴趣培养', description: '选择合适兴趣班', color: '#f59e0b' }
  ],
  'age9-12': [
    { id: 'study', icon: BookOpen, title: '学习规划', description: '初中预备知识', color: '#3b82f6' },
    { id: 'exam', icon: TrendingUp, title: '考试技巧', description: '应对各类考试', color: '#10b981' },
    { id: 'selfstudy', icon: GraduationCap, title: '自主学习', description: '培养自学能力', color: '#8b5cf6' },
    { id: 'parenting', icon: Users, title: '亲子沟通', description: '与孩子有效沟通', color: '#f59e0b' }
  ],
  'age12-15': [
    { id: 'adolescence', icon: Moon, title: '青春期', description: '生理心理变化', color: '#8b5cf6' },
    { id: 'study', icon: BookOpen, title: '初中学习', description: '科目增多应对', color: '#3b82f6' },
    { id: 'emotion', icon: Heart, title: '情绪管理', description: '引导情绪表达', color: '#ec4899' },
    { id: 'internet', icon: Globe, title: '网络安全', description: '正确使用网络', color: '#10b981' }
  ],
  'age15-18': [
    { id: 'gaokao', icon: Rocket, title: '高考规划', description: '备考复习计划', color: '#ef4444' },
    { id: 'study', icon: BookOpen, title: '高中学习', description: '高效学习方法', color: '#3b82f6' },
    { id: 'mental', icon: Heart, title: '心理疏导', description: '缓解考试压力', color: '#ec4899' },
    { id: 'career', icon: Briefcase, title: '专业选择', description: '志愿填报指导', color: '#f59e0b' }
  ],
  'age18-22': [
    { id: 'college', icon: GraduationCap, title: '大学生活', description: '适应大学环境', color: '#3b82f6' },
    { id: 'career', icon: Briefcase, title: '职业规划', description: '未来职业方向', color: '#f59e0b' },
    { id: 'finance', icon: Calculator, title: '财务管理', description: '合理规划生活费', color: '#10b981' },
    { id: 'independence', icon: Users, title: '独立生活', description: '学会照顾自己', color: '#8b5cf6' }
  ],
  'age22+': [
    { id: 'career', icon: Briefcase, title: '职场发展', description: '第一份工作', color: '#3b82f6' },
    { id: 'finance', icon: Calculator, title: '财务规划', description: '理财投资入门', color: '#10b981' },
    { id: 'life', icon: Sun, title: '生活平衡', description: '工作生活平衡', color: '#fbbf24' },
    { id: 'family', icon: Users, title: '新家庭', description: '组建自己家庭', color: '#ec4899' }
  ]
}

const defaultQuickActions = [
  { id: 'vaccine', icon: Syringe, title: '疫苗接种', description: '查看疫苗接种时间表', color: '#ef4444' },
  { id: 'growth', icon: TrendingUp, title: '生长曲线', description: '查看身高体重参考', color: '#3b82f6' },
  { id: 'food', icon: Calculator, title: '辅食计算器', description: '了解辅食搭配方法', color: '#10b981' },
  { id: 'schedule', icon: Calendar, title: '成长日程', description: '记录家庭重要事项', color: '#f59e0b' }
]

const vaccineActionDescriptions = {
  'age3-6': '查看入园入学前接种节点',
  'age6-9': '核对 6 岁加强剂与补种',
  'age9-12': '查验接种证与漏种剂次',
  'age12-15': '查看 13 岁女孩 HPV 程序',
  'age15-18': '查看 HPV 与漏种原则',
  'age18-22': '按接种史评估成人疫苗',
  'age22+': '按健康风险评估成人疫苗'
}

const growthActionDescriptions = {
  'age1-3': '记录幼儿身高体重变化',
  'age3-6': '持续记录身高体重变化',
  'age6-9': '观察成长阶段变化幅度',
  'age9-12': '记录身高体重变化趋势',
  'age12-15': '记录青春期成长变化',
  'age15-18': '持续观察个人变化趋势',
  'age18-22': '管理个人身高体重记录',
  'age22+': '管理个人身体测量记录'
}

const quickActions = computed(() => {
  if (props.selectedAgeStages.length > 0) {
    const stageId = props.selectedAgeStages[0]
    const actions = quickActionsByStage[stageId] || defaultQuickActions
    const supplementalActions = []
    if (!actions.some(action => action.id === 'vaccine')) {
      supplementalActions.push({
        id: 'vaccine',
        icon: Syringe,
        title: '疫苗接种',
        description: vaccineActionDescriptions[stageId] || '查看国家免疫规划时间表',
        color: '#ef4444'
      })
    }
    if (!actions.some(action => action.id === 'growth')) {
      supplementalActions.push({
        id: 'growth',
        icon: TrendingUp,
        title: '生长曲线',
        description: growthActionDescriptions[stageId] || '记录身高体重变化',
        color: '#3b82f6'
      })
    }
    return [...supplementalActions, ...actions]
  }
  return defaultQuickActions
})

const popularCategories = computed(() => {
  let categories = store.categories

  if (props.selectedAgeStages.length > 0) {
    const stageId = props.selectedAgeStages[0]
    categories = categories.filter(cat => {
      if (!cat.children || cat.children.length === 0) return false
      return cat.children.some(child => {
        const childStages = child.ageStages || []
        return childStages.length === 0 || childStages.includes(stageId)
      })
    })
  }

  return categories.slice(0, 6).map(cat => ({
    ...cat,
    linkCount: getCategoryLinkCount(cat.id)
  }))
})

const recentLinks = computed(() => {
  let links = [...store.links].sort((a, b) => b.createdAt - a.createdAt)

  if (props.selectedAgeStages.length > 0) {
    const stageId = props.selectedAgeStages[0]
    links = links.filter(link => linkMatchesAgeStage(link, stageId))
  }

  return links.slice(0, 4)
})

const defaultLinks = computed(() => {
  let links = store.links.filter(l => l.isDefault)

  if (props.selectedAgeStages.length > 0) {
    const stageId = props.selectedAgeStages[0]
    links = links.filter(link => linkMatchesAgeStage(link, stageId))
  }

  return links.slice(0, 4)
})

const contentTabs = computed(() => [
  { id: 'quick', label: '实用工具', icon: Rocket, count: quickActions.value.length },
  { id: 'recent', label: '最近收录', icon: Clock, count: recentLinks.value.length },
  { id: 'popular', label: '热门主题', icon: FolderOpen, count: popularCategories.value.length },
  { id: 'recommended', label: '精选资源', icon: Award, count: defaultLinks.value.length },
  { id: 'favorites', label: '我的收藏', icon: Star, count: favoriteLinks.value.length }
])

function handleContentTabKeydown(event, currentIndex) {
  let nextIndex = null

  if (event.key === 'ArrowRight') {
    nextIndex = (currentIndex + 1) % contentTabs.value.length
  } else if (event.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + contentTabs.value.length) % contentTabs.value.length
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = contentTabs.value.length - 1
  }

  if (nextIndex === null) return

  event.preventDefault()
  const nextTab = contentTabs.value[nextIndex]
  activeContentTab.value = nextTab.id
  nextTick(() => document.getElementById(`dashboard-tab-${nextTab.id}`)?.focus())
}

function linkMatchesAgeStage(link, stageId) {
  const linkStages = link.ageStages || []
  return linkStages.length === 0 || linkStages.includes(stageId)
}

function getIcon(iconName) {
  return iconMap[iconName] || BookOpen
}

function getCategoryName(categoryId) {
  for (const cat of store.categories) {
    if (cat.id === categoryId) return cat.name
    if (cat.children) {
      const child = cat.children.find(c => c.id === categoryId)
      if (child) return child.name
    }
  }
  return ''
}

function getCategoryIcon(categoryId) {
  for (const cat of store.categories) {
    if (cat.id === categoryId) return getIcon(cat.icon)
    if (cat.children) {
      const child = cat.children.find(c => c.id === categoryId)
      if (child) return getIcon(child.icon)
    }
  }
  return Globe
}

function handleAction(action) {
  if (action.id === 'vaccine') {
    showVaccineGuide.value = true
    return
  }
  if (action.id === 'growth') {
    showGrowthTracker.value = true
    return
  }
  alert(`${action.title}功能开发中`)
}

function openLink(link) {
  if (!openExternalLink(link.url)) {
    alert('该链接地址不安全或格式无效')
  }
}
</script>

<style scoped>
.dashboard {
  padding: 1rem;
  max-width: 100%;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.age-stage-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: var(--radius-lg);
  border: 1px solid;
  transition: all 0.3s ease;
  height: 100%;
}

.banner-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.banner-content {
  flex: 1;
  min-width: 0;
}

.banner-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.banner-desc {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.4;
}

.banner-toggle {
  padding: 0.375rem;
  border-radius: var(--radius-sm);
  border: none;
  background-color: rgba(0, 0, 0, 0.05);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.banner-toggle:hover {
  background-color: rgba(0, 0, 0, 0.1);
}

.banner-empty {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(99, 102, 241, 0.02) 100%);
  border-color: rgba(99, 102, 241, 0.2);
}

.banner-empty-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: rgba(99, 102, 241, 0.1);
  color: var(--primary-color);
}

.banner-empty-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.banner-empty-desc {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background-color: var(--card-bg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.125rem;
}

.stat-link {
  cursor: pointer;
  transition: all 0.2s ease;
}

.stat-link:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat-arrow {
  color: var(--text-secondary);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.stat-link:hover .stat-arrow {
  opacity: 1;
}

.banner-tip-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.tip-wrapper {
  display: flex;
  align-items: stretch;
}

.tip-section-inline {
  flex: 1;
  background: linear-gradient(135deg, rgba(251, 191, 36, 0.1) 0%, rgba(251, 191, 36, 0.05) 100%);
  border: 1px solid rgba(251, 191, 36, 0.2);
  border-radius: var(--radius-lg);
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
}

.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.action-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background-color: var(--bg-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-card:hover {
  background-color: rgba(99, 102, 241, 0.05);
  transform: translateX(4px);
}

.action-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.action-info {
  flex: 1;
  min-width: 0;
}

.action-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.action-desc {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.125rem;
}

.action-arrow {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.recent-links {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.recent-link-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem;
  background-color: var(--bg-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s ease;
}

.recent-link-card:hover {
  background-color: rgba(99, 102, 241, 0.05);
}

.recent-link-favicon {
  width: 32px;
  height: 32px;
  background-color: var(--card-bg);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.recent-link-favicon.fav {
  background-color: rgba(245, 158, 11, 0.15);
}

.recent-link-favicon.fav svg {
  color: #f59e0b;
}

.recent-link-info {
  flex: 1;
  min-width: 0;
}

.recent-link-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
}

.link-tag {
  font-size: 0.625rem;
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
  flex-shrink: 0;
}

.tag-default {
  background-color: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-secondary);
}

.empty-state p {
  margin: 0.5rem 0 0.25rem 0;
  font-size: 0.875rem;
}

.empty-hint {
  font-size: 0.75rem;
  opacity: 0.7;
}

.recent-link-title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-link-category {
  font-size: 0.7rem;
  color: var(--text-secondary);
  margin-top: 0.125rem;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.625rem;
}

.category-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background-color: var(--bg-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.category-card:hover {
  background-color: rgba(99, 102, 241, 0.05);
  transform: translateY(-2px);
}

.category-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.category-info {
  text-align: center;
}

.category-name {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.category-link-count {
  font-size: 0.7rem;
  color: var(--text-secondary);
  margin-top: 0.125rem;
}

.tip-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.tip-header svg {
  color: #f59e0b;
}

.tip-header h3 {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.tip-text {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.6;
  margin: 0;
}

@media (max-width: 1200px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }

  .category-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .dashboard {
    padding: 0.5rem;
  }

  .stats-row {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .stat-card {
    padding: 0.75rem;
  }

  .stat-value {
    font-size: 1rem;
  }

  .category-grid {
    grid-template-columns: repeat(2, 1fr);
  }

}

/* Visual hierarchy refresh */
.dashboard {
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 0;
}

.banner-tip-row {
  grid-template-columns: minmax(0, 1.7fr) minmax(260px, 0.85fr);
  gap: 1rem;
  margin-bottom: 1rem;
}

.age-stage-banner {
  position: relative;
  min-height: 116px;
  padding: 1.15rem 1.3rem;
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.age-stage-banner::after {
  content: "";
  position: absolute;
  right: -34px;
  bottom: -46px;
  width: 132px;
  height: 132px;
  border: 22px solid rgba(255, 255, 255, 0.42);
  border-radius: 50%;
  pointer-events: none;
}

.banner-icon,
.banner-empty-icon {
  position: relative;
  z-index: 1;
  width: 58px;
  height: 58px;
  border-radius: 1.15rem;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.62);
}

.banner-content,
.banner-empty-content,
.banner-toggle {
  position: relative;
  z-index: 1;
}

.banner-title,
.banner-empty-title {
  font-size: 1rem;
  font-weight: 750;
}

.banner-desc,
.banner-empty-desc {
  max-width: 56rem;
  font-size: 0.84rem;
  line-height: 1.6;
}

.banner-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  background-color: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 50%;
  color: var(--text-secondary);
}

.banner-toggle:hover {
  color: var(--primary-dark);
  background-color: white;
  box-shadow: var(--shadow-sm);
}

.banner-empty {
  background: linear-gradient(135deg, var(--primary-soft), #f9fdfb 72%, var(--warm-soft));
  border-color: rgba(40, 127, 116, 0.18);
}

.banner-empty-icon {
  color: white;
  background: linear-gradient(135deg, var(--primary-light), var(--primary-color));
}

.tip-section-inline {
  position: relative;
  justify-content: center;
  min-height: 116px;
  padding: 1.1rem 1.2rem;
  background: linear-gradient(145deg, var(--warm-soft), #fffaf0);
  border-color: rgba(242, 173, 74, 0.28);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.tip-section-inline::after {
  content: "✦";
  position: absolute;
  right: 1rem;
  top: 0.7rem;
  color: rgba(242, 173, 74, 0.3);
  font-size: 2rem;
}

.tip-header {
  margin-bottom: 0.4rem;
}

.tip-header svg {
  color: #b96f09;
}

.tip-header h3 {
  font-size: 0.9rem;
  font-weight: 750;
}

.tip-text {
  max-width: 34rem;
  font-size: 0.8rem;
  color: #6f5b3a;
}

.stats-row {
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.stat-card {
  width: 100%;
  min-width: 0;
  padding: 0.9rem;
  font: inherit;
  text-align: left;
  background: linear-gradient(145deg, #ffffff, var(--surface-soft));
  border-color: rgba(220, 235, 230, 0.94);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}

.stat-icon {
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border-radius: 0.85rem;
}

.stat-value {
  font-size: 1.3rem;
  font-weight: 800;
  line-height: 1.15;
}

.stat-label {
  color: var(--text-secondary);
  font-weight: 550;
}

.stat-arrow {
  opacity: 0.45;
  transition: transform var(--transition-fast), opacity var(--transition-fast);
}

.stat-link:hover {
  border-color: rgba(40, 127, 116, 0.2);
  box-shadow: var(--shadow-md);
}

.stat-link:hover .stat-arrow {
  opacity: 1;
  transform: translateX(2px);
}

.ai-search-full {
  margin-top: 1rem;
  border: 0;
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-md);
}

.quick-actions {
  gap: 0.55rem;
}

.action-card,
.recent-link-card,
.category-card {
  width: 100%;
  font: inherit;
  color: inherit;
  text-align: left;
  background-color: var(--surface-soft);
  border: 1px solid transparent;
}

.action-card {
  min-height: 64px;
  padding: 0.68rem;
  border-radius: var(--radius-lg);
}

.action-card:hover,
.recent-link-card:hover,
.category-card:hover {
  background-color: white;
  border-color: rgba(40, 127, 116, 0.18);
  box-shadow: var(--shadow-sm);
}

.action-card:hover {
  transform: translateX(3px);
}

.action-icon {
  width: 42px;
  height: 42px;
  border-radius: 0.9rem;
}

.action-title,
.category-name {
  font-weight: 700;
}

.action-desc {
  color: var(--text-secondary);
}

.recent-links {
  gap: 0.45rem;
}

.recent-link-card {
  min-height: 50px;
  padding: 0.55rem 0.6rem;
  border-radius: var(--radius-md);
}

.recent-link-favicon {
  width: 34px;
  height: 34px;
  color: var(--primary-dark);
  background-color: var(--primary-soft);
  border-radius: 0.72rem;
}

.recent-link-favicon.fav {
  color: #8a5b09;
  background-color: var(--warm-soft);
}

.recent-link-title {
  font-weight: 650;
}

.link-tag {
  padding: 0.16rem 0.42rem;
  font-weight: 650;
}

.tag-default {
  color: #236f67;
  background-color: var(--primary-soft);
}

.category-grid {
  gap: 0.55rem;
}

.category-card {
  min-height: 120px;
  justify-content: center;
  padding: 0.9rem;
  border-radius: var(--radius-lg);
  text-align: center;
}

.category-card:hover {
  transform: translateY(-2px);
}

.category-icon {
  width: 46px;
  height: 46px;
  border-radius: 1rem;
}

.empty-state {
  min-height: 132px;
  padding: 1.5rem 1rem;
  background: linear-gradient(145deg, var(--surface-soft), white);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
}

.empty-hint {
  color: var(--text-muted);
  opacity: 1;
}

@media (max-width: 1200px) {
  .banner-tip-row {
    grid-template-columns: minmax(0, 1.5fr) minmax(240px, 0.8fr);
    gap: 0.8rem;
  }

}

@media (max-width: 992px) {
  .banner-tip-row {
    grid-template-columns: 1fr;
  }

  .tip-section-inline {
    min-height: auto;
  }

}

@media (max-width: 768px) {
  .age-stage-banner {
    min-height: auto;
  }

  .stats-row {
    gap: 0.6rem;
  }

}

@media (max-width: 480px) {
  .dashboard {
    padding: 0;
  }

  .banner-tip-row {
    gap: 0.65rem;
  }

  .age-stage-banner {
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: var(--radius-xl);
  }

  .banner-icon,
  .banner-empty-icon {
    width: 46px;
    height: 46px;
    border-radius: 0.9rem;
  }

  .banner-toggle {
    width: 32px;
    height: 32px;
  }

  .tip-section-inline {
    padding: 0.9rem 1rem;
    border-radius: var(--radius-xl);
  }

  .stats-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stat-card {
    gap: 0.55rem;
    padding: 0.72rem;
  }

  .stat-icon {
    width: 36px;
    height: 36px;
  }

  .stat-arrow {
    display: none;
  }

  .stat-value {
    font-size: 1.05rem;
  }

  .category-card {
    min-height: 108px;
    padding: 0.75rem 0.5rem;
  }
}

.dashboard-content-hub {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(220, 235, 230, 0.94);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.content-tabs {
  display: flex;
  gap: 0.45rem;
  padding: 0.6rem;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  background:
    radial-gradient(circle at 8% 20%, rgba(103, 200, 185, 0.16), transparent 16rem),
    linear-gradient(135deg, var(--surface-soft), #fffaf2);
  border-bottom: 1px solid var(--border-color);
}

.content-tabs::-webkit-scrollbar {
  display: none;
}

.content-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 0;
  min-width: 0;
  min-height: 48px;
  gap: 0.45rem;
  padding: 0.55rem 0.7rem;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  white-space: nowrap;
  color: var(--text-secondary);
  background-color: rgba(255, 255, 255, 0.74);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-base),
    transform var(--transition-fast);
}

.content-tab:hover {
  color: var(--primary-dark);
  background-color: white;
  border-color: var(--border-color);
  transform: translateY(-1px);
}

.content-tab.active {
  color: white;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  border-color: transparent;
  box-shadow: 0 8px 18px rgba(40, 127, 116, 0.22);
}

.content-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 0.38rem;
  font-size: 0.7rem;
  line-height: 1;
  color: var(--primary-dark);
  background-color: var(--primary-soft);
  border-radius: 999px;
}

.content-tab.active .content-tab-count {
  color: white;
  background-color: rgba(255, 255, 255, 0.2);
}

.content-tab-panel {
  min-height: 238px;
  padding: 1.15rem;
}

.content-tab-panel:focus-visible {
  outline: 2px solid var(--primary-dark);
  outline-offset: -4px;
}

.content-tab-panel .quick-actions,
.content-tab-panel .recent-links {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.content-tab-panel .action-card {
  min-height: 78px;
  padding: 0.8rem;
}

.content-tab-panel .recent-link-card {
  min-width: 0;
  min-height: 68px;
  padding: 0.7rem;
  border-radius: var(--radius-lg);
}

.content-tab-panel .category-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
}

.content-tab-panel .category-card {
  min-width: 0;
  min-height: 92px;
  flex-direction: row;
  justify-content: flex-start;
  padding: 0.8rem;
  text-align: left;
}

.content-tab-panel .category-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border-radius: 0.9rem;
}

.content-tab-panel .category-info {
  min-width: 0;
  text-align: left;
}

.content-tab-panel .empty-state {
  grid-column: 1 / -1;
}

.tab-panel-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 36px;
  margin-bottom: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.content-tab-enter-active,
.content-tab-leave-active {
  transition:
    opacity var(--transition-base),
    transform var(--transition-base);
}

.content-tab-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.content-tab-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 992px) {
  .content-tabs {
    justify-content: flex-start;
    padding: 0.55rem;
    scroll-snap-type: x proximity;
  }

  .content-tab {
    flex: 0 0 auto;
    min-width: 132px;
    scroll-snap-align: start;
  }
}

@media (max-width: 768px) {
  .content-tab-panel {
    min-height: 0;
    padding: 1rem;
  }

  .content-tab-panel .category-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 540px) {
  .dashboard-content-hub {
    border-radius: var(--radius-xl);
  }

  .content-tab {
    min-width: 126px;
    min-height: 46px;
    padding: 0.5rem 0.65rem;
  }

  .content-tab-panel {
    padding: 0.85rem;
  }

  .content-tab-panel .quick-actions,
  .content-tab-panel .recent-links {
    grid-template-columns: 1fr;
  }

  .content-tab-panel .category-card {
    min-height: 86px;
    padding: 0.7rem;
  }

  .tab-panel-toolbar {
    align-items: flex-start;
  }
}
</style>
