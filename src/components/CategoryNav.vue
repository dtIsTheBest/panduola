<template>
  <div class="category-nav">
    <div class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <button class="btn btn-secondary btn-sm sidebar-toggle" @click="toggleSidebar">
          <ChevronLeft :size="18" />
        </button>
        <span class="sidebar-title">带娃百科</span>
      </div>
      
      <div class="age-stage-section">
        <div class="section-title">
          <Users :size="14" />
          <span>年龄阶段</span>
        </div>
        <div class="age-stage-list">
          <div
            v-for="stage in ageStages"
            :key="stage.id"
            class="age-stage-item"
            :class="{ active: selectedAgeStage === stage.id }"
            @click="selectAgeStage(stage.id)"
            :title="stage.description"
          >
            <component :is="getStageIcon(stage.id)" :size="16" />
            <div class="stage-info">
              <div class="stage-title">{{ stage.title }}</div>
              <div class="stage-range">{{ stage.ageRange }}</div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="section-divider"></div>
      
      <div class="primary-categories">
        <div
          v-for="category in filteredCategories"
          :key="category.id"
          class="primary-category-item"
          :class="{ active: selectedCategory?.id === category.id }"
          @click="selectCategory(category)"
        >
          <component :is="getIcon(category.icon)" :style="{ color: category.color }" :size="20" />
          <span>{{ category.name }}</span>
          <span class="category-count">{{ getCategoryLinkCount(category) }}</span>
        </div>
      </div>
      
      <div class="sidebar-actions">
        <button class="btn btn-secondary btn-sm" @click="$emit('manageCategories')">
          <Settings :size="16" /> 管理分类
        </button>
      </div>
    </div>
    
    <div class="sidebar-overlay" v-if="sidebarOpen && isMobile" @click="toggleSidebar"></div>
    
    <div class="content-area">
      <div v-if="selectedCategory" class="subcategory-section">
        <div class="subcategory-header">
          <button class="btn btn-secondary btn-sm mobile-back" @click="selectedCategory = null">
            <ArrowLeft :size="16" /> 返回
          </button>
          <div class="subcategory-title-row">
            <component :is="getIcon(selectedCategory.icon)" :style="{ color: selectedCategory.color }" :size="20" />
            <span>{{ selectedCategory.name }}</span>
          </div>
        </div>
        
        <div v-if="selectedCategory.children && selectedCategory.children.length" class="subcategory-grid">
          <div
            v-for="child in selectedCategory.children"
            :key="child.id"
            class="subcategory-card"
            :class="{ active: currentSubcategory?.id === child.id }"
            @click="selectSubcategory(child)"
          >
            <div class="subcategory-icon" :style="{ backgroundColor: child.color + '15' }">
              <component :is="getIcon(child.icon || 'Folder')" :style="{ color: child.color }" :size="24" />
            </div>
            <div class="subcategory-info">
              <div class="subcategory-name">{{ child.name }}</div>
              <div class="subcategory-count">{{ getCategoryLinkCount(child) }} 个链接</div>
            </div>
          </div>
        </div>
        
        <div v-else class="subcategory-empty">
          <FolderOpen :size="48" class="text-gray-300" />
          <p>该分类下暂无子分类</p>
        </div>
      </div>
      
      <div v-else class="welcome-section">
        <div class="welcome-icon">
          <Sparkles :size="48" />
        </div>
        <h2>欢迎使用潘多拉</h2>
        <p>选择左侧年龄阶段，浏览对应阶段的育儿资源</p>
        <div class="stats-row">
          <div class="stat-item">
            <div class="stat-value">{{ totalCategories }}</div>
            <div class="stat-label">分类</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">{{ totalLinks }}</div>
            <div class="stat-label">链接</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { 
  ChevronLeft, ArrowLeft, Settings, Folder, FolderOpen, Sparkles, Users,
  Baby, Heart, Home, BookOpen, Wrench, Utensils, Moon, TrendingUp,
  GraduationCap, Syringe, Stethoscope, Activity, ShoppingBag, Building,
  Users as UsersIcon, BookMarked, Headphones, Ruler, Calendar, Calculator,
  Briefcase, School
} from 'lucide-vue-next'
import { store, AGE_STAGES } from '@/data/store'

const emit = defineEmits(['categoryChange', 'ageStageChange', 'manageCategories'])

const categories = ref(store.categories)
const selectedCategory = ref(null)
const currentSubcategory = ref(null)
const selectedAgeStage = ref('')
const sidebarOpen = ref(true)
const isMobile = ref(false)

const ageStages = ref(AGE_STAGES)

const iconMap = {
  Baby, Heart, Home, BookOpen, Wrench, Utensils, Moon, TrendingUp,
  GraduationCap, Syringe, Stethoscope, Activity, ShoppingBag, Building,
  UsersIcon, BookMarked, Headphones, Ruler, Calendar, Calculator, Folder
}

const stageIcons = {
  'age0-1': Baby,
  'age1-3': Baby,
  'age3-6': Heart,
  'age6-9': School,
  'age9-12': School,
  'age12-15': GraduationCap,
  'age15-18': GraduationCap,
  'age18-22': Briefcase,
  'age22+': Briefcase
}

