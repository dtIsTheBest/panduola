<template>
  <div class="app">
    <Header 
      @refresh="refreshData" 
      @menu="toggleSidebar"
      @view-change="currentView = $event"
      :current-view="currentView"
    />
    
    <main class="main">
      <div class="main-layout">
        <CategoryNav
          :class="{ open: sidebarOpen }"
          @category-change="handleCategoryChange"
          @age-stage-change="handleAgeStageChange"
          @manage-categories="showCategoryManager = true"
        />
        
        <div class="content-container">
          <Dashboard 
            v-if="currentView === 'dashboard'"
            @category-select="handleCategorySelect"
            @view-all-links="currentView = 'links'"
          />
          
          <template v-else>
            <div class="content-header">
              <SearchBar v-model="searchQuery" />
              <div class="content-actions">
                <button class="btn btn-secondary btn-sm" @click="exportData">
                  <Download :size="16" /> 导出数据
                </button>
                <label class="btn btn-secondary btn-sm import-btn">
                  <Upload :size="16" /> 导入数据
                  <input type="file" accept=".json" @change="importData" />
                </label>
                <button class="btn btn-primary btn-sm" @click="openAddModal">
                  <Plus :size="16" /> 添加链接
                </button>
              </div>
            </div>
            
            <LinkList
              :category="selectedCategory"
              :search-query="searchQuery"
              :age-stages="selectedAgeStages"
              @add-link="openAddModal"
              @edit-link="openEditModal"
              @delete-link="handleDeleteLink"
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
    />
    
    <footer class="footer">
      <div class="container">
        <p>潘多拉 - 带娃百科导航 · 让育儿更轻松</p>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Plus, Download, Upload } from 'lucide-vue-next'
import Header from '@/components/Header.vue'
import SearchBar from '@/components/SearchBar.vue'
import CategoryNav from '@/components/CategoryNav.vue'
import LinkList from '@/components/LinkList.vue'
import LinkModal from '@/components/LinkModal.vue'
import CategoryManager from '@/components/CategoryManager.vue'
import Dashboard from '@/components/Dashboard.vue'
import { store } from '@/data/store'

const searchQuery = ref('')
const selectedCategory = ref(null)
const selectedAgeStages = ref([])
const modalVisible = ref(false)
const editingLink = ref(null)
const showCategoryManager = ref(false)
const sidebarOpen = ref(true)
const currentView = ref('dashboard')

onMounted(async () => {
  await store.init()
})

function handleCategoryChange(category) {
  selectedCategory.value = category
  currentView.value = 'links'
}

function handleCategorySelect(category) {
  selectedCategory.value = category
  currentView.value = 'links'
}

function handleAgeStageChange(stages) {
  selectedAgeStages.value = stages
}

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
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

function handleDeleteLink(link) {
  if (confirm(`确定删除链接「${link.title}」吗？`)) {
    store.deleteLink(link.id)
  }
}

function refreshData() {
  location.reload()
}

function refreshCategories() {
}

function exportData() {
  const data = {
    categories: store.categories,
    links: store.links,
    exportedAt: new Date().toISOString()
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `panduola-backup-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function importData(event) {
  const file = event.target.files[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result)
      if (data.categories && data.links) {
        if (confirm('导入数据将覆盖当前所有数据，确定继续吗？')) {
          store.categories = data.categories
          store.links = data.links
          location.reload()
        }
      } else {
        alert('无效的数据文件格式')
      }
    } catch (error) {
      alert('数据文件解析失败')
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}
</script>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.main {
  flex: 1;
  display: flex;
}

.main-layout {
  display: flex;
  width: 100%;
  min-height: calc(100vh - 120px);
}

.content-container {
  flex: 1;
  margin-left: 240px;
  padding: 1rem;
  overflow-y: auto;
}

.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.content-actions {
  display: flex;
  gap: 0.5rem;
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

.footer {
  background-color: var(--card-bg);
  border-top: 1px solid var(--border-color);
  padding: 1rem 0;
  margin-top: auto;
}

.footer p {
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

@media (max-width: 768px) {
  .content-container {
    margin-left: 0;
    padding: 0.5rem;
  }
  
  .content-header {
    flex-direction: column;
    align-items: stretch;
  }
  
  .content-actions {
    justify-content: center;
  }
}
</style>