<template>
  <div class="app">
    <Header 
      @refresh="refreshData" 
      @menu="toggleSidebar"
      @view-change="handleViewChange"
      @account="openAccountCenter"
      :current-view="currentView"
      :account-state="accountSyncFacade?.accountState"
      :sync-state="accountSyncFacade?.syncState"
      :sync-available="accountSyncFacade?.isSyncAvailable"
      :account-open="showAccountCenter"
    />
    
    <main class="main">
      <div class="main-layout">
        <CategoryNav
          ref="categoryNav"
          @age-stage-change="handleAgeStageChange"
        />
        
        <div class="content-container">
          <Dashboard 
            v-if="currentView === 'dashboard'"
            :selected-age-stages="selectedAgeStages"
            @category-select="handleCategorySelect"
            @view-all-links="handleViewAllLinks"
            @clear-age-stage="handleClearAgeStage"
            @stat-click="handleStatClick"
          />
          
          <template v-else>
            <div class="content-header">
              <div class="content-header-copy">
                <span class="content-eyebrow">家庭成长资源库</span>
                <h1>查找、收藏和整理实用资源</h1>
                <p>可按成长阶段筛选，也可以搜索标题、说明或标签</p>
              </div>
              <SearchBar v-model="searchQuery" />
              <div class="content-actions">
                <button class="btn btn-secondary btn-sm" @click="exportData">
                  <Download :size="16" /> 导出备份
                </button>
                <label class="btn btn-secondary btn-sm import-btn">
                  <Upload :size="16" /> 导入备份
                  <input type="file" accept=".json" @change="importData" />
                </label>
                <button class="btn btn-primary btn-sm" @click="openAddModal">
                  <Plus :size="16" /> 添加资源
                </button>
              </div>
            </div>
            
            <LinkList
              :category="selectedCategory"
              :search-query="searchQuery"
              :filter-mode="filterMode"
              :age-stages="selectedAgeStages"
              @add-link="openAddModal"
              @edit-link="openEditModal"
              @delete-link="handleDeleteLink"
              @filter-change="filterMode = $event"
              @back="handleBack"
            />
          </template>
        </div>
      </div>
    </main>
    
    <LinkModal
      :visible="modalVisible"
      :edit-link="editingLink"
      @close="closeModal"
      @save="handleSaveLink"
    />
    
    <CategoryManager
      :visible="showCategoryManager"
      @close="showCategoryManager = false"
      @refresh="refreshCategories"
      @view-category="handleManagedCategoryView"
    />

    <AccountCenter
      v-if="accountSyncFacade"
      :visible="showAccountCenter"
      :facade="accountSyncFacade"
      :trigger-element="accountTrigger"
      @close="showAccountCenter = false"
      @export-data="exportData"
    />
    
    <footer class="footer">
      <div class="container">
        <p>潘多拉 · 把分散的家庭成长资源整理得更清楚</p>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { inject, ref, onMounted, onUnmounted } from 'vue'
import { Plus, Download, Upload } from 'lucide-vue-next'
import Header from '@/components/Header.vue'
import SearchBar from '@/components/SearchBar.vue'
import CategoryNav from '@/components/CategoryNav.vue'
import LinkList from '@/components/LinkList.vue'
import LinkModal from '@/components/LinkModal.vue'
import CategoryManager from '@/components/CategoryManager.vue'
import Dashboard from '@/components/Dashboard.vue'
import AccountCenter from '@/components/AccountCenter.vue'
import { ACCOUNT_SYNC_FACADE_KEY } from '@/account/accountSyncFacade'
import { store } from '@/data/store'

const searchQuery = ref('')
const selectedCategory = ref(null)
const selectedAgeStages = ref([])
const modalVisible = ref(false)
const editingLink = ref(null)
const showCategoryManager = ref(false)
const categoryNav = ref(null)
const currentView = ref('dashboard')
const filterMode = ref('')
const showAccountCenter = ref(false)
const accountTrigger = ref(null)
const accountSyncFacade = inject(ACCOUNT_SYNC_FACADE_KEY, null)

onMounted(async () => {
  if (accountSyncFacade) {
    await accountSyncFacade.initialize()
  } else {
    await store.init()
  }
})

onUnmounted(() => {
  accountSyncFacade?.destroy()
})

function handleCategoryChange(category) {
  selectedCategory.value = category
  currentView.value = 'links'
}

function handleCategorySelect(category) {
  selectedCategory.value = category
  currentView.value = 'links'
}

function handleManagedCategoryView(category) {
  selectedCategory.value = category
  searchQuery.value = ''
  filterMode.value = ''
  currentView.value = 'links'
  showCategoryManager.value = false
}

function handleViewChange(view) {
  currentView.value = view
  selectedCategory.value = null
  searchQuery.value = ''
  filterMode.value = ''
}

function handleViewAllLinks() {
  handleViewChange('links')
}

