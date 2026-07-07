<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal-content manager-modal">
      <div class="modal-header">
        <h2>管理分类</h2>
        <button class="btn btn-secondary btn-sm" @click="close">
          <X :size="16" />
        </button>
      </div>
      
      <div class="modal-body manager-body">
        <div class="manager-sidebar">
          <div class="sidebar-title">一级分类</div>
          <div class="category-list">
            <div
              v-for="category in categories"
              :key="category.id"
              class="category-item"
              :class="{ active: selectedCategory?.id === category.id }"
              @click="selectCategory(category)"
            >
              <component :is="getIcon(category.icon)" :style="{ color: category.color }" :size="18" />
              <span>{{ category.name }}</span>
              <div class="category-actions">
                <button class="btn btn-sm" @click.stop="editCategory(category)">
                  <Edit :size="14" />
                </button>
                <button class="btn btn-sm btn-danger" @click.stop="deleteCategory(category)">
                  <Trash2 :size="14" />
                </button>
              </div>
            </div>
          </div>
          <button class="btn btn-primary btn-sm full-width" @click="addPrimaryCategory">
            <Plus :size="16" /> 添加一级分类
          </button>
        </div>
        
        <div class="manager-content">
          <div v-if="selectedCategory" class="subcategory-manager">
            <div class="content-header">
              <div class="content-title">
                <component :is="getIcon(selectedCategory.icon)" :style="{ color: selectedCategory.color }" :size="18" />
                <span>{{ selectedCategory.name }} - 子分类</span>
              </div>
              <button class="btn btn-primary btn-sm" @click="addSubcategory">
                <Plus :size="16" /> 添加子分类
              </button>
            </div>
            
            <div v-if="selectedCategory.children && selectedCategory.children.length" class="subcategory-list">
              <div
                v-for="child in selectedCategory.children"
                :key="child.id"
                class="subcategory-item"
              >
                <div class="subcategory-icon" :style="{ backgroundColor: child.color + '15' }">
                  <component :is="getIcon(child.icon || 'Folder')" :style="{ color: child.color }" :size="16" />
                </div>
                <div class="subcategory-info">
                  <div class="subcategory-name">{{ child.name }}</div>
                  <div class="subcategory-count">{{ getChildLinkCount(child) }} 个链接</div>
                </div>
                <div class="subcategory-actions">
                  <button class="btn btn-sm" @click="editSubcategory(child)">
                    <Edit :size="14" />
                  </button>
                  <button class="btn btn-sm btn-danger" @click="deleteSubcategory(child)">
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>
            </div>
            
            <div v-else class="empty-subcategory">
              <FolderOpen :size="48" class="text-gray-300" />
              <p>暂无子分类</p>
              <button class="btn btn-primary" @click="addSubcategory">添加第一个子分类</button>
            </div>
          </div>
          
          <div v-else class="manager-welcome">
            <div class="welcome-icon">
              <Layers :size="48" />
            </div>
            <h3>选择分类进行管理</h3>
            <p>点击左侧分类，管理其子分类</p>
          </div>
        </div>
      </div>
    </div>
    
    <CategoryModal
      :visible="categoryModalVisible"
      :editing-category="editingCategory"
      :parent-id="editingCategory?.parentId || selectedCategory?.id"
      @close="categoryModalVisible = false"
      @save="handleCategorySave"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { X, Plus, Edit, Trash2, Folder, FolderOpen, Layers,
  Baby, Heart, Home, BookOpen, Wrench, Utensils, Moon, TrendingUp,
  GraduationCap, Syringe, Stethoscope, Activity, ShoppingBag, Building,
  Users, BookMarked, Headphones, Ruler, Calendar, Calculator, Sparkles, Star, Music } from 'lucide-vue-next'
import { store, generateId } from '@/data/store'
import CategoryModal from './CategoryModal.vue'

defineProps({
  visible: Boolean
})

const emit = defineEmits(['close', 'refresh'])

const categories = ref(store.categories)
const selectedCategory = ref(null)
const categoryModalVisible = ref(false)
const editingCategory = ref(null)

