<template>
  <div v-if="visible" class="modal-overlay" @click.self="close" @keydown="handleDialogKeydown">
    <section ref="dialog" class="note-editor" role="dialog" aria-modal="true" aria-labelledby="note-editor-title">
      <header class="editor-header">
        <div>
          <span>私密育儿手记</span>
          <h2 id="note-editor-title">{{ note ? '编辑手记' : '写一篇手记' }}</h2>
        </div>
        <button ref="closeButton" type="button" class="icon-button" aria-label="关闭手记编辑器" :disabled="saving" @click="close">
          <X :size="18" />
        </button>
      </header>

      <form class="editor-body" @submit.prevent="save">
        <label class="field-group">
          <span>标题</span>
          <input
            ref="titleInput"
            :value="title"
            class="form-input"
            required
            placeholder="例如：第一次自主进食后的经验"
            :disabled="saving"
            @input="updateTitle"
          />
          <small>{{ characterCount(title) }}/80</small>
        </label>

        <label class="field-group">
          <span class="field-heading">
            <span>正文</span>
            <button type="button" class="link-helper" :disabled="saving" @click="insertLinkTemplate">
              <Link2 :size="14" />插入链接格式
            </button>
          </span>
          <textarea
            ref="contentInput"
            :value="content"
            class="form-textarea note-content-input"
            required
            placeholder="记录发生了什么、哪些方法有效，以及下次想怎样调整。可直接粘贴 https:// 链接。"
            :disabled="saving"
            @input="updateContent"
          ></textarea>
          <small>{{ characterCount(content) }}/5000 · 支持 [文字](https://网址) 和直接粘贴链接</small>
        </label>

        <div class="field-group">
          <span>图片（可选，最多 4 张）</span>
          <div v-if="imageItems.length" class="editor-images">
            <figure v-for="image in imageItems" :key="image.key">
              <img :src="image.previewUrl" alt="手记图片预览" />
              <button
                type="button"
                aria-label="移除图片"
                :disabled="saving"
                @click="removeImage(image.key)"
              ><X :size="14" /></button>
            </figure>
          </div>
          <input
            ref="fileInput"
            class="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            :disabled="saving || processing || imageSlotCount >= 4"
            @change="selectImages"
          />
          <button
            type="button"
            class="image-picker"
            :disabled="saving || processing || imageSlotCount >= 4"
            @click="fileInput?.click()"
          >
            <ImagePlus :size="18" />
            {{ processing ? '正在处理图片…' : imageSlotCount >= 4 ? '已占满 4 个图片位置' : '添加图片' }}
          </button>
          <small v-if="pendingImageCount > 0" class="pending-hint">
            {{ pendingImageCount }} 张图片正在确认上传结果，确认完成前暂占图片位置。
          </small>
          <small>自动压缩为 WebP，并移除照片中的定位信息。</small>
        </div>

        <p v-if="errorMessage" class="editor-error" role="alert">{{ errorMessage }}</p>

        <footer class="editor-actions">
          <button type="button" class="btn btn-secondary" :disabled="saving" @click="close">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="saving || processing || !canSave">
            <Save :size="16" />{{ saving ? '保存中…' : '保存手记' }}
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { ImagePlus, Link2, Save, X } from 'lucide-vue-next'
import { processPhoto } from '@/community/photoProcessor'
import { useDialogFocus } from '@/composables/useDialogFocus'

const props = defineProps({
  visible: Boolean,
  note: {
    type: Object,
    default: null
  },
  repository: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'saved'])
const title = ref('')
const content = ref('')
const existingImages = ref([])
const pendingImages = ref([])
const saving = ref(false)
const processing = ref(false)
const errorMessage = ref('')
const fileInput = ref(null)
const dialog = ref(null)
const closeButton = ref(null)
const titleInput = ref(null)
const contentInput = ref(null)
const draftId = ref('')
let editorGeneration = 0

const imageItems = computed(() => [
  ...existingImages.value.map(image => ({
    key: `existing-${image.id}`,
    id: image.id,
    previewUrl: image.signedUrl,
    pending: false
  })),
  ...pendingImages.value.map(image => ({
    key: image.key,
    previewUrl: image.previewUrl,
    pending: true
  }))
])
const pendingImageCount = computed(() => props.note?.pendingImageCount ?? 0)
const imageSlotCount = computed(() => imageItems.value.length + pendingImageCount.value)
const canSave = computed(() => title.value.trim() && content.value.trim())

watch(() => props.visible, visible => {
  editorGeneration += 1
  if (!visible) {
    processing.value = false
    saving.value = false
    releasePendingImages()
    return
  }
  releasePendingImages()
  title.value = props.note?.title ?? ''
  content.value = props.note?.content ?? ''
  draftId.value = props.note?.id ?? crypto.randomUUID()
  existingImages.value = [...(props.note?.images ?? [])]
  errorMessage.value = ''
})

const { handleDialogKeydown } = useDialogFocus({
  isVisible: () => props.visible,
  dialogRef: dialog,
  initialFocus: () => titleInput.value || closeButton.value,
  onEscape: close
})

function characterCount(value) {
  return Array.from(value).length
}

function truncateCharacters(value, maximum) {
  return Array.from(value).slice(0, maximum).join('')
}

function updateTitle(event) {
  title.value = truncateCharacters(event.target.value, 80)
  if (event.target.value !== title.value) event.target.value = title.value
}

function updateContent(event) {
  content.value = truncateCharacters(event.target.value, 5000)
  if (event.target.value !== content.value) event.target.value = content.value
}

function releasePendingImages() {
  for (const image of pendingImages.value) URL.revokeObjectURL(image.previewUrl)
  pendingImages.value = []
}

function close() {
  if (saving.value) return
  editorGeneration += 1
  processing.value = false
  releasePendingImages()
  emit('close')
}

function insertLinkTemplate() {
  const textarea = contentInput.value
  const template = '[参考资料](https://example.com)'
  if (!textarea) {
    content.value += template
    return
  }
  const start = textarea.selectionStart ?? content.value.length
  const end = textarea.selectionEnd ?? start
  const nextContent = `${content.value.slice(0, start)}${template}${content.value.slice(end)}`
  content.value = truncateCharacters(nextContent, 5000)
  const selectionEnd = Math.min(start + 5, content.value.length)
  void nextTick(() => {
    textarea.focus()
    textarea.setSelectionRange(Math.min(start + 1, selectionEnd), selectionEnd)
  })
}

async function selectImages(event) {
  const files = Array.from(event.target.files ?? [])
  event.target.value = ''
  const remaining = 4 - imageSlotCount.value
  if (files.length > remaining) {
    errorMessage.value = `最多还能添加 ${remaining} 张图片。`
    return
  }
  processing.value = true
  errorMessage.value = ''
  const generation = editorGeneration
  for (const file of files) {
    try {
      const processed = await processPhoto(file)
      if (generation !== editorGeneration || !props.visible) return
      pendingImages.value.push({
        ...processed,
        key: `pending-${crypto.randomUUID()}`,
        previewUrl: URL.createObjectURL(processed.file)
      })
    } catch (error) {
      if (generation !== editorGeneration || !props.visible) return
      errorMessage.value = error?.message ?? '图片处理失败，请换一张重试。'
    }
  }
  if (generation === editorGeneration) processing.value = false
}

function removeImage(key) {
  if (key.startsWith('existing-')) {
    const id = key.slice('existing-'.length)
    existingImages.value = existingImages.value.filter(image => image.id !== id)
    return
  }
  const image = pendingImages.value.find(item => item.key === key)
  if (image) URL.revokeObjectURL(image.previewUrl)
  pendingImages.value = pendingImages.value.filter(item => item.key !== key)
}

async function save() {
  if (!canSave.value || saving.value) return
  saving.value = true
  errorMessage.value = ''
  const generation = editorGeneration
  const input = {
    title: title.value,
    content: content.value
  }
  try {
    const result = props.note
      ? await props.repository.updateNote(props.note.id, {
          ...input,
          keptImageIds: existingImages.value.map(image => image.id),
          newImages: pendingImages.value
        })
      : await props.repository.createNote({
          ...input,
          id: draftId.value,
          images: pendingImages.value
        })
    if (generation === editorGeneration && props.visible) {
      releasePendingImages()
      emit('saved', result)
    }
  } catch (error) {
    if (generation === editorGeneration) {
      errorMessage.value = error?.message ?? '手记保存失败，请稍后重试。'
    }
  } finally {
    if (generation === editorGeneration) saving.value = false
  }
}

onUnmounted(releasePendingImages)
</script>

<style scoped>
.note-editor {
  width: min(720px, calc(100vw - 2rem));
  max-height: min(88vh, 820px);
  overflow: hidden;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-xl);
}

