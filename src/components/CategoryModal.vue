<template>
  <div v-if="visible" class="modal-overlay" @click.self="close" @keydown.stop="handleDialogKeydown">
    <div ref="dialog" class="modal-content" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
      <div class="modal-header">
        <h2 id="category-modal-title">{{ editingCategory ? '编辑分类' : '新增分类' }}</h2>
        <button ref="closeButton" class="btn btn-secondary btn-sm" aria-label="关闭分类编辑弹窗" title="关闭" @click="close">
          <X :size="16" />
        </button>
      </div>

      <div class="modal-body">
        <form @submit.prevent="submit">
          <div class="form-group">
            <label class="form-label" for="category-name">分类名称 *</label>
            <input
              id="category-name"
              v-model="form.name"
              type="text"
              class="form-input"
              placeholder="输入分类名称"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label">图标 *</label>
            <div class="icon-selector">
              <button
                v-for="(icon, name) in iconMap"
                :key="name"
                type="button"
                class="icon-option"
                :class="{ active: form.icon === name }"
                :aria-label="`选择 ${name} 图标`"
                :aria-pressed="form.icon === name"
                @click="form.icon = name"
              >
                <component :is="icon" :size="24" />
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">颜色 *</label>
            <div class="color-selector">
              <button
                v-for="color in colors"
                :key="color"
                type="button"
                class="color-option"
                :class="{ active: form.color === color }"
                :style="{ backgroundColor: color }"
                :aria-label="`选择颜色 ${color}`"
                :aria-pressed="form.color === color"
                @click="form.color = color"
              >
                <Check v-if="form.color === color" :size="14" />
              </button>
            </div>
          </div>

          <div v-if="parentId" class="form-group">
            <label class="form-label">适用成长阶段（可多选）</label>
            <div class="age-stage-selector">
              <button
                v-for="stage in ageStages"
                :key="stage.id"
                type="button"
                class="age-stage-option"
                :class="{ active: form.ageStages.includes(stage.id) }"
                :aria-pressed="form.ageStages.includes(stage.id)"
                @click="toggleAgeStage(stage.id)"
              >
                <div class="age-stage-title">{{ stage.title }}</div>
                <div class="age-stage-range">{{ stage.ageRange }}</div>
              </button>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn btn-secondary" :disabled="saving" @click="close">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              {{ saving ? '保存中…' : '保存' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { X, Check, Baby, Heart, Home, BookOpen, Wrench, Utensils, Moon, TrendingUp,
  GraduationCap, Syringe, Stethoscope, Activity, ShoppingBag, Building, Users,
  BookMarked, Headphones, Ruler, Calendar, Calculator, Folder, Sparkles, Star, Music } from 'lucide-vue-next'
import { generateId, AGE_STAGES } from '@/data/store'
import { useDialogFocus } from '@/composables/useDialogFocus'

const props = defineProps({
  visible: Boolean,
  editingCategory: Object,
  parentId: String,
  saving: Boolean
})

const emit = defineEmits(['close', 'save'])

const iconMap = {
  Baby, Heart, Home, BookOpen, Wrench, Utensils, Moon, TrendingUp,
  GraduationCap, Syringe, Stethoscope, Activity, ShoppingBag, Building,
  Users, BookMarked, Headphones, Ruler, Calendar, Calculator, Folder, Sparkles, Star, Music
}

const colors = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316', '#f59e0b',
  '#84cc16', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
  '#64748b', '#94a3b8', '#d946ef', '#f43f5e', '#22d3ee', '#10b981'
]

const ageStages = ref(AGE_STAGES)
const dialog = ref(null)
const closeButton = ref(null)

const form = ref({
  name: '',
  icon: 'Folder',
  color: '#6366f1',
  ageStages: []
})

watch(() => props.visible, (val) => {
  if (!val) return

  if (props.editingCategory) {
    form.value = {
      ...props.editingCategory,
      ageStages: [...(props.editingCategory.ageStages || [])]
    }
  } else {
    form.value = {
      name: '',
      icon: 'Folder',
      color: '#6366f1',
      ageStages: []
    }
  }
})

const { handleDialogKeydown } = useDialogFocus({
  isVisible: () => props.visible,
  dialogRef: dialog,
  initialFocus: () => document.getElementById('category-name') || closeButton.value,
  onEscape: close
})

function toggleAgeStage(stageId) {
  const index = form.value.ageStages.indexOf(stageId)
  if (index >= 0) {
    form.value.ageStages.splice(index, 1)
  } else {
    form.value.ageStages.push(stageId)
  }
}

function submit() {
  if (props.saving) return
  const category = {
    ...form.value,
    id: props.editingCategory?.id || generateId('c'),
    parentId: props.parentId || undefined,
    children: props.editingCategory?.children || []
  }

  emit('save', category)
}

function close() {
  if (props.saving) return
  emit('close')
}
</script>

<style scoped>
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 70px;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
  background:
    radial-gradient(circle at 93% 8%, rgba(255, 173, 126, 0.22), transparent 11rem),
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

.modal-body {
  padding: 1.4rem 1.5rem 1.5rem;
  max-height: calc(100vh - 7rem);
  overflow-y: auto;
}

.icon-selector {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
  gap: 0.55rem;
  padding: 0.8rem;
  background-color: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.icon-option {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  justify-self: center;
  padding: 0;
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.icon-option:hover {
  background-color: var(--primary-soft);
  color: var(--primary-dark);
  transform: translateY(-1px);
}

.icon-option.active {
  background-color: var(--primary-soft);
  border-color: var(--primary-color);
  color: var(--primary-dark);
  box-shadow: 0 0 0 2px rgba(40, 127, 116, 0.14);
}

.color-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  padding: 0.85rem;
  background-color: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.color-option {
  width: 38px;
  height: 38px;
  padding: 0;
  border-radius: 50%;
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid var(--card-bg);
  color: white;
  box-shadow: 0 0 0 1px var(--border-color);
}

.color-option:hover {
  transform: translateY(-1px) scale(1.05);
}

.color-option.active {
  border-color: var(--card-bg);
  box-shadow:
    0 0 0 2px var(--primary-dark),
    var(--shadow-sm);
}

.age-stage-selector {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
}

.age-stage-option {
  min-height: 58px;
  padding: 0.55rem 0.7rem;
  background-color: var(--surface-soft);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast);
  border: 1px solid var(--border-color);
  text-align: center;
  color: var(--text-secondary);
}

.age-stage-option:hover {
  background-color: var(--primary-soft);
  border-color: rgba(40, 127, 116, 0.28);
  transform: translateY(-1px);
}

.age-stage-option.active {
  background-color: var(--primary-soft);
  border-color: var(--primary-color);
  color: var(--primary-dark);
  box-shadow: 0 4px 12px rgba(40, 127, 116, 0.1);
}

.age-stage-title {
  font-size: 0.75rem;
  font-weight: 700;
}

.age-stage-range {
  font-size: 0.6875rem;
  opacity: 0.7;
  margin-top: 0.125rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

@media (max-width: 540px) {
  .modal-header {
    min-height: 64px;
    padding: 0.85rem 1rem;
  }

  .modal-body {
    padding: 1.15rem 1rem 1rem;
  }

  .icon-selector {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    padding: 0.65rem;
  }

  .icon-option {
    width: 38px;
    height: 38px;
  }

  .age-stage-selector {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .form-actions .btn {
    flex: 1;
  }
}
</style>