const filteredCategories = computed(() => {
  if (!selectedAgeStage.value) {
    return categories.value
  }
  
  return categories.value.map(cat => {
    const visibleChildren = cat.children.filter(child => {
      const childStages = child.ageStages || []
      return childStages.length === 0 || childStages.includes(selectedAgeStage.value)
    })
    
    return {
      ...cat,
      children: visibleChildren
    }
  }).filter(cat => cat.children.length > 0)
})

const totalCategories = computed(() => {
  let count = filteredCategories.value.length
  for (const cat of filteredCategories.value) {
    if (cat.children) count += cat.children.length
  }
  return count
})

const totalLinks = computed(() => {
  if (!selectedAgeStage.value) {
    return store.links.length
  }
  return store.links.filter(l => {
    const linkStages = l.ageStages || []
    return linkStages.length === 0 || linkStages.includes(selectedAgeStage.value)
  }).length
})

function getIcon(iconName) {
  return iconMap[iconName] || Folder
}

function getStageIcon(stageId) {
  return stageIcons[stageId] || Baby
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

function selectAgeStage(stageId) {
  selectedAgeStage.value = selectedAgeStage.value === stageId ? '' : stageId
  selectedCategory.value = null
  currentSubcategory.value = null
  emit('ageStageChange', selectedAgeStage.value ? [selectedAgeStage.value] : [])
}

function selectCategory(category) {
  selectedCategory.value = category
  currentSubcategory.value = null
}

function selectSubcategory(subcategory) {
  currentSubcategory.value = subcategory
}

function getCategoryLinkCount(category) {
  let count = store.getLinksByCategory(category.id).length
  if (category.children) {
    count += category.children.reduce((sum, child) => sum + store.getLinksByCategory(child.id).length, 0)
  }
  return count
}

if (typeof window !== 'undefined') {
  isMobile.value = window.innerWidth < 768
  window.addEventListener('resize', () => {
    isMobile.value = window.innerWidth < 768
    if (!isMobile.value) {
      sidebarOpen.value = true
    }
  })
}
</script>

<style scoped>
.category-nav {
  display: flex;
  min-height: calc(100vh - 140px);
}

.sidebar {
  width: 240px;
  background-color: var(--card-bg);
  border-right: 1px solid var(--border-color);
  position: fixed;
  left: 0;
  top: 60px;
  bottom: 60px;
  z-index: 50;
  overflow-y: auto;
  transition: transform 0.3s ease;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.sidebar-toggle {
  display: none;
}

.sidebar-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.age-stage-section {
  padding: 0.5rem 0;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.age-stage-list {
  padding: 0 0.25rem;
}

.age-stage-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.age-stage-item:hover {
  background-color: var(--bg-color);
}

.age-stage-item.active {
  background-color: rgba(99, 102, 241, 0.1);
  color: var(--primary-color);
}

.age-stage-item .stage-info {
  flex: 1;
  min-width: 0;
}

.stage-title {
  font-size: 0.8125rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stage-range {
  font-size: 0.6875rem;
  opacity: 0.7;
  margin-top: 0.125rem;
}

.section-divider {
  height: 1px;
  background-color: var(--border-color);
  margin: 0.5rem 0;
}

.primary-categories {
  padding: 0.5rem;
}

.primary-category-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.875rem;
}

.primary-category-item:hover {
  background-color: var(--bg-color);
}

.primary-category-item.active {
  background-color: rgba(99, 102, 241, 0.1);
  color: var(--primary-color);
}

.category-count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--text-secondary);
  background-color: var(--bg-color);
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}

.sidebar-actions {
  padding: 1rem;
  border-top: 1px solid var(--border-color);
}

.content-area {
  flex: 1;
  margin-left: 240px;
  padding: 1rem;
}

.subcategory-section {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.subcategory-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.mobile-back {
  display: none;
}

.subcategory-title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.subcategory-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.75rem;
}

.subcategory-card {
  background-color: var(--card-bg);
  border-radius: var(--radius-lg);
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
}

.subcategory-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.subcategory-card.active {
  border-color: var(--primary-color);
  background-color: rgba(99, 102, 241, 0.05);
}

.subcategory-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.75rem;
}

.subcategory-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.subcategory-count {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.subcategory-empty {
  text-align: center;
  padding: 3rem;
  color: var(--text-secondary);
}

.welcome-section {
  text-align: center;
  padding: 3rem 1rem;
}

.welcome-icon {
  width: 100px;
  height: 100px;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-light));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1.5rem;
  color: white;
}

.welcome-section h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.welcome-section p {
  color: var(--text-secondary);
  margin-bottom: 2rem;
}

.stats-row {
  display: flex;
  justify-content: center;
  gap: 3rem;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--primary-color);
}

.stat-label {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.sidebar-overlay {
  display: none;
}

@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
    width: 280px;
  }
  
  .sidebar.open {
    transform: translateX(0);
  }
  
  .sidebar-toggle {
    display: flex;
  }
  
  .sidebar-overlay {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 40;
  }
  
  .content-area {
    margin-left: 0;
    padding: 0.5rem;
  }
  
  .mobile-back {
    display: flex;
  }
  
  .subcategory-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.5rem;
  }
}
</style>
