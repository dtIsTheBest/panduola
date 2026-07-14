<template>
  <div class="dashboard">
    <div class="dashboard-welcome">
      <div class="welcome-badge">
        <component :is="getStageIcon(currentStage?.id)" :size="16" />
        <span>{{ currentStage?.title || '选择阶段' }}</span>
      </div>
      <h1>欢迎回来，宝爸宝妈</h1>
      <p>{{ currentStage?.description || '选择宝宝的年龄阶段，开始探索育儿知识' }}</p>
    </div>

    <div class="dashboard-stats">
      <div class="stat-card" v-for="stat in stats" :key="stat.label">
        <div class="stat-icon" :style="{ backgroundColor: stat.color + '15' }">
          <component :is="stat.icon" :style="{ color: stat.color }" :size="24" />
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ stat.value }}</div>
          <div class="stat-label">{{ stat.label }}</div>
        </div>
      </div>
    </div>

    <div class="dashboard-section">
      <AISearch />
    </div>

    <div class="dashboard-section">
      <div class="section-header">
        <h2>快捷入口</h2>
      </div>
      <div class="quick-actions">
        <div
          v-for="action in quickActions"
          :key="action.id"
          class="action-card"
          @click="handleAction(action)"
        >
          <div class="action-icon" :style="{ backgroundColor: action.color + '15' }">
            <component :is="action.icon" :style="{ color: action.color }" :size="28" />
          </div>
          <div class="action-title">{{ action.title }}</div>
          <div class="action-desc">{{ action.description }}</div>
        </div>
      </div>
    </div>

    <div class="dashboard-section">
      <div class="section-header">
        <h2>年龄阶段导航</h2>
        <span class="section-hint">点击切换查看不同阶段</span>
      </div>
      <div class="stage-scroll">
        <div
          v-for="stage in ageStages"
          :key="stage.id"
          class="stage-chip"
          :class="{ active: currentStage?.id === stage.id }"
          @click="selectStage(stage)"
        >
          <component :is="getStageIcon(stage.id)" :size="16" />
          <span class="stage-chip-title">{{ stage.title }}</span>
          <span class="stage-chip-range">{{ stage.ageRange }}</span>
        </div>
      </div>
    </div>

    <div class="dashboard-section">
      <div class="section-header">
        <h2>热门分类</h2>
      </div>
      <div class="category-grid">
        <div
          v-for="category in popularCategories"
          :key="category.id"
          class="category-card"
          @click="$emit('category-select', category)"
        >
          <div class="category-icon" :style="{ backgroundColor: category.color + '15' }">
            <component :is="getIcon(category.icon)" :style="{ color: category.color }" :size="24" />
          </div>
          <div class="category-info">
            <div class="category-name">{{ category.name }}</div>
            <div class="category-link-count">{{ getLinkCount(category) }} 个链接</div>
          </div>
          <ChevronRight :size="16" class="category-arrow" />
        </div>
      </div>
    </div>

    <div class="dashboard-section">
      <div class="section-header">
        <h2>最近添加</h2>
        <button class="btn btn-secondary btn-sm" @click="$emit('view-all-links')">查看全部</button>
      </div>
      <div class="recent-links">
        <div
          v-for="link in recentLinks"
          :key="link.id"
          class="recent-link-card"
          @click="openLink(link)"
        >
          <div class="recent-link-favicon">
            <Globe :size="18" />
          </div>
          <div class="recent-link-info">
            <div class="recent-link-title">{{ link.title }}</div>
            <div class="recent-link-category">{{ getCategoryName(link.categoryId) }}</div>
          </div>
          <ExternalLink :size="14" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  ChevronRight, Globe, ExternalLink, BookOpen, Heart, Baby, Syringe,
  Activity, Calendar, Calculator, Star, Clock, TrendingUp, Users, Home,
  GraduationCap, Stethoscope, Moon
} from 'lucide-vue-next'
import { store, AGE_STAGES } from '@/data/store'
import AISearch from './AISearch.vue'

defineEmits(['category-select', 'stage-select', 'view-all-links'])

const currentStage = ref(null)
const ageStages = ref(AGE_STAGES)

const iconMap = {
  Baby, Heart, Home: Home || Heart, BookOpen, Wrench: Activity, Utensils: Calculator,
  Moon: Clock, TrendingUp, GraduationCap: BookOpen, Syringe, Stethoscope: Heart,
  Activity, ShoppingBag: Users, Building: Users, Users: Users, BookMarked: BookOpen,
  Headphones: Activity, Ruler: TrendingUp, Calendar, Calculator, Folder: BookOpen
}

const stageIcons = {
  'age0-1': Baby,
  'age1-3': Baby,
  'age3-6': Heart,
  'age6-9': BookOpen,
  'age9-12': BookOpen,
  'age12-15': GraduationCap || BookOpen,
  'age15-18': GraduationCap || BookOpen,
  'age18-22': Users,
  'age22+': Users
}

