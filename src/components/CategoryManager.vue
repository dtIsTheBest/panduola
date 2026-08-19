<template>
  <div v-if="visible" class="modal-overlay" @click.self="close" @keydown="handleDialogKeydown">
    <div ref="dialog" class="modal-content manager-modal" role="dialog" aria-modal="true" aria-labelledby="category-manager-title">
      <div class="modal-header">
        <h2 id="category-manager-title">管理分类</h2>
        <button ref="closeButton" class="btn btn-secondary btn-sm" aria-label="关闭分类管理弹窗" title="关闭" @click="close">
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
            >
              <button
                type="button"
                class="category-select-button"
                :aria-pressed="selectedCategory?.id === category.id"
                @click="selectCategory(category)"
              >
                <component :is="getIcon(category.icon)" :style="{ color: category.color }" :size="18" />
                <span>{{ category.name }}</span>
              </button>
              <div class="category-actions">
                <button class="btn btn-sm" :aria-label="`编辑分类 ${category.name}`" title="编辑" @click.stop="editCategory(category)">
                  <Edit :size="14" />
                </button>
                <button class="btn btn-sm btn-danger" :aria-label="`删除分类 ${category.name}`" title="删除" @click.stop="deleteCategory(category)">
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
                <button
                  type="button"
                  class="subcategory-view"
                  :aria-label="`查看${child.name}分类的${getChildLinkCount(child)}条资源`"
                  @click="viewCategory(child)"
                  @keydown.enter.prevent="viewCategory(child)"
                  @keydown.space.prevent="viewCategory(child)"
                >
                  <span class="subcategory-icon" :style="{ backgroundColor: child.color + '15' }">
                    <component :is="getIcon(child.icon || 'Folder')" :style="{ color: child.color }" :size="16" />
                  </span>
                  <span class="subcategory-info">
                    <span class="subcategory-name">{{ child.name }}</span>
                    <span class="subcategory-count">{{ getChildLinkCount(child) }} 条资源</span>
                  </span>
                  <span class="subcategory-view-label">查看资源</span>
                  <ChevronRight :size="17" class="subcategory-arrow" />
                </button>
                <div class="subcategory-actions">
                  <button class="btn btn-sm" :aria-label="`编辑子分类 ${child.name}`" title="编辑" @click="editSubcategory(child)">
                    <Edit :size="14" />
                  </button>
                  <button class="btn btn-sm btn-danger" :aria-label="`删除子分类 ${child.name}`" title="删除" @click="deleteSubcategory(child)">
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
      :parent-id="categoryParentId || undefined"
      :saving="categorySaving"
      @close="closeCategoryModal"
      @save="handleCategorySave"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { X, Plus, Edit, Trash2, Folder, FolderOpen, Layers, ChevronRight,
  Baby, Heart, Home, BookOpen, Wrench, Utensils, Moon, TrendingUp,
  GraduationCap, Syringe, Stethoscope, Activity, ShoppingBag, Building,
  Users, BookMarked, Headphones, Ruler, Calendar, Calculator, Sparkles, Star, Music } from 'lucide-vue-next'
import { store } from '@/data/store'
import { useCategoryLinkCounts } from '@/composables/useCategoryLinkCounts'
import { useDialogFocus } from '@/composables/useDialogFocus'
import CategoryModal from './CategoryModal.vue'

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['close', 'refresh', 'view-category'])

const categories = computed(() => store.categories)
const selectedCategory = ref(null)
const categoryModalVisible = ref(false)
const editingCategory = ref(null)
const categoryParentId = ref(null)
const categorySaving = ref(false)
const dialog = ref(null)
const closeButton = ref(null)
const { getCategoryLinkCount } = useCategoryLinkCounts()

const iconMap = {
  Baby, Heart, Home, BookOpen, Wrench, Utensils, Moon, TrendingUp,
  GraduationCap, Syringe, Stethoscope, Activity, ShoppingBag, Building,
  Users, BookMarked, Headphones, Ruler, Calendar, Calculator, Folder, Sparkles, Star, Music
}

