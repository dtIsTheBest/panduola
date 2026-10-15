<template>
  <section class="notes-space" aria-labelledby="parenting-notes-title">
    <h2 id="parenting-notes-title" class="sr-only">育儿手记</h2>

    <div v-if="!isAvailable" class="notes-state" role="status">
      <CloudOff :size="28" />
      <strong>育儿手记服务尚未配置</strong>
      <span>当前不会上传或保存手记内容。</span>
    </div>

    <div v-else-if="!isSignedIn" class="notes-state private-state">
      <BookLock :size="30" />
      <strong>登录后开启你的私密手记</strong>
      <span>手记与图片只属于当前账号，并可在多设备查看。</span>
      <button type="button" class="btn btn-primary" @click="$emit('account-request', $event.currentTarget)">
        <LogIn :size="16" />登录后开始记录
      </button>
    </div>

    <template v-else>
      <div class="notes-toolbar">
        <label class="notes-search">
          <Search :size="17" />
          <input
            v-model="searchQuery"
            type="search"
            aria-label="搜索育儿手记"
            placeholder="搜索手记标题或正文"
          />
        </label>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="loading || notes.length >= 100"
          @click="openCreate"
        ><PenLine :size="16" />写手记</button>
        <button
          type="button"
          class="refresh-button"
          :disabled="loading"
          aria-label="刷新育儿手记"
          title="刷新"
          @click="loadNotes()"
        ><RefreshCw :size="17" :class="{ spinning: loading }" /></button>
      </div>

      <p class="sr-only" aria-live="polite">{{ statusMessage }}</p>
      <p v-if="noticeMessage" class="notes-notice" role="status">{{ noticeMessage }}</p>
      <div v-if="errorMessage" class="notes-error" role="alert">
        <span>{{ errorMessage }}</span>
        <button type="button" @click="loadNotes">重试</button>
      </div>

      <div v-if="loading && notes.length === 0" class="notes-state compact">
        <RefreshCw :size="25" class="spinning" />
        <span>正在打开你的手记…</span>
      </div>

      <div v-else-if="filteredNotes.length === 0" class="notes-state compact">
        <NotebookPen :size="30" />
        <strong>{{ searchQuery ? '没有找到相关手记' : '还没有写下第一篇手记' }}</strong>
        <span>{{ searchQuery ? '换个更短的关键词试试。' : '不求完整，先记录今天最想留下的一件事。' }}</span>
        <button v-if="!searchQuery" type="button" class="btn btn-primary btn-sm" @click="openCreate">
          <PenLine :size="15" />写第一篇
        </button>
      </div>

      <div v-else class="notes-grid" :aria-busy="loading">
        <article v-for="note in filteredNotes" :key="note.id" class="note-card">
          <div v-if="note.images.length" class="note-images" :class="`count-${note.images.length}`">
            <img
              v-for="image in note.images"
              :key="image.id"
              :src="image.signedUrl"
              :alt="`${note.title}的手记图片`"
              loading="lazy"
            />
          </div>
          <div class="note-card-body">
            <div class="note-meta">
              <time :datetime="note.updatedAt">{{ formatDate(note.updatedAt) }}</time>
              <span v-if="note.updatedAt !== note.createdAt">已更新</span>
              <span v-if="note.pendingImageCount > 0">{{ note.pendingImageCount }} 张图片确认中</span>
            </div>
            <h3>{{ note.title }}</h3>
            <div class="note-content">
              <p v-for="line in parsedContents.get(note.id)" :key="line.id">
                <template v-for="(token, index) in line.tokens" :key="`${line.id}-${index}`">
                  <a
                    v-if="token.type === 'link'"
                    :href="token.href"
                    target="_blank"
                    rel="noopener noreferrer"
                  >{{ token.label }}</a>
                  <span v-else>{{ token.value }}</span>
                </template>
              </p>
            </div>
            <button
              v-if="hasMoreContent(note)"
              type="button"
              class="expand-button"
              :aria-expanded="expandedNoteIds.has(note.id)"
              @click="toggleExpanded(note.id)"
            >{{ expandedNoteIds.has(note.id) ? '收起全文' : '展开全文' }}</button>
            <footer class="note-actions">
              <button type="button" @click="openEdit(note)"><Pencil :size="14" />编辑</button>
              <button type="button" class="danger" :disabled="deletingId === note.id" @click="deleteNote(note)">
                <Trash2 :size="14" />{{ deletingId === note.id ? '删除中…' : '删除' }}
              </button>
            </footer>
          </div>
        </article>
      </div>
    </template>

    <ParentingNoteEditor
      :visible="editorVisible"
      :note="editingNote"
      :repository="repository"
      @close="closeEditor"
      @saved="handleSaved"
    />
  </section>