const stats = computed(() => [
  { icon: BookOpen, value: store.links.length, label: '总链接数', color: '#6366f1' },
  { icon: Heart, value: store.categories.length, label: '分类数', color: '#ec4899' },
  { icon: Star, value: getFavoriteCount(), label: '收藏数', color: '#f59e0b' },
  { icon: Clock, value: getTodayVisits(), label: '今日访问', color: '#10b981' }
])

const quickActions = [
  { id: 'vaccine', icon: Syringe, title: '疫苗接种', description: '查看疫苗接种时间表', color: '#ef4444' },
  { id: 'growth', icon: TrendingUp, title: '生长曲线', description: '记录宝宝身高体重', color: '#3b82f6' },
  { id: 'food', icon: Calculator, title: '辅食计算器', description: '科学搭配宝宝辅食', color: '#10b981' },
  { id: 'schedule', icon: Calendar, title: '育儿日程', description: '记录重要育儿事件', color: '#f59e0b' }
]

const popularCategories = computed(() => {
  return store.categories.slice(0, 6).map(cat => ({
    ...cat,
    linkCount: getLinkCount(cat)
  }))
})

const recentLinks = computed(() => {
  return [...store.links].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5)
})

function getIcon(iconName) {
  return iconMap[iconName] || BookOpen
}

function getStageIcon(stageId) {
  return stageIcons[stageId] || Baby
}

function getLinkCount(category) {
  let count = store.getLinksByCategory(category.id).length
  if (category.children) {
    count += category.children.reduce((sum, child) => sum + store.getLinksByCategory(child.id).length, 0)
  }
  return count
}

function getFavoriteCount() {
  return store.links.filter(l => l.favorite).length
}

function getTodayVisits() {
  const today = new Date().toDateString()
  return store.links.reduce((sum, l) => {
    if (l.lastVisit && new Date(l.lastVisit).toDateString() === today) {
      return sum + (l.visitCount || 0)
    }
    return sum
  }, 0)
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

function selectStage(stage) {
  currentStage.value = stage
}

function handleAction(action) {
  alert(`${action.title}功能开发中`)
}

function openLink(link) {
  window.open(link.url, '_blank')
}
</script>

<style scoped>
.dashboard {
  padding: 1rem;
  max-width: 800px;
  margin: 0 auto;
}

.dashboard-welcome {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-light) 100%);
  border-radius: var(--radius-xl);
  padding: 2rem;
  margin-bottom: 1.5rem;
  color: white;
}

.welcome-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  background-color: rgba(255, 255, 255, 0.2);
  padding: 0.375rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  margin-bottom: 1rem;
}

.dashboard-welcome h1 {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.dashboard-welcome p {
  font-size: 0.9375rem;
  opacity: 0.9;
  line-height: 1.5;
}

.dashboard-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background-color: var(--card-bg);
  border-radius: var(--radius-lg);
  padding: 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.stat-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-content {
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

.dashboard-section {
  margin-bottom: 1.5rem;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.section-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.section-hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.quick-actions {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

.action-card {
  background-color: var(--card-bg);
  border-radius: var(--radius-lg);
  padding: 1rem;
  text-align: center;
  cursor: pointer;
  border: 1px solid var(--border-color);
  transition: all 0.2s ease;
}

.action-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--primary-color);
}

.action-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 0.5rem;
}

.action-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.action-desc {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.stage-scroll {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
}

.stage-scroll::-webkit-scrollbar {
  height: 4px;
}

.stage-chip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background-color: var(--card-bg);
  border-radius: var(--radius-lg);
  border: 2px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.stage-chip:hover {
  border-color: var(--primary-color);
}

.stage-chip.active {
  border-color: var(--primary-color);
  background-color: rgba(99, 102, 241, 0.05);
}

.stage-chip-title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-primary);
}

.stage-chip-range {
  font-size: 0.6875rem;
  color: var(--text-secondary);
  background-color: var(--bg-color);
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
}

.category-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.category-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background-color: var(--card-bg);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;
}

.category-card:hover {
  transform: translateX(4px);
  box-shadow: var(--shadow-md);
}

.category-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.category-info {
  flex: 1;
  min-width: 0;
}

.category-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.category-link-count {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.125rem;
}

.category-arrow {
  color: var(--text-secondary);
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
  padding: 0.75rem;
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;
}

.recent-link-card:hover {
  background-color: var(--bg-color);
}

.recent-link-favicon {
  width: 36px;
  height: 36px;
  background-color: var(--bg-color);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.recent-link-info {
  flex: 1;
  min-width: 0;
}

.recent-link-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-link-category {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.125rem;
}

@media (max-width: 768px) {
  .dashboard-welcome {
    padding: 1.5rem 1rem;
  }

  .dashboard-welcome h1 {
    font-size: 1.375rem;
  }

  .dashboard-stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .quick-actions {
    grid-template-columns: repeat(2, 1fr);
  }

  .category-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .dashboard {
    padding: 0.5rem;
  }

  .dashboard-stats {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .stat-card {
    padding: 0.75rem;
  }

  .quick-actions {
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .action-card {
    padding: 0.75rem 0.5rem;
  }

  .action-icon {
    width: 44px;
    height: 44px;
  }
}
</style>