<template>
  <article class="wall-card" aria-labelledby="comment-wall-title">
    <header class="wall-header">
      <div class="wall-icon comment-icon"><MessageCircle :size="21" /></div>
      <div>
        <h3 id="comment-wall-title" ref="wallHeading" tabindex="-1">评论建议墙</h3>
        <p>每一条建议，都是让这里更好用的一块拼图。</p>
      </div>
      <button
        type="button"
        class="icon-button"
        :disabled="loading || !isAvailable"
        aria-label="刷新评论"
        title="刷新评论"
        @click="loadComments"
      >
        <RefreshCw :size="17" :class="{ spinning: loading }" />
      </button>
    </header>

    <div v-if="!isAvailable" class="wall-notice" role="status">
      社区服务尚未配置，其他功能仍可正常使用。
    </div>

    <form v-else-if="isSignedIn" class="comment-form" @submit.prevent="publishComment">
      <div class="nickname-summary">
        <span>以 <strong>{{ nickname }}</strong> 公开</span>
        <button
          ref="nicknameEditButton"
          type="button"
          class="text-button"
          :disabled="publishing"
          :aria-expanded="nicknameEditing"
          aria-controls="comment-nickname-editor"
          @click="startNicknameEdit"
        >
          修改昵称
        </button>
      </div>
      <div v-if="nicknameEditing" id="comment-nickname-editor" class="nickname-editor">
        <div class="form-row">
          <label for="comment-nickname">公开昵称</label>
          <span :class="{ 'over-limit': nicknameDraftLength > 20 }">{{ nicknameDraftLength }}/20</span>
        </div>
        <input
          id="comment-nickname"
          ref="nicknameInput"
          v-model="nicknameDraft"
          autocomplete="nickname"
          placeholder="例如：小满妈妈"
          :disabled="publishing"
          :aria-invalid="nicknameDraftLength < 1 || nicknameDraftLength > 20"
          @keydown.esc.prevent="cancelNicknameEdit"
        />
        <div class="nickname-actions">
          <button type="button" class="text-button" :disabled="!canSaveNickname" @click="saveNickname">
            保存昵称
          </button>
          <button type="button" class="text-button" @click="restoreDefaultNickname">使用默认</button>
          <button type="button" class="text-button" @click="cancelNicknameEdit">取消</button>
        </div>
      </div>
      <div class="form-row content-label">
        <label for="comment-content">想说的话</label>
        <span :class="{ 'over-limit': contentLength > 300 }">{{ contentLength }}/300</span>
      </div>
      <textarea
        id="comment-content"
        v-model="content"
        rows="3"
        placeholder="写下建议、体验或想看到的新功能…"
        :disabled="publishing"
        :aria-invalid="contentLength > 300"
      ></textarea>
      <button
        type="submit"
        class="btn btn-primary publish-button"
        :disabled="publishing || !canPublish"
      >
        <Send :size="16" />{{ publishing ? '发布中…' : '发布留言' }}
      </button>
    </form>

    <div v-else-if="isAvailable" class="login-prompt">
      <div>
        <strong>登录后参与共创</strong>
        <span>浏览无需登录，发布和删除自己的留言需要登录。</span>
      </div>
      <button
        type="button"
        class="btn btn-primary btn-sm"
        @click="$emit('account-request', $event.currentTarget)"
      >
        <LogIn :size="15" />登录留言
      </button>
    </div>

    <p class="sr-status" aria-live="polite">{{ statusMessage }}</p>
    <div v-if="errorMessage" class="wall-error" role="alert">
      <span>{{ errorMessage }}</span>
      <button type="button" @click="retryError">{{ errorActionLabel }}</button>
    </div>

    <div class="comment-list" :aria-busy="loading">
      <div v-if="loading && comments.length === 0" class="wall-empty">
        <RefreshCw :size="24" class="spinning" />
        <span>正在加载留言…</span>
      </div>
      <div v-else-if="comments.length === 0" class="wall-empty">
        <Sparkles :size="25" />
        <strong>还没有留言</strong>
        <span>欢迎成为第一个留下想法的人。</span>
      </div>
      <template v-else>
        <article v-for="comment in comments" :key="comment.id" class="comment-item">
          <div class="comment-meta">
            <strong>{{ comment.nickname }}</strong>
            <time :datetime="comment.createdAt">{{ formatTime(comment.createdAt) }}</time>
          </div>
          <p>{{ comment.content }}</p>
          <div
            v-if="comment.canDelete"
            class="comment-actions"
            @keydown.esc.prevent.stop="cancelDelete"
          >
            <template v-if="pendingDeleteId === comment.id">
              <span>确认删除？</span>
              <button
                :ref="element => setConfirmButton(comment.id, element)"
                type="button"
                class="text-button danger"
                :disabled="deletingId === comment.id"
                @click="deleteComment(comment.id)"
              >{{ deletingId === comment.id ? '删除中…' : '确认' }}</button>
              <button
                type="button"
                class="text-button"
                :disabled="deletingId === comment.id"
                @click="cancelDelete"
              >取消</button>
            </template>
            <button
              v-else
              type="button"
              class="text-button danger"
              @click="requestDelete(comment.id, $event.currentTarget)"
            ><Trash2 :size="14" />删除</button>
          </div>
        </article>
      </template>
    </div>
  </article>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  LogIn,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
  Trash2
} from 'lucide-vue-next'
import {
  createCommentNicknamePreference,
  maskEmailForNickname,
  normalizeCommentNickname
} from '@/community/commentNickname'

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
  },
  email: {
    type: String,
    default: ''
  }
})

