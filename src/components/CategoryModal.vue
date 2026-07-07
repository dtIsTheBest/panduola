<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ editingCategory ? '编辑分类' : '新增分类' }}</h2>
        <button class="btn btn-secondary btn-sm" @click="close">
          <X :size="16" />
        </button>
      </div>
      
      <div class="modal-body">
        <form @submit.prevent="submit">
          <div class="form-group">
            <label class="form-label">分类名称 *</label>
            <input
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
              <div
                v-for="(icon, name) in iconMap"
                :key="name"
                class="icon-option"
                :class="{ active: form.icon === name }"
                @click="form.icon = name"
              >
                <component :is="icon" :size="24" />
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">颜色 *</label>
            <div class="color-selector">
              <div
                v-for="color in colors"
                :key="color"
                class="color-option"
                :class="{ active: form.color === color }"
                :style="{ backgroundColor: color }"
                @click="form.color = color"
              >
                <Check v-if="form.color === color" :size="14" />
              </div>
            </div>
          </div>
          
          <div v-if="parentId" class="form-group">
            <label class="form-label">适用年龄阶段（多选）</label>
            <div class="age-stage-selector">
              <div
                v-for="stage in ageStages"
                :key="stage.id"
                class="age-stage-option"
                :class="{ active: form.ageStages.includes(stage.id) }"
                @click="toggleAgeStage(stage.id)"
              >
                <div class="age-stage-title">{{ stage.title }}</div>
                <div class="age-stage-range">{{ stage.ageRange }}</div>
              </div>
            </div>
          </div>
          
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" @click="close">取消</button>
            <button type="submit" class="btn btn-primary">保存</button>
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
import { store, generateId, AGE_STAGES } from '@/data/store'

const props = defineProps({
  visible: Boolean,
  editingCategory: Object,
  parentId: String
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

const form = ref({
  name: '',
  icon: 'Folder',
  color: '#6366f1',
  ageStages: []
})

watch(() => props.visible, (val) => {
  if (val) {
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
  }
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
  const category = {
    ...form.value,
    id: props.editingCategory?.id || generateId('c'),
    parentId: props.parentId || undefined,
    children: props.editingCategory?.children || []
  }
  
  emit('save', category)
  close()
}

function close() {
  emit('close')
}
</script>

<style scoped>
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

.modal-body {
  padding: 1.25rem;
  max-height: 70vh;
  overflow-y: auto;
}

.icon-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.icon-option {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
  color: var(--text-secondary);
}

.icon-option:hover {
  background-color: var(--bg-color);
}

.icon-option.active {
  background-color: rgba(99, 102, 241, 0.1);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.color-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.color-option {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid transparent;
  color: white;
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.active {
  border-color: var(--text-primary);
}

.age-stage-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.age-stage-option {
  padding: 0.5rem 0.75rem;
  background-color: var(--bg-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
  text-align: center;
  min-width: 100px;
}

.age-stage-option:hover {
  background-color: var(--border-color);
}

.age-stage-option.active {
  background-color: rgba(99, 102, 241, 0.1);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.age-stage-title {
  font-size: 0.75rem;
  font-weight: 500;
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
}
</style>
