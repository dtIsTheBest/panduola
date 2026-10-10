<template>
  <article class="wall-card" aria-labelledby="photo-wall-title">
    <header class="wall-header">
      <div class="wall-icon photo-icon"><Images :size="21" /></div>
      <div>
        <h3 id="photo-wall-title">亲子照片墙</h3>
        <p>私密存放家庭瞬间，只有当前登录账号可以看到。</p>
      </div>
      <button
        ref="refreshButton"
        type="button"
        class="icon-button"
        :disabled="loading || !canLoadPhotos"
        aria-label="刷新照片"
        title="刷新照片"
        @click="loadPhotos"
      >
        <RefreshCw :size="17" :class="{ spinning: loading }" />
      </button>
    </header>

    <div v-if="!isAvailable" class="photo-notice" role="status">
      <LockKeyhole :size="20" />
      <span>私密照片服务尚未配置，照片不会上传。</span>
    </div>

    <div v-else-if="!isSignedIn" class="private-prompt">
      <div class="privacy-illustration"><LockKeyhole :size="28" /></div>
      <strong>这是你的私密家庭空间</strong>
      <span>照片不会出现在评论墙，也不会被其他账号看到。</span>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        @click="$emit('account-request', $event.currentTarget)"
      ><LogIn :size="15" />登录开启照片墙</button>
    </div>

    <template v-else>
      <div class="upload-toolbar">
        <input
          ref="fileInput"
          class="file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          :disabled="busy || photos.length >= 24"
          @change="selectFile"
        />
        <button
          ref="uploadButton"
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="busy || photos.length >= 24"
          @click="fileInput?.click()"
        ><ImagePlus :size="16" />{{ processing ? '处理图片中…' : '选择照片' }}</button>
        <span class="photo-count">{{ photos.length }}/24</span>
      </div>

      <div v-if="previewUrl" class="upload-preview">
        <img :src="previewUrl" alt="待上传照片预览" />
        <div class="preview-fields">
          <div class="preview-heading">
            <strong>上传前确认</strong>
            <button
              type="button"
              class="icon-button mini"
              :disabled="uploading"
              aria-label="取消选择"
              @click="clearSelection"
            ><X :size="15" /></button>
          </div>
          <div class="caption-label">
            <label for="photo-caption">照片说明（可选）</label>
            <span :class="{ 'over-limit': captionLength > 80 }">{{ captionLength }}/80</span>
          </div>
          <input
            id="photo-caption"
            v-model="caption"
            placeholder="例如：第一次一起看海"
            :disabled="uploading"
            :aria-invalid="captionLength > 80"
          />
          <span class="processed-meta">
            {{ processedPhoto?.width }} × {{ processedPhoto?.height }} ·
            {{ formatBytes(processedPhoto?.byteSize) }} · 已移除定位信息
          </span>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="uploading || captionLength > 80"
            @click="uploadPhoto"
          ><UploadCloud :size="16" />{{ uploading ? '上传中…' : '存入私密照片墙' }}</button>
        </div>
      </div>

      <p class="sr-status" aria-live="polite">{{ statusMessage }}</p>
      <div v-if="errorMessage" class="wall-error" role="alert">
        <span>{{ errorMessage }}</span>
        <button type="button" @click="retryError">{{ errorActionLabel }}</button>
      </div>

      <div class="photo-grid" :aria-busy="loading">
        <div v-if="loading && photos.length === 0" class="photo-empty">
          <RefreshCw :size="25" class="spinning" />
          <span>正在打开私密照片墙…</span>
        </div>
        <div v-else-if="photos.length === 0" class="photo-empty">
          <ImagePlus :size="28" />
          <strong>还没有照片</strong>
          <span>选择一张照片，记录今天的小小瞬间。</span>
        </div>
        <template v-else>
          <figure v-for="photo in photos" :key="photo.id" class="photo-item">
            <img :src="photo.signedUrl" :alt="photo.caption || '亲子照片'" loading="lazy" />
            <figcaption>
              <span>{{ photo.caption || '家庭瞬间' }}</span>
              <div class="photo-actions" @keydown.esc.prevent.stop="cancelDelete">
                <template v-if="pendingDeleteId === photo.id">
                  <button
                    :ref="element => setConfirmButton(photo.id, element)"
                    type="button"
                    class="text-button danger"
                    :disabled="deletingId === photo.id"
                    @click="deletePhoto(photo.id)"
                  >{{ deletingId === photo.id ? '删除中…' : '确认删除' }}</button>
                  <button
                    type="button"
                    class="text-button"
                    :disabled="deletingId === photo.id"
                    @click="cancelDelete"
                  >取消</button>
                </template>
                <button
                  v-else
                  type="button"
                  class="text-button danger"
                  @click="requestDelete(photo.id, $event.currentTarget)"
                ><Trash2 :size="14" />删除</button>
              </div>
            </figcaption>
          </figure>
        </template>
      </div>
    </template>
  </article>