const { handleDialogKeydown } = useDialogFocus({
  isVisible: () => props.visible,
  dialogRef: dialog,
  initialFocus: () => closeButton.value,
  onEscape: close,
  isFocusTrapPaused: () => categoryModalVisible.value
})

function getIcon(iconName) {
  return iconMap[iconName] || Folder
}

function selectCategory(category) {
  selectedCategory.value = category
}

function addPrimaryCategory() {
  editingCategory.value = null
  categoryParentId.value = null
  categoryModalVisible.value = true
}

function addSubcategory() {
  editingCategory.value = null
  categoryParentId.value = selectedCategory.value?.id || null
  categoryModalVisible.value = true
}

function editCategory(category) {
  editingCategory.value = category
  categoryParentId.value = null
  categoryModalVisible.value = true
}

function editSubcategory(child) {
  editingCategory.value = child
  categoryParentId.value = child.parentId || selectedCategory.value?.id || null
  categoryModalVisible.value = true
}

async function deleteCategory(category) {
  if (confirm(`确定删除分类「${category.name}」及其所有子分类和链接吗？`)) {
    try {
      await store.deleteCategory(category.id)
      selectedCategory.value = null
      emit('refresh')
    } catch {
      alert('删除分类失败，请稍后重试')
    }
  }
}

async function deleteSubcategory(child) {
  if (confirm(`确定删除子分类「${child.name}」及其所有链接吗？`)) {
    try {
      const parentId = selectedCategory.value?.id
      if (!parentId) return
      await store.deleteSubcategory(parentId, child.id)
      selectedCategory.value = store.getCategoryById(parentId)
      emit('refresh')
    } catch {
      alert('删除子分类失败，请稍后重试')
    }
  }
}

async function handleCategorySave(category) {
  categorySaving.value = true
  let saved = false
  try {
    await store.upsertCategory(category)
    const selectedId = category.parentId || category.id
    selectedCategory.value = store.getCategoryById(selectedId)
    saved = true
    emit('refresh')
  } catch {
    alert('保存分类失败，请稍后重试')
  } finally {
    categorySaving.value = false
  }
  if (saved) closeCategoryModal()
}

function closeCategoryModal() {
  if (categorySaving.value) return
  categoryModalVisible.value = false
  editingCategory.value = null
  categoryParentId.value = null
}

function getChildLinkCount(child) {
  return getCategoryLinkCount(child.id)
}

function viewCategory(child) {
  emit('view-category', child)
}

function close() {
  emit('close')
}
</script>

<style scoped>
.manager-modal {
  width: min(100%, 860px);
  max-width: 860px;
  max-height: calc(100vh - 2rem);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 72px;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background:
    radial-gradient(circle at 94% 10%, rgba(255, 173, 126, 0.22), transparent 12rem),
    linear-gradient(135deg, var(--primary-soft), var(--surface-soft));
}

.modal-header h2 {
  font-size: 1.2rem;
  font-weight: 750;
  color: var(--text-primary);
}

.modal-header .btn {
  width: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: 50%;
}

.manager-body {
  display: flex;
  min-height: 460px;
  max-height: calc(100vh - 6.5rem);
  gap: 0;
  padding: 0;
  overflow: hidden;
}

.manager-sidebar {
  width: 270px;
  flex: 0 0 270px;
  border-right: 1px solid var(--border-color);
  padding: 1.15rem;
  background: linear-gradient(180deg, var(--surface-soft), var(--surface-muted));
  overflow-y: auto;
}

.sidebar-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 0.8rem;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 1rem;
}