</template>

<script setup>
import { computed, inject, ref, watch } from 'vue'
import {
  BookLock,
  CloudOff,
  LogIn,
  NotebookPen,
  Pencil,
  PenLine,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-vue-next'
import { ACCOUNT_SYNC_FACADE_KEY } from '@/account/accountSyncFacade'
import { createNoteExcerpt, parseNoteContent } from '@/notes/noteContent'
import { PARENTING_NOTES_REPOSITORY_KEY } from '@/notes/parentingNotesRepository'
import ParentingNoteEditor from './ParentingNoteEditor.vue'

defineEmits(['account-request'])

const accountSyncFacade = inject(ACCOUNT_SYNC_FACADE_KEY, null)
const repository = inject(PARENTING_NOTES_REPOSITORY_KEY, null)
const notes = ref([])
const searchQuery = ref('')
const loading = ref(false)
const deletingId = ref(null)
const errorMessage = ref('')
const statusMessage = ref('')
const noticeMessage = ref('')
const editorVisible = ref(false)
const editingNote = ref(null)
const expandedNoteIds = ref(new Set())
let ownerGeneration = 0
let requestId = 0
let deleteOperation = 0

const userId = computed(() => {
  if (accountSyncFacade?.accountState?.status !== 'signed-in') return null
  return accountSyncFacade.accountState.session?.userId ?? null
})
const isSignedIn = computed(() => Boolean(userId.value))
const isAvailable = computed(() => repository?.isAvailable === true)
const filteredNotes = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('zh-CN')
  if (!query) return notes.value
  return notes.value.filter(note => (
    note.title.toLocaleLowerCase('zh-CN').includes(query) ||
    note.content.toLocaleLowerCase('zh-CN').includes(query)
  ))
})
const parsedContents = computed(() => new Map(
  filteredNotes.value.map(note => [note.id, parseNoteContent(
    expandedNoteIds.value.has(note.id) ? note.content : createNoteExcerpt(note.content)
  )])
))

watch(userId, currentUserId => {
  ownerGeneration += 1
  requestId += 1
  deleteOperation += 1
  notes.value = []
  loading.value = false
  deletingId.value = null
  expandedNoteIds.value = new Set()
  searchQuery.value = ''
  errorMessage.value = ''
  noticeMessage.value = ''
  closeEditor()
  if (currentUserId && isAvailable.value) void loadNotes()
}, { immediate: true })

async function loadNotes({ clearNoticeOnSuccess = true } = {}) {
  if (!isSignedIn.value || !isAvailable.value || loading.value) return false
  const generation = ownerGeneration
  const currentRequest = ++requestId
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await repository.listOwnNotes()
    if (generation !== ownerGeneration || currentRequest !== requestId) return
    notes.value = result
    statusMessage.value = `已加载 ${result.length} 篇育儿手记。`
    if (clearNoticeOnSuccess) noticeMessage.value = ''
    return true
  } catch (error) {
    if (generation !== ownerGeneration || currentRequest !== requestId) return
    errorMessage.value = error?.message ?? '育儿手记加载失败，请稍后重试。'
    return false
  } finally {
    if (generation === ownerGeneration && currentRequest === requestId) loading.value = false
  }
}

function openCreate() {
  editingNote.value = null
  editorVisible.value = true
}

function hasMoreContent(note) {
  return createNoteExcerpt(note.content) !== note.content
}

function toggleExpanded(noteId) {
  expandedNoteIds.value = expandedNoteIds.value.has(noteId)
    ? new Set()
    : new Set([noteId])
}

function openEdit(note) {
  editingNote.value = note
  editorVisible.value = true
}

function closeEditor() {
  editorVisible.value = false
  editingNote.value = null
}

async function handleSaved(result) {
  closeEditor()
  if (result.imageMutationFailed) {
    noticeMessage.value = '文字已保存，但图片变更未完成，请稍后编辑补充。'
  } else if (result.refreshFailed) {
    noticeMessage.value = '手记已保存，列表暂时刷新失败，请稍后点击刷新。'
  } else if (result.pendingImageCount > 0) {
    noticeMessage.value = `文字已保存，${result.pendingImageCount} 张图片正在确认上传结果。`
  } else if (result.failedImageCount > 0) {
    noticeMessage.value = `文字已保存，${result.failedImageCount} 张图片未能上传。`
  } else {
    noticeMessage.value = '育儿手记已保存。'
  }
  statusMessage.value = noticeMessage.value
  const refreshed = await loadNotes({ clearNoticeOnSuccess: false })
  if (result.refreshFailed && refreshed) noticeMessage.value = '育儿手记已保存。'
}