</template>

<script setup>
import {
  computed,
  nextTick,
  onUnmounted,
  ref,
  watch
} from 'vue'
import {
  ImagePlus,
  Images,
  LockKeyhole,
  LogIn,
  RefreshCw,
  Trash2,
  UploadCloud,
  X
} from 'lucide-vue-next'
import { processPhoto } from '@/community/photoProcessor'

const props = defineProps({
  repository: {
    type: Object,
    default: null
  },
  isSignedIn: {
    type: Boolean,
    default: false
  },
  userId: {
    type: String,
    default: null
  }
})

defineEmits(['account-request'])

const photos = ref([])
const loading = ref(false)
const processing = ref(false)
const uploading = ref(false)
const deletingId = ref(null)
const pendingDeleteId = ref(null)
const errorMessage = ref('')
const errorAction = ref(null)
const statusMessage = ref('')
const processedPhoto = ref(null)
const previewUrl = ref('')
const caption = ref('')
const fileInput = ref(null)
const uploadButton = ref(null)
const refreshButton = ref(null)
const confirmButtons = new Map()
let deleteTrigger = null
let ownerGeneration = 0
let listRequestId = 0
let selectionGeneration = 0
let uploadOperation = 0
let deleteOperation = 0

const isAvailable = computed(() => props.repository?.isAvailable === true)
const canLoadPhotos = computed(() => (
  isAvailable.value && props.isSignedIn && Boolean(props.userId)
))
const busy = computed(() => processing.value || uploading.value)
const captionLength = computed(() => Array.from(caption.value.trim()).length)
const errorActionLabel = computed(() => {
  if (errorAction.value === 'select') return '重新选择'
  if (errorAction.value === 'upload') return '重试上传'
  if (errorAction.value === 'delete') return '重试删除'
  return '重新加载'
})

watch(() => props.userId, userId => {
  ownerGeneration += 1
  listRequestId += 1
  selectionGeneration += 1
  uploadOperation += 1
  deleteOperation += 1
  loading.value = false
  processing.value = false
  uploading.value = false
  deletingId.value = null
  pendingDeleteId.value = null
  photos.value = []
  errorMessage.value = ''
  errorAction.value = null
  statusMessage.value = ''
  clearSelection(false)
  if (userId && props.isSignedIn && isAvailable.value) void loadPhotos()
}, { immediate: true })

onUnmounted(() => {
  ownerGeneration += 1
  listRequestId += 1
  selectionGeneration += 1
  uploadOperation += 1
  deleteOperation += 1
  revokePreviewUrl()
})

function getErrorMessage(error) {
  return typeof error?.message === 'string'
    ? error.message
    : '照片服务暂时不可用，请稍后重试。'
}

function invalidateListRequest() {
  listRequestId += 1
  loading.value = false
}

async function loadPhotos() {
  if (!canLoadPhotos.value || loading.value) return
  const requestId = ++listRequestId
  const generation = ownerGeneration
  const ownerId = props.userId
  loading.value = true
  errorMessage.value = ''
  errorAction.value = null
  try {
    const loaded = await props.repository.listOwnPhotos()
    if (
      requestId !== listRequestId ||
      generation !== ownerGeneration ||
      ownerId !== props.userId
    ) return
    photos.value = loaded
    statusMessage.value = `已加载 ${loaded.length} 张私密照片`
  } catch (error) {
    if (
      requestId === listRequestId &&
      generation === ownerGeneration &&
      ownerId === props.userId
    ) {
      errorMessage.value = getErrorMessage(error)
      errorAction.value = 'load'
    }
  } finally {
    if (requestId === listRequestId) loading.value = false
  }
}

