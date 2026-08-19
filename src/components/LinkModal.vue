<template>
  <div v-if="visible" class="modal-overlay" @click.self="close" @keydown="handleDialogKeydown">
    <div ref="dialog" class="modal-content" role="dialog" aria-modal="true" aria-labelledby="link-modal-title">
      <div class="modal-header">
        <h2 id="link-modal-title">{{ editLink ? '编辑资源' : '添加资源' }}</h2>
        <button ref="closeButton" class="btn btn-secondary btn-sm" aria-label="关闭资源编辑弹窗" title="关闭" @click="close">
          <X :size="16" />
        </button>
      </div>

      <div class="modal-body">
        <form @submit.prevent="submit">
          <div class="form-group">
            <label class="form-label" for="link-title">标题 *</label>
            <input
              id="link-title"
              v-model="form.title"
              type="text"
              class="form-input"
              placeholder="输入资源名称"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="link-url">网址 *</label>
            <input
              id="link-url"
              v-model="form.url"
              type="url"
              class="form-input"
              placeholder="https://example.com"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="link-description">描述</label>
            <textarea
              id="link-description"
              v-model="form.description"
              class="form-textarea"
              placeholder="简要说明这项资源能解决什么问题"
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label" for="link-category">分类 *</label>
            <select id="link-category" v-model="form.categoryId" class="form-select" required>
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
                  <button type="button" :aria-label="`移除标签 ${tag}`" @click="removeTag(tag)">
                    <X :size="12" />
                  </button>
                </span>
              </div>
              <div class="tag-input-wrapper">
                <input
                  v-model="newTag"
                  type="text"
                  class="form-input tag-input"
                  aria-label="输入新标签"
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
import { computed, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { store, generateId, AGE_STAGES } from '@/data/store'
import { normalizeSafeExternalUrl } from '@/utils/externalLinks'
import { useDialogFocus } from '@/composables/useDialogFocus'

const props = defineProps({
  visible: Boolean,
  editLink: Object
})

const emit = defineEmits(['close', 'save'])

const categories = computed(() => store.categories)
const ageStages = ref(AGE_STAGES)
const dialog = ref(null)
const closeButton = ref(null)

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

const { handleDialogKeydown } = useDialogFocus({
  isVisible: () => props.visible,
  dialogRef: dialog,
  initialFocus: () => document.getElementById('link-title') || closeButton.value,
  onEscape: close
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

async function submit() {
  const safeUrl = normalizeSafeExternalUrl(form.value.url)
  if (!safeUrl) {
    alert('链接仅支持 http:// 或 https:// 地址')
    return
  }

  const link = {
    ...form.value,
    url: safeUrl,
    id: props.editLink?.id || generateId('l'),
    createdAt: props.editLink?.createdAt || Date.now(),
    isDefault: props.editLink?.isDefault || false
  }

  try {
    if (props.editLink) {
      await store.updateLink(link.id, link)
    } else {
      await store.addLink(link)
    }
  } catch {
    alert('保存链接失败，请稍后重试')
    return
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
  background: linear-gradient(135deg, var(--primary-soft), #fffaf1);
  border-bottom: 1px solid var(--border-color);
}

.modal-header h2 {
  font-size: 1.125rem;
  font-weight: 750;
  color: var(--text-primary);
}

.modal-header .btn {
  width: 36px;
  padding: 0;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  padding: 0;
  color: var(--text-secondary);
}

.tag-item button:hover {
  color: var(--danger-dark);
  background-color: #fff1f2;
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
  font: inherit;
  color: var(--text-secondary);
  padding: 0.5rem 0.75rem;
  background-color: var(--surface-soft);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast);
  border: 1px solid var(--border-color);
  text-align: center;
  min-width: 104px;
}

.age-stage-option:hover {
  color: var(--primary-dark);
  background-color: var(--primary-soft);
  transform: translateY(-1px);
}

.age-stage-option.active {
  background-color: var(--primary-soft);
  border-color: var(--primary-color);
  color: var(--primary-dark);
  box-shadow: 0 0 0 2px rgba(40, 127, 116, 0.1);
}

.age-stage-title {
  font-size: 0.75rem;
  font-weight: 650;
}

.age-stage-range {
  font-size: 0.6875rem;
  color: var(--text-muted);
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

@media (max-width: 480px) {
  .modal-body {
    padding: 1rem;
  }

  .age-stage-selector {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .age-stage-option {
    min-width: 0;
  }

  .form-actions .btn {
    flex: 1;
  }
}
</style>