defineEmits(['account-request'])

const comments = ref([])
const nickname = ref('')
const nicknameDraft = ref('')
const nicknameEditing = ref(false)
const nicknameInput = ref(null)
const nicknameEditButton = ref(null)
const content = ref('')
const loading = ref(false)
const publishing = ref(false)
const deletingId = ref(null)
const pendingDeleteId = ref(null)
const errorMessage = ref('')
const errorAction = ref(null)
const statusMessage = ref('')
const wallHeading = ref(null)
const confirmButtons = new Map()
let deleteTrigger = null
let ownerGeneration = 0
let listRequestId = 0
let publishOperation = 0
let deleteOperation = 0
const nicknamePreference = createCommentNicknamePreference()

const isAvailable = computed(() => props.repository?.isAvailable === true)
const nicknameLength = computed(() => Array.from(nickname.value.trim()).length)
const nicknameDraftLength = computed(() => Array.from(nicknameDraft.value.trim()).length)
const contentLength = computed(() => Array.from(content.value.trim()).length)
const canSaveNickname = computed(() => Boolean(
  normalizeCommentNickname(nicknameDraft.value)
))
const canPublish = computed(() => (
  nicknameLength.value >= 1 && nicknameLength.value <= 20 &&
  contentLength.value >= 1 && contentLength.value <= 300
))
const errorActionLabel = computed(() => {
  if (errorAction.value === 'publish') return '重新发布'
  if (errorAction.value === 'delete') return '重试删除'
  return '重新加载'
})

watch([() => props.isSignedIn, () => props.userId, () => props.email], () => {
  ownerGeneration += 1
  listRequestId += 1
  publishOperation += 1
  deleteOperation += 1
  loading.value = false
  publishing.value = false
  deletingId.value = null
  pendingDeleteId.value = null
  deleteTrigger = null
  errorAction.value = null
  nickname.value = props.isSignedIn
    ? nicknamePreference.read(props.userId, props.email)
    : ''
  nicknameDraft.value = nickname.value
  nicknameEditing.value = false
  if (isAvailable.value) void loadComments()
}, { immediate: true })

async function startNicknameEdit() {
  nicknameDraft.value = nickname.value
  nicknameEditing.value = true
  await nextTick()
  nicknameInput.value?.focus()
}

async function closeNicknameEditor() {
  nicknameEditing.value = false
  await nextTick()
  nicknameEditButton.value?.focus()
}

async function saveNickname() {
  const normalized = normalizeCommentNickname(nicknameDraft.value)
  if (!normalized) return
  nickname.value = normalized
  const saved = nicknamePreference.write(props.userId, normalized)
  statusMessage.value = saved
    ? '公开昵称已更新并保存'
    : '公开昵称已用于本次，未能保存到当前设备'
  await closeNicknameEditor()
}

async function restoreDefaultNickname() {
  const reset = nicknamePreference.reset(props.userId)
  nickname.value = maskEmailForNickname(props.email)
  nicknameDraft.value = nickname.value
  statusMessage.value = reset
    ? '已恢复并保存邮箱脱敏昵称'
    : '邮箱脱敏昵称仅用于本次，原偏好未能删除'
  await closeNicknameEditor()
}

async function cancelNicknameEdit() {
  nicknameDraft.value = nickname.value
  await closeNicknameEditor()
}

function getErrorMessage(error) {
  return typeof error?.message === 'string'
    ? error.message
    : '留言服务暂时不可用，请稍后重试。'
}

function invalidateListRequest() {
  listRequestId += 1
  loading.value = false
}

async function loadComments() {
  if (!isAvailable.value) return
  const requestId = ++listRequestId
  const generation = ownerGeneration
  loading.value = true
  errorMessage.value = ''
  errorAction.value = null
  try {
    const loaded = await props.repository.listComments()
    if (requestId !== listRequestId || generation !== ownerGeneration) return
    comments.value = loaded
    statusMessage.value = `已加载 ${loaded.length} 条留言`
  } catch (error) {
    if (requestId === listRequestId && generation === ownerGeneration) {
      errorMessage.value = getErrorMessage(error)
      errorAction.value = 'load'
    }
  } finally {
    if (requestId === listRequestId) loading.value = false
  }
}

async function publishComment() {
  if (!canPublish.value || publishing.value) return
  const generation = ownerGeneration
  const operation = ++publishOperation
  publishing.value = true
  errorMessage.value = ''
  errorAction.value = null
  try {
    const created = await props.repository.createComment({
      nickname: nickname.value,
      content: content.value
    })
    if (generation !== ownerGeneration || !props.isSignedIn) return
    invalidateListRequest()
    comments.value = [created, ...comments.value.filter(item => item.id !== created.id)]
      .slice(0, 50)
    content.value = ''
    statusMessage.value = '留言已发布'
    void loadComments()
  } catch (error) {
    if (generation === ownerGeneration) {
      errorMessage.value = getErrorMessage(error)
      errorAction.value = 'publish'
    }
  } finally {
    if (operation === publishOperation) publishing.value = false
  }
}