async function selectFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file || busy.value) return
  const generation = ++selectionGeneration
  processing.value = true
  errorMessage.value = ''
  errorAction.value = null
  try {
    const processed = await processPhoto(file)
    if (generation !== selectionGeneration || !props.isSignedIn) return
    revokePreviewUrl()
    processedPhoto.value = processed
    previewUrl.value = URL.createObjectURL(processed.file)
    caption.value = ''
    statusMessage.value = '图片已安全处理，请确认后上传'
  } catch (error) {
    if (generation === selectionGeneration) {
      errorMessage.value = getErrorMessage(error)
      errorAction.value = 'select'
    }
  } finally {
    if (generation === selectionGeneration) processing.value = false
  }
}

async function uploadPhoto() {
  if (
    !processedPhoto.value || uploading.value || !props.userId ||
    captionLength.value > 80
  ) return
  const generation = ownerGeneration
  const operation = ++uploadOperation
  const ownerId = props.userId
  uploading.value = true
  errorMessage.value = ''
  errorAction.value = null
  try {
    const uploaded = await props.repository.uploadOwnPhoto({
      file: processedPhoto.value.file,
      caption: caption.value,
      width: processedPhoto.value.width,
      height: processedPhoto.value.height
    })
    if (generation !== ownerGeneration || ownerId !== props.userId) return
    invalidateListRequest()
    photos.value = [uploaded, ...photos.value.filter(item => item.id !== uploaded.id)]
      .slice(0, 24)
    clearSelection(false)
    statusMessage.value = '照片已存入私密空间'
    void loadPhotos()
  } catch (error) {
    if (generation === ownerGeneration && ownerId === props.userId) {
      errorMessage.value = getErrorMessage(error)
      errorAction.value = 'upload'
    }
  } finally {
    if (operation === uploadOperation) uploading.value = false
  }
}

function revokePreviewUrl() {
  if (!previewUrl.value) return
  URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}

function clearSelection(restoreFocus = true) {
  selectionGeneration += 1
  revokePreviewUrl()
  processedPhoto.value = null
  caption.value = ''
  if (restoreFocus) void nextTick(() => uploadButton.value?.focus())
}

function setConfirmButton(photoId, element) {
  if (element) {
    confirmButtons.set(photoId, element)
  } else {
    confirmButtons.delete(photoId)
  }
}

async function requestDelete(photoId, trigger) {
  pendingDeleteId.value = photoId
  deleteTrigger = trigger
  await nextTick()
  confirmButtons.get(photoId)?.focus()
}

async function cancelDelete() {
  if (!pendingDeleteId.value) return
  pendingDeleteId.value = null
  if (errorAction.value === 'delete') {
    errorAction.value = null
    errorMessage.value = ''
  }
  await nextTick()
  if (deleteTrigger?.isConnected) deleteTrigger.focus()
  deleteTrigger = null
}

async function deletePhoto(photoId) {
  if (deletingId.value) return
  const generation = ownerGeneration
  const operation = ++deleteOperation
  const ownerId = props.userId
  deletingId.value = photoId
  errorMessage.value = ''
  errorAction.value = null
  try {
    const deleted = await props.repository.deleteOwnPhoto(photoId)
    if (generation !== ownerGeneration || ownerId !== props.userId) return
    invalidateListRequest()
    if (deleted) photos.value = photos.value.filter(item => item.id !== photoId)
    pendingDeleteId.value = null
    statusMessage.value = deleted ? '照片已删除' : '照片已经不存在'
    deleteTrigger = null
    await nextTick()
    uploadButton.value?.focus()
    void loadPhotos()
  } catch (error) {
    if (generation === ownerGeneration && ownerId === props.userId) {
      errorMessage.value = getErrorMessage(error)
      errorAction.value = 'delete'
    }
  } finally {
    if (operation === deleteOperation) deletingId.value = null
  }
}

