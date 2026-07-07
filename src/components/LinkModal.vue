<template>
  <div v-if="visible" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ editLink ? '编辑链接' : '添加链接' }}</h2>
        <button class="btn btn-secondary btn-sm" @click="close">
          <X :size="16" />
        </button>
      </div>
      
      <div class="modal-body">
        <form @submit.prevent="submit">
          <div class="form-group">
            <label class="form-label">标题 *</label>
            <input
              v-model="form.title"
              type="text"
              class="form-input"
              placeholder="输入链接标题"
              required
            />
          </div>
          
          <div class="form-group">
            <label class="form-label">URL *</label>
            <input
              v-model="form.url"
              type="url"
              class="form-input"
              placeholder="https://example.com"
              required
            />
          </div>
          
          <div class="form-group">
            <label class="form-label">描述</label>
            <textarea
              v-model="form.description"
              class="form-textarea"
              placeholder="简要描述该链接的内容"
            ></textarea>
          </div>
          
          <div class="form-group">
            <label class="form-label">分类 *</label>
            <select v-model="form.categoryId" class="form-select" required>
              <option value="">请选择分类</option>
              <optgroup v-for="category in categories" :key="category.id" :label="category.name">
                <option
                  v-for="child in category.children"
                  :key="child.id"
                  :value="child.id"
                >
                  {{ child.name }}
                </option>
              </optgroup>
            </select>
          </div>
          
          <div class="form-group">
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
          
          <div class="form-group">
            <label class="form-label">标签</label>
            <div class="tag-input-container">
              <div class="selected-tags">
                <span
                  v-for="tag in form.tags"
                  :key="tag"
                  class="badge badge-secondary tag-item"
                >
                  {{ tag }}
                  <button type="button" @click="removeTag(tag)">
                    <X :size="12" />
                  </button>
                </span>
              </div>
              <div class="tag-input-wrapper">
                <input
                  v-model="newTag"
                  type="text"
                  class="form-input tag-input"
                  placeholder="输入标签后按回车添加"
                  @keydown.enter.prevent="addTag"
                />
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
import { X } from 'lucide-vue-next'
import { store, generateId, AGE_STAGES } from '@/data/store'

const props = defineProps({
  visible: Boolean,
  editLink: Object
})

const emit = defineEmits(['close', 'save'])

const categories = ref(store.categories)
const ageStages = ref(AGE_STAGES)

const form = ref({
  title: '',
  url: '',
  description: '',
  categoryId: '',
  ageStages: [],
  tags: []
})

const newTag = ref('')

watch(() => props.visible, (val) => {
  if (val) {
    if (props.editLink) {
      form.value = { 
        ...props.editLink, 
        tags: [...props.editLink.tags],
        ageStages: [...(props.editLink.ageStages || [])]
      }
    } else {
      form.value = {
        title: '',
        url: '',
        description: '',
        categoryId: '',
        ageStages: [],
        tags: []
      }
    }
  }
})

function addTag() {
  const tag = newTag.value.trim()
  if (tag && !form.value.tags.includes(tag)) {
    form.value.tags.push(tag)
    newTag.value = ''
  }
}

function removeTag(tag) {
  form.value.tags = form.value.tags.filter(t => t !== tag)
}

function toggleAgeStage(stageId) {
  const index = form.value.ageStages.indexOf(stageId)
  if (index >= 0) {
    form.value.ageStages.splice(index, 1)
  } else {
    form.value.ageStages.push(stageId)
  }
}

function submit() {
  const link = {
    ...form.value,
    id: props.editLink?.id || generateId('l'),
    createdAt: props.editLink?.createdAt || Date.now()
  }
  
  if (props.editLink) {
    store.updateLink(link.id, link)
  } else {
    store.addLink(link)
  }
  
  emit('save', link)
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
}

.tag-input-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.tag-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: default;
}

.tag-item button {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: var(--text-secondary);
}

.tag-input-wrapper {
  flex: 1;
}

.tag-input {
  width: 100%;
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