const iconMap = {
  Baby, Heart, Home, BookOpen, Wrench, Utensils, Moon, TrendingUp,
  GraduationCap, Syringe, Stethoscope, Activity, ShoppingBag, Building,
  Users, BookMarked, Headphones, Ruler, Calendar, Calculator, Folder, Sparkles, Star, Music
}

function getIcon(iconName) {
  return iconMap[iconName] || Folder
}

function selectCategory(category) {
  selectedCategory.value = category
}

function addPrimaryCategory() {
  editingCategory.value = null
  categoryModalVisible.value = true
}

function addSubcategory() {
  editingCategory.value = null
  categoryModalVisible.value = true
}

function editCategory(category) {
  editingCategory.value = category
  categoryModalVisible.value = true
}

function editSubcategory(child) {
  editingCategory.value = child
  categoryModalVisible.value = true
}

function deleteCategory(category) {
  if (confirm(`确定删除分类「${category.name}」及其所有子分类和链接吗？`)) {
    store.deleteCategory(category.id)
    categories.value = store.categories
    selectedCategory.value = null
    emit('refresh')
  }
}

function deleteSubcategory(child) {
  if (confirm(`确定删除子分类「${child.name}」及其所有链接吗？`)) {
    if (selectedCategory.value && selectedCategory.value.children) {
      selectedCategory.value.children = selectedCategory.value.children.filter(c => c.id !== child.id)
    }
    store.links = store.links.filter(l => l.categoryId !== child.id)
    emit('refresh')
  }
}

function handleCategorySave(category) {
  if (category.parentId) {
    const parent = store.categories.find(c => c.id === category.parentId)
    if (parent) {
      if (!parent.children) parent.children = []
      const index = parent.children.findIndex(c => c.id === category.id)
      if (index >= 0) {
        parent.children[index] = category
      } else {
        parent.children.push(category)
      }
    }
  } else {
    const index = store.categories.findIndex(c => c.id === category.id)
    if (index >= 0) {
      store.categories[index] = category
    } else {
      store.categories.push(category)
    }
  }
  categories.value = store.categories
  emit('refresh')
}

function getChildLinkCount(child) {
  return store.getLinksByCategory(child.id).length
}

function close() {
  emit('close')
}
</script>

<style scoped>
.manager-modal {
  max-width: 800px;
  max-height: 80vh;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
  font-size: 1.125rem;
  font-weight: 600;
}

.manager-body {
  display: flex;
  gap: 1rem;
  padding: 0;
}

.manager-sidebar {
  width: 250px;
  border-right: 1px solid var(--border-color);
  padding: 1rem;
  overflow-y: auto;
}

.sidebar-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 1rem;
}

.category-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
}

.category-item:hover {
  background-color: var(--bg-color);
}

.category-item.active {
  background-color: rgba(99, 102, 241, 0.1);
  color: var(--primary-color);
}

.category-actions {
  margin-left: auto;
  display: flex;
  gap: 0.25rem;
}

.category-actions .btn {
  opacity: 0;
  transition: opacity 0.2s ease;
}

.category-item:hover .category-actions .btn {
  opacity: 1;
}

.full-width {
  width: 100%;
}

.manager-content {
  flex: 1;
  padding: 1rem;
  overflow-y: auto;
}

.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.content-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
}

.subcategory-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.subcategory-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background-color: var(--bg-color);
  border-radius: var(--radius-md);
}

.subcategory-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.subcategory-info {
  flex: 1;
}

.subcategory-name {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
}

.subcategory-count {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.subcategory-actions {
  display: flex;
  gap: 0.25rem;
}

.empty-subcategory {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.empty-subcategory button {
  margin-top: 1rem;
}

.manager-welcome {
  text-align: center;
  padding: 3rem 1rem;
}

.welcome-icon {
  width: 80px;
  height: 80px;
  background-color: var(--bg-color);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;
  color: var(--text-secondary);
}

.manager-welcome h3 {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.manager-welcome p {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

@media (max-width: 640px) {
  .manager-body {
    flex-direction: column;
  }
  
  .manager-sidebar {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }
}
</style>