.category-item {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0.35rem 0.45rem 0.35rem 0.2rem;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-primary);
  transition:
    color var(--transition-fast),
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.category-select-button {
  display: flex;
  align-items: center;
  align-self: stretch;
  flex: 1;
  min-width: 0;
  min-height: 36px;
  gap: 0.55rem;
  padding: 0 0.35rem;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.category-select-button span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-item:hover {
  background-color: rgba(255, 255, 255, 0.82);
  border-color: var(--border-color);
}

.category-item.active {
  background-color: var(--card-bg);
  border-color: rgba(40, 127, 116, 0.3);
  color: var(--primary-dark);
  box-shadow: var(--shadow-sm);
}

.category-actions {
  margin-left: auto;
  display: flex;
  gap: 0.25rem;
}

.category-actions .btn {
  width: 32px;
  min-height: 32px;
  padding: 0;
  opacity: 0.38;
  transition:
    opacity var(--transition-fast),
    background-color var(--transition-fast);
}

.category-actions .btn:not(.btn-danger) {
  background-color: rgba(255, 255, 255, 0.72);
}

.category-item:hover .category-actions .btn,
.category-item:focus-within .category-actions .btn {
  opacity: 1;
}

.full-width {
  width: 100%;
}

.manager-content {
  flex: 1;
  min-width: 0;
  padding: 1.35rem;
  background-color: var(--card-bg);
  overflow-y: auto;
}

.content-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.15rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid var(--border-color);
}

.content-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
}

.subcategory-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.subcategory-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 64px;
  padding: 0.75rem 0.85rem;
  background: linear-gradient(135deg, var(--surface-soft), #ffffff);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast);
}

.subcategory-item:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.subcategory-view {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  min-height: 48px;
  gap: 0.75rem;
  padding: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.subcategory-icon {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.subcategory-info {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.subcategory-name {
  display: block;
  font-size: 0.875rem;
  font-weight: 650;
  color: var(--text-primary);
}

.subcategory-count {
  display: block;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.subcategory-view-label {
  flex: 0 0 auto;
  color: var(--primary-dark);
  font-size: 0.72rem;
  font-weight: 700;
}

.subcategory-arrow {
  flex: 0 0 auto;
  color: var(--text-muted);
  transition: transform var(--transition-fast), color var(--transition-fast);
}

.subcategory-view:hover .subcategory-arrow,
.subcategory-view:focus-visible .subcategory-arrow {
  color: var(--primary-dark);
  transform: translateX(2px);
}

.subcategory-actions {
  display: flex;
  gap: 0.25rem;
}

.subcategory-actions .btn {
  width: 34px;
  min-height: 34px;
  padding: 0;
}

.empty-subcategory {
  text-align: center;
  padding: 3rem 1rem;
  color: var(--text-secondary);
}

.empty-subcategory button {
  margin-top: 1rem;
}

.manager-welcome {
  text-align: center;
  padding: 4rem 1rem;
}

.welcome-icon {
  width: 84px;
  height: 84px;
  background: linear-gradient(135deg, var(--primary-soft), var(--accent-light));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;
  color: var(--primary-dark);
  box-shadow: var(--shadow-sm);
}

.manager-welcome h3 {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.manager-welcome p {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

@media (hover: none) {
  .category-actions .btn {
    opacity: 1;
  }
}

@media (max-width: 640px) {
  .manager-modal {
    width: 100%;
    max-height: calc(100vh - 1rem);
  }

  .modal-header {
    min-height: 64px;
    padding: 0.85rem 1rem;
  }

  .manager-body {
    flex-direction: column;
    min-height: 0;
    max-height: calc(100vh - 5rem);
    overflow-y: auto;
  }

  .manager-sidebar {
    width: 100%;
    flex: none;
    max-height: 42vh;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
    padding: 1rem;
    overflow-y: auto;
  }

  .manager-content {
    flex: none;
    padding: 1rem;
    overflow: visible;
  }

  .content-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .content-header .btn {
    width: 100%;
  }

  .category-actions .btn {
    opacity: 1;
  }

  .subcategory-item {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .subcategory-view {
    width: 100%;
  }

  .subcategory-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