async function deleteNote(note) {
  if (deletingId.value || !confirm(`确定删除手记「${note.title}」吗？图片也会一并删除。`)) return
  const generation = ownerGeneration
  const operation = ++deleteOperation
  deletingId.value = note.id
  errorMessage.value = ''
  try {
    await repository.deleteNote(note.id)
    if (generation !== ownerGeneration || operation !== deleteOperation) return
    notes.value = notes.value.filter(item => item.id !== note.id)
    noticeMessage.value = '育儿手记已删除。'
    statusMessage.value = noticeMessage.value
  } catch (error) {
    if (generation !== ownerGeneration || operation !== deleteOperation) return
    errorMessage.value = error?.message ?? '手记删除失败，请稍后重试。'
  } finally {
    if (generation === ownerGeneration && operation === deleteOperation) deletingId.value = null
  }
}

function formatDate(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(value))
}
</script>

<style scoped>
.notes-space {
  max-width: var(--content-max-width);
  margin: 0 auto;
}

.notes-toolbar,
.notes-search,
.note-meta,
.note-actions {
  display: flex;
  align-items: center;
}

.notes-toolbar {
  justify-content: space-between;
  gap: 0.65rem;
  margin-bottom: 1rem;
}

.notes-search {
  flex: 1;
  gap: 0.55rem;
  max-width: 420px;
  padding: 0 0.75rem;
  color: var(--text-muted);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.notes-search input {
  width: 100%;
  min-height: 42px;
  color: var(--text-primary);
  background: transparent;
  border: 0;
  outline: 0;
}

.notes-search:focus-within {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 14%, transparent);
}

.refresh-button {
  display: grid;
  width: 42px;
  height: 42px;
  padding: 0;
  color: var(--primary-color);
  cursor: pointer;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  place-items: center;
}

.notes-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.note-card {
  min-width: 0;
  overflow: hidden;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}

.note-images {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px;
  height: 190px;
  background: var(--surface-muted);
}

.note-images.count-1 {
  grid-template-columns: 1fr;
}

.note-images img {
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: cover;
}

.note-card-body {
  padding: 1rem;
}

.note-meta {
  gap: 0.5rem;
  color: var(--text-muted);
  font-size: 0.7rem;
}

.note-meta span {
  padding: 0.12rem 0.42rem;
  color: var(--primary-color);
  background: var(--primary-soft);
  border-radius: 999px;
}

.note-card h3 {
  margin: 0.38rem 0 0.55rem;
  color: var(--text-primary);
  font-size: 1.05rem;
  line-height: 1.45;
}

.note-content {
  max-height: 11.2rem;
  overflow: auto;
  color: var(--text-secondary);
  font-size: 0.84rem;
  line-height: 1.72;
}

.note-content p {
  min-height: 1.72em;
  white-space: pre-wrap;
}

.note-content a {
  color: var(--primary-color);
  font-weight: 650;
  text-decoration: underline;
  text-underline-offset: 0.16em;
}

.expand-button {
  margin-top: 0.45rem;
  padding: 0;
  color: var(--primary-color);
  font-size: 0.74rem;
  font-weight: 750;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.note-actions {
  justify-content: flex-end;
  gap: 0.7rem;
  margin-top: 0.8rem;
  padding-top: 0.7rem;
  border-top: 1px solid var(--border-color);
}

.note-actions button,
.notes-error button {
  display: inline-flex;
  gap: 0.28rem;
  align-items: center;
  padding: 0;
  color: var(--primary-color);
  font-size: 0.76rem;
  font-weight: 750;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.note-actions .danger {
  color: var(--danger-color);
}

.notes-state {
  display: grid;
  min-height: 300px;
  padding: 2rem;
  color: var(--text-secondary);
  text-align: center;
  background: var(--card-bg);
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-xl);
  place-content: center;
  justify-items: center;
  gap: 0.55rem;
}

.notes-state strong {
  color: var(--text-primary);
}

.notes-state.compact {
  min-height: 240px;
}

.notes-state .btn {
  margin-top: 0.4rem;
}

.notes-error {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.8rem;
  padding: 0.7rem 0.8rem;
  color: var(--danger-color);
  font-size: 0.8rem;
  background: color-mix(in srgb, var(--danger-color) 8%, var(--card-bg));
  border-radius: var(--radius-md);
}

.notes-notice {
  margin-bottom: 0.8rem;
  padding: 0.65rem 0.8rem;
  color: var(--primary-dark);
  font-size: 0.8rem;
  background: var(--primary-soft);
  border-radius: var(--radius-md);
}

@media (max-width: 900px) {
  .notes-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .note-images {
    height: 165px;
  }
}
</style>
