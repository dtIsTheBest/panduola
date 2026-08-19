<template>
  <div class="category-nav">
    <div
      class="sidebar"
      :class="{ open: sidebarOpen }"
      role="navigation"
      aria-label="成长阶段筛选"
      :inert="isMobile && !sidebarOpen"
      :aria-hidden="isMobile && !sidebarOpen ? 'true' : undefined"
      @keydown.esc.stop.prevent="closeSidebar"
    >
      <div class="sidebar-header">
        <button ref="closeButton" class="btn btn-secondary btn-sm sidebar-toggle" aria-label="关闭年龄阶段导航" title="关闭年龄阶段导航" @click="closeSidebar">
          <ChevronLeft :size="18" />
        </button>
        <div class="sidebar-heading">
          <span class="sidebar-title">成长阶段</span>
          <span class="sidebar-caption">选择后自动筛选内容</span>
        </div>
      </div>
      
      <div class="age-stage-section">
        <div class="section-title">
          <ListFilter :size="14" />
          <span>按年龄浏览</span>
        </div>
        <div class="age-stage-list">
          <button
            type="button"
            class="age-stage-item all-stage-item"
            :class="{ active: selectedAgeStage === '' }"
            :aria-pressed="selectedAgeStage === ''"
            @click="selectAgeStage('')"
          >
            <Compass :size="16" />
            <div class="stage-info">
              <div class="stage-title">全部阶段</div>
              <div class="stage-range">浏览所有资源</div>
            </div>
          </button>
          <button
            v-for="stage in ageStages"
            :key="stage.id"
            type="button"
            class="age-stage-item"
            :class="{ active: selectedAgeStage === stage.id }"
            @click="selectAgeStage(stage.id)"
            :aria-pressed="selectedAgeStage === stage.id"
            :title="stage.description"
          >
            <component :is="getStageIcon(stage.id)" :size="16" />
            <div class="stage-info">
              <div class="stage-title">{{ stage.title }}</div>
              <div class="stage-range">{{ stage.ageRange }}</div>
            </div>
          </button>
        </div>
      </div>
      
    </div>
    
    <div class="sidebar-overlay" v-if="sidebarOpen && isMobile" @click="closeSidebar"></div>
    
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { 
  ChevronLeft, Compass, ListFilter,
  Baby, Wrench, Flower2, BookOpen, GraduationCap, Moon, Rocket, Sun, Award
} from 'lucide-vue-next'
import { AGE_STAGES } from '@/data/store'

const emit = defineEmits(['ageStageChange'])

const selectedAgeStage = ref('')
const isMobile = ref(typeof window !== 'undefined' && window.innerWidth <= 768)
const sidebarOpen = ref(!isMobile.value)
const closeButton = ref(null)
let previousFocus = null

const ageStages = ref(AGE_STAGES)

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

function getStageIcon(stageId) {
  return stageIcons[stageId] || Baby
}

function toggleSidebar(trigger) {
  if (sidebarOpen.value) {
    closeSidebar()
  } else {
    openSidebar(trigger)
  }
}

function openSidebar(trigger) {
  previousFocus = trigger instanceof HTMLElement ? trigger : document.activeElement
  sidebarOpen.value = true
  nextTick(() => closeButton.value?.focus())
}

function closeSidebar() {
  sidebarOpen.value = false
  nextTick(() => {
    if (previousFocus instanceof HTMLElement) previousFocus.focus()
    previousFocus = null
  })
}

function clearSelection() {
  selectedAgeStage.value = ''
}

defineExpose({ toggleSidebar, clearSelection })

function selectAgeStage(stageId) {
  selectedAgeStage.value = selectedAgeStage.value === stageId ? '' : stageId
  emit('ageStageChange', selectedAgeStage.value ? [selectedAgeStage.value] : [])
  if (isMobile.value) closeSidebar()
}

function updateViewport() {
  const nextIsMobile = window.innerWidth <= 768
  if (nextIsMobile !== isMobile.value) {
    sidebarOpen.value = !nextIsMobile
    previousFocus = null
  }
  isMobile.value = nextIsMobile
}

onMounted(() => {
  window.addEventListener('resize', updateViewport)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewport)
})
</script>

<style scoped>
.category-nav {
  position: relative;
}

.sidebar {
  width: var(--sidebar-width);
  background:
    radial-gradient(circle at 15% 8%, rgba(103, 200, 185, 0.18), transparent 11rem),
    linear-gradient(180deg, #ffffff 0%, #f8fcfa 100%);
  border-right: 1px solid var(--border-color);
  position: fixed;
  left: 0;
  top: var(--header-height);
  bottom: var(--footer-height);
  z-index: 50;
  overflow-y: auto;
  transition: transform 0.3s ease;
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.85rem 0.75rem 0.45rem;
  padding: 0.75rem 0.8rem;
  background: linear-gradient(135deg, var(--primary-soft), rgba(255, 245, 223, 0.72));
  border: 1px solid rgba(103, 200, 185, 0.22);
  border-radius: var(--radius-lg);
  border-bottom: 1px solid var(--border-color);
}

.sidebar-heading {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.sidebar-toggle {
  display: none;
}

.sidebar-title {
  font-size: 0.92rem;
  font-weight: 750;
  color: var(--primary-dark);
}

.sidebar-caption {
  margin-top: 0.08rem;
  color: var(--text-secondary);
  font-size: 0.68rem;
  line-height: 1.35;
}

.age-stage-section {
  padding: 0.35rem 0.5rem 1rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  padding: 0.55rem 0.65rem;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.age-stage-list {
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  padding: 0 0.15rem;
}

.all-stage-item {
  margin-bottom: 0.2rem;
  background-color: rgba(255, 255, 255, 0.58);
  border-color: var(--border-color);
}

.age-stage-item {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 0.72rem;
  min-height: 52px;
  padding: 0.55rem 0.7rem;
  font: inherit;
  text-align: left;
  background-color: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-base),
    transform var(--transition-fast);
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.age-stage-item > :deep(svg) {
  flex: 0 0 auto;
  box-sizing: content-box;
  padding: 0.5rem;
  color: var(--primary-color);
  background-color: var(--primary-soft);
  border-radius: 0.72rem;
}

.age-stage-item:hover {
  color: var(--text-primary);
  background-color: rgba(255, 255, 255, 0.9);
  border-color: var(--border-color);
  box-shadow: var(--shadow-sm);
  transform: translateX(2px);
}

.age-stage-item.active {
  background: linear-gradient(135deg, var(--primary-soft), #f3fbf8);
  border-color: rgba(47, 158, 143, 0.28);
  color: var(--primary-dark);
  box-shadow: 0 8px 20px rgba(47, 158, 143, 0.11);
}

.age-stage-item.active > :deep(svg) {
  color: white;
  background: linear-gradient(135deg, var(--primary-light), var(--primary-color));
}

.age-stage-item .stage-info {
  flex: 1;
  min-width: 0;
}

.stage-title {
  font-size: 0.82rem;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stage-range {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 0.06rem;
}

.sidebar-overlay {
  display: none;
}

@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
    width: 280px;
    bottom: 0;
    box-shadow: var(--shadow-xl);
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
    top: var(--header-height);
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--overlay-color);
    z-index: 40;
  }
}

@media (max-width: 480px) {
  .sidebar {
    width: min(86vw, 304px);
  }
}
</style>