function setConfirmButton(commentId, element) {
  if (element) {
    confirmButtons.set(commentId, element)
  } else {
    confirmButtons.delete(commentId)
  }
}

async function requestDelete(commentId, trigger) {
  pendingDeleteId.value = commentId
  deleteTrigger = trigger
  await nextTick()
  confirmButtons.get(commentId)?.focus()
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

async function deleteComment(commentId) {
  if (deletingId.value) return
  const generation = ownerGeneration
  const operation = ++deleteOperation
  deletingId.value = commentId
  errorMessage.value = ''
  errorAction.value = null
  try {
    const deleted = await props.repository.deleteComment(commentId)
    if (generation !== ownerGeneration || !props.isSignedIn) return
    invalidateListRequest()
    if (deleted) comments.value = comments.value.filter(item => item.id !== commentId)
    statusMessage.value = deleted ? '留言已删除' : '留言已经不存在'
    pendingDeleteId.value = null
    deleteTrigger = null
    await nextTick()
    wallHeading.value?.focus()
    void loadComments()
  } catch (error) {
    if (generation === ownerGeneration) {
      errorMessage.value = getErrorMessage(error)
      errorAction.value = 'delete'
    }
  } finally {
    if (operation === deleteOperation) deletingId.value = null
  }
}

function retryError() {
  if (errorAction.value === 'publish') {
    void publishComment()
    return
  }
  if (errorAction.value === 'delete' && pendingDeleteId.value) {
    void deleteComment(pendingDeleteId.value)
    return
  }
  void loadComments()
}

function formatTime(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
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
  color: #8b5cf6;
  background: rgba(139, 92, 246, 0.12);
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

.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.comment-form {
  display: grid;
  gap: 0.5rem;
  padding: 0.8rem;
  margin-top: 0.85rem;
  background: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: 0.85rem;
}

.nickname-summary {
  display: flex;
  min-width: 0;
  gap: 0.65rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 0.55rem;
  font-size: 0.76rem;
  color: var(--text-secondary);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 0.65rem;
}

.nickname-summary span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nickname-summary strong {
  color: var(--text-primary);
}

.nickname-editor {
  display: grid;
  gap: 0.45rem;
  padding: 0.55rem;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 0.65rem;
}

.nickname-actions {
  display: flex;
  gap: 0.65rem;
  justify-content: flex-end;
  font-size: 0.74rem;
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.form-row label {
  font-weight: 700;
  color: var(--text-primary);
}

.over-limit {
  font-weight: 700;
  color: var(--danger-color);
}

.content-label {
  margin-top: 0.15rem;
}

.comment-form input,
.comment-form textarea {
  width: 100%;
  padding: 0.62rem 0.7rem;
  font: inherit;
  color: var(--text-primary);
  resize: vertical;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 0.65rem;
  outline: none;
}

.comment-form input:focus,
.comment-form textarea:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.publish-button {
  justify-self: end;
  min-width: 116px;
}

.login-prompt,
.wall-notice {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.8rem;
  margin-top: 0.85rem;
  background: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: 0.85rem;
}

.login-prompt strong,
.login-prompt span {
  display: block;
}

.login-prompt strong {
  color: var(--text-primary);
}

.login-prompt .btn {
  flex: 0 0 auto;
  white-space: nowrap;
}

.login-prompt span,
.wall-notice {
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

.wall-error {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.65rem;
  margin-top: 0.7rem;
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

.comment-list {
  display: grid;
  max-height: 360px;
  gap: 0.6rem;
  padding-right: 0.15rem;
  margin-top: 0.75rem;
  overflow-y: auto;
}

.comment-item {
  padding: 0.75rem;
  background: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: 0.8rem;
}

.comment-meta {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  font-size: 0.76rem;
}

.comment-meta strong {
  color: var(--text-primary);
}

.comment-meta time {
  color: var(--text-tertiary);
}

.comment-item p {
  margin: 0.45rem 0 0;
  font-size: 0.88rem;
  line-height: 1.65;
  color: var(--text-secondary);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.comment-actions {
  display: flex;
  gap: 0.55rem;
  align-items: center;
  justify-content: flex-end;
  margin-top: 0.45rem;
  font-size: 0.74rem;
  color: var(--text-tertiary);
}

.text-button {
  display: inline-flex;
  gap: 0.2rem;
  align-items: center;
}

.text-button.danger {
  color: var(--danger-color);
}

.wall-empty {
  display: grid;
  min-height: 130px;
  gap: 0.3rem;
  color: var(--text-tertiary);
  text-align: center;
  place-content: center;
  place-items: center;
}

.wall-empty strong {
  color: var(--text-secondary);
}

.wall-empty span {
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

  .login-prompt {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