.editor-header,
.editor-actions,
.field-heading,
.image-picker {
  display: flex;
  align-items: center;
}

.editor-header {
  justify-content: space-between;
  padding: 1rem 1.2rem;
  background: linear-gradient(135deg, var(--primary-soft), var(--surface-soft));
  border-bottom: 1px solid var(--border-color);
}

.editor-header span {
  color: var(--primary-color);
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.12em;
}

.editor-header h2 {
  margin-top: 0.16rem;
  font-size: 1.2rem;
}

.icon-button {
  display: grid;
  width: 36px;
  height: 36px;
  padding: 0;
  color: var(--text-secondary);
  cursor: pointer;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 50%;
  place-items: center;
}

.editor-body {
  display: grid;
  gap: 1rem;
  max-height: calc(min(88vh, 820px) - 78px);
  padding: 1.15rem 1.2rem;
  overflow-y: auto;
}

.field-group {
  display: grid;
  gap: 0.42rem;
  color: var(--text-primary);
  font-size: 0.86rem;
  font-weight: 700;
}

.field-group small {
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 500;
}

.field-group .pending-hint {
  color: var(--warning-color, #a16207);
  font-weight: 650;
}

.field-heading {
  justify-content: space-between;
  gap: 0.75rem;
}

.link-helper {
  display: inline-flex;
  gap: 0.3rem;
  align-items: center;
  padding: 0;
  color: var(--primary-color);
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.note-content-input {
  min-height: 190px;
  resize: vertical;
}

.editor-images {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.55rem;
}

.editor-images figure {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--radius-md);
}

.editor-images img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.editor-images button {
  position: absolute;
  top: 0.35rem;
  right: 0.35rem;
  display: grid;
  width: 26px;
  height: 26px;
  padding: 0;
  color: white;
  cursor: pointer;
  background: rgba(15, 23, 42, 0.72);
  border: 0;
  border-radius: 50%;
  place-items: center;
}

.image-picker {
  justify-content: center;
  gap: 0.42rem;
  min-height: 44px;
  color: var(--primary-color);
  font-weight: 750;
  cursor: pointer;
  background: var(--primary-soft);
  border: 1px dashed color-mix(in srgb, var(--primary-color) 42%, var(--border-color));
  border-radius: var(--radius-lg);
}

.image-picker:disabled,
.icon-button:disabled,
.link-helper:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.editor-error {
  padding: 0.7rem 0.8rem;
  color: var(--danger-color);
  font-size: 0.82rem;
  background: color-mix(in srgb, var(--danger-color) 8%, var(--card-bg));
  border-radius: var(--radius-md);
}

.editor-actions {
  justify-content: flex-end;
  gap: 0.65rem;
  padding-top: 0.15rem;
}

@media (max-width: 560px) {
  .note-editor {
    width: calc(100vw - 1rem);
    max-height: 94vh;
  }

  .editor-body {
    max-height: calc(94vh - 74px);
    padding: 0.9rem;
  }

  .editor-images {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