function retryError() {
  if (errorAction.value === 'select') {
    fileInput.value?.click()
    return
  }
  if (errorAction.value === 'upload') {
    void uploadPhoto()
    return
  }
  if (errorAction.value === 'delete' && pendingDeleteId.value) {
    void deletePhoto(pendingDeleteId.value)
    return
  }
  void loadPhotos()
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return ''
  return value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(1)} MiB`
    : `${Math.max(1, Math.round(value / 1024))} KiB`
}
</script>

<style scoped>
.wall-card {
  display: flex;
  min-width: 0;
  min-height: 520px;
  padding: 1rem;
  flex-direction: column;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}

.wall-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.7rem;
  align-items: flex-start;
}

.wall-header h3 {
  margin: 0;
  font-size: 1.02rem;
  color: var(--text-primary);
}

.wall-header p {
  margin: 0.25rem 0 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

.wall-icon {
  display: grid;
  width: 2.45rem;
  height: 2.45rem;
  color: #0f8f83;
  background: rgba(20, 184, 166, 0.12);
  border-radius: 0.8rem;
  place-items: center;
}

.icon-button {
  display: grid;
  width: 2.2rem;
  height: 2.2rem;
  color: var(--text-secondary);
  cursor: pointer;
  background: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: 0.7rem;
  place-items: center;
}

.icon-button.mini {
  width: 1.85rem;
  height: 1.85rem;
}

.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.photo-notice,
.private-prompt {
  margin-top: 0.9rem;
  color: var(--text-secondary);
  background: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: 0.9rem;
}

.photo-notice {
  display: flex;
  gap: 0.55rem;
  align-items: center;
  padding: 0.85rem;
  font-size: 0.8rem;
}

.private-prompt {
  display: grid;
  min-height: 260px;
  padding: 1.2rem;
  gap: 0.45rem;
  text-align: center;
  place-content: center;
  place-items: center;
}

.private-prompt strong {
  color: var(--text-primary);
}

.private-prompt span {
  max-width: 320px;
  margin-bottom: 0.45rem;
  font-size: 0.8rem;
  line-height: 1.55;
}

.privacy-illustration {
  display: grid;
  width: 3.5rem;
  height: 3.5rem;
  margin-bottom: 0.3rem;
  color: var(--primary-color);
  background: var(--primary-soft);
  border-radius: 1.15rem;
  place-items: center;
}

.upload-toolbar {
  display: flex;
  gap: 0.55rem;
  align-items: center;
  padding: 0.75rem 0;
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.photo-count {
  margin-left: auto;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-tertiary);
}

.upload-preview {
  display: grid;
  grid-template-columns: minmax(100px, 0.8fr) minmax(0, 1.2fr);
  gap: 0.75rem;
  padding: 0.7rem;
  background: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: 0.85rem;
}

.upload-preview img {
  width: 100%;
  height: 148px;
  object-fit: cover;
  background: var(--card-bg);
  border-radius: 0.65rem;
}

.preview-fields {
  display: flex;
  min-width: 0;
  gap: 0.42rem;
  flex-direction: column;
}

.preview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-primary);
}

.preview-fields label,
.processed-meta {
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.caption-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.over-limit {
  font-weight: 700;
  color: var(--danger-color);
}

.preview-fields input {
  width: 100%;
  padding: 0.55rem 0.65rem;
  font: inherit;
  color: var(--text-primary);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 0.6rem;
  outline: none;
}

.preview-fields input:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.processed-meta {
  line-height: 1.45;
}

.wall-error {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.65rem;
  margin-bottom: 0.6rem;
  font-size: 0.78rem;
  color: var(--danger-color);
  background: rgba(239, 68, 68, 0.08);
  border-radius: 0.65rem;
}

.wall-error button,
.text-button {
  padding: 0;
  font: inherit;
  font-weight: 700;
  color: var(--primary-color);
  cursor: pointer;
  background: none;
  border: 0;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-height: 372px;
  gap: 0.6rem;
  padding-right: 0.15rem;
  overflow-y: auto;
}

.photo-item {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  background: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: 0.8rem;
}

.photo-item > img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  background: var(--surface-soft);
}

.photo-item figcaption {
  display: flex;
  min-width: 0;
  gap: 0.35rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.6rem;
}

.photo-item figcaption > span {
  overflow: hidden;
  font-size: 0.76rem;
  color: var(--text-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.photo-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 0.4rem;
}

.text-button {
  display: inline-flex;
  gap: 0.18rem;
  align-items: center;
  font-size: 0.72rem;
}

.text-button.danger {
  color: var(--danger-color);
}

.photo-empty {
  display: grid;
  grid-column: 1 / -1;
  min-height: 170px;
  gap: 0.3rem;
  color: var(--text-tertiary);
  text-align: center;
  place-content: center;
  place-items: center;
}

.photo-empty strong {
  color: var(--text-secondary);
}

.photo-empty span {
  font-size: 0.78rem;
}

.sr-status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.spinning {
  animation: spin 0.85s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 560px) {
  .wall-card {
    min-height: 480px;
    padding: 0.85rem;
  }

  .upload-preview {
    grid-template-columns: 1fr;
  }

  .upload-preview img {
    height: 180px;
  }
}

@media (max-width: 390px) {
  .photo-grid {
    grid-template-columns: 1fr;
  }
}
</style>