function handleAgeStageChange(stages) {
  selectedAgeStages.value = stages
}

function handleClearAgeStage() {
  selectedAgeStages.value = []
  categoryNav.value?.clearSelection()
}

function handleStatClick(payload) {
  switch (payload.type) {
    case 'categories':
      showCategoryManager.value = true
      break
    case 'all':
      selectedCategory.value = null
      searchQuery.value = ''
      filterMode.value = ''
      currentView.value = 'links'
      break
    case 'favorites':
      selectedCategory.value = null
      searchQuery.value = ''
      filterMode.value = 'favorites'
      currentView.value = 'links'
      break
    case 'today':
      selectedCategory.value = null
      searchQuery.value = ''
      filterMode.value = 'today'
      currentView.value = 'links'
      break
  }
}

function handleBack() {
  currentView.value = 'dashboard'
  filterMode.value = ''
  selectedCategory.value = null
  searchQuery.value = ''
}

function toggleSidebar(trigger) {
  categoryNav.value?.toggleSidebar(trigger)
}

function openAccountCenter(trigger) {
  accountTrigger.value = trigger
  showAccountCenter.value = true
}

function openAddModal() {
  editingLink.value = null
  modalVisible.value = true
}

function openEditModal(link) {
  editingLink.value = link
  modalVisible.value = true
}

function closeModal() {
  modalVisible.value = false
  editingLink.value = null
}

function handleSaveLink() {
  closeModal()
}

async function handleDeleteLink(link) {
  if (confirm(`确定删除资源「${link.title}」吗？`)) {
    try {
      await store.deleteLink(link.id)
    } catch {
      alert('资源删除失败，请稍后重试')
    }
  }
}

function refreshData() {
  location.reload()
}

function refreshCategories() {
}

function exportData() {
  const data = {
    ...store.getSnapshot(),
    exportedAt: new Date().toISOString()
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `panduola-backup-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  try {
    a.click()
  } finally {
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

function importData(event) {
  const file = event.target.files[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result)
      if (!confirm('导入备份将覆盖当前资源、分类、孩子档案、生长记录和成长日程，确定继续吗？')) return

      await store.replaceData(data)
      selectedCategory.value = null
      filterMode.value = ''
      searchQuery.value = ''
      alert('备份导入成功')
    } catch {
      alert('导入失败：请确认备份格式正确，且资源网址均为 HTTP(S) 地址')
    }
  }
  reader.onerror = () => alert('文件读取失败，请重新选择')
  reader.readAsText(file)
  event.target.value = ''
}
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  isolation: isolate;
}

.main {
  flex: 1;
  display: flex;
  min-width: 0;
}

.main-layout {
  display: flex;
  width: 100%;
  min-height: calc(100vh - var(--header-height) - var(--footer-height));
}

.content-container {
  flex: 1;
  min-width: 0;
  margin-left: var(--sidebar-width);
  padding: clamp(1rem, 2vw, 1.75rem);
  overflow-y: auto;
}

.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  max-width: var(--content-max-width);
  margin: 0 auto 1.25rem;
  padding: 0.75rem;
  border: 1px solid rgba(220, 235, 230, 0.86);
  border-radius: var(--radius-xl);
  background-color: rgba(255, 255, 255, 0.86);
  box-shadow: var(--shadow-sm);
  flex-wrap: wrap;
}

.content-header-copy {
  flex: 0 1 260px;
  min-width: 220px;
}

.content-eyebrow {
  display: block;
  margin-bottom: 0.15rem;
  color: var(--primary-dark);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.08em;
}

.content-header-copy h1 {
  color: var(--text-primary);
  font-size: clamp(1rem, 1.5vw, 1.2rem);
  font-weight: 800;
  line-height: 1.35;
}

.content-header-copy p {
  margin-top: 0.18rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.45;
}

.content-actions {
  display: flex;
  gap: 0.625rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.import-btn {
  position: relative;
  overflow: hidden;
}

.import-btn input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.import-btn:focus-within {
  outline: 2px solid var(--primary-dark);
  outline-offset: 3px;
}

.footer {
  min-height: var(--footer-height);
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.94), rgba(240, 250, 247, 0.94));
  border-top: 1px solid var(--border-color);
  padding: 0.75rem 0;
  margin-top: auto;
}

.footer p {
  text-align: center;
  font-size: 0.78rem;
  font-weight: 550;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .content-container {
    margin-left: 0;
    padding: 0.75rem;
  }
  
  .content-header {
    flex-direction: column;
    align-items: stretch;
    padding: 0.75rem;
  }

  .content-header-copy {
    flex-basis: auto;
    min-width: 0;
  }
  
  .content-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .content-actions .btn {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .content-actions {
    grid-template-columns: 1fr;
  }

  .footer {
    padding: 0.625rem 0;
  }

  .footer p {
    font-size: 0.72rem;
  }
}
</style>
