<template>
  <section class="ai-search" aria-labelledby="ai-assistant-title">
    <div class="ai-search-card" :class="{ unavailable: !isAvailable }">
      <header class="ai-search-header">
        <div class="ai-heading-group">
          <div class="ai-icon" aria-hidden="true">
            <Brain :size="20" />
          </div>
          <div>
            <span class="ai-eyebrow">站内智能问答</span>
            <h2 id="ai-assistant-title">AI 成长助手</h2>
          </div>
        </div>
        <div v-if="quota" class="quota-badge">
          <Clock3 :size="14" />
          {{ quotaLabel }}
        </div>
      </header>

      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {{ statusAnnouncement }}
      </div>

      <p class="ai-description">
        在这里直接询问成长或育儿问题，无需跳转到其他平台。
      </p>

      <div v-if="!isAvailable" class="ai-unavailable" role="status">
        <AlertCircle :size="18" />
        <div>
          <strong>AI 助手暂未开放</strong>
          <span>其他本地功能和云同步不受影响。</span>
        </div>
      </div>

      <template v-else>
        <form class="ai-search-form" @submit.prevent="handleSearch">
          <label class="sr-only" for="ai-growth-question">输入成长或育儿问题</label>
          <input
            id="ai-growth-question"
            v-model="searchQuery"
            type="text"
            class="ai-search-input"
            maxlength="1000"
            :aria-invalid="questionLength > 500"
            aria-describedby="ai-privacy-hint"
            :placeholder="loading ? '正在整理相关信息…' : '输入成长或育儿问题…'"
            :disabled="loading"
          />
          <button
            type="submit"
            class="ai-search-btn"
            aria-label="提交问题"
            title="提交问题"
            :disabled="!canSubmit"
          >
            <Search :size="18" />
            <span>提问</span>
          </button>
        </form>

        <p id="ai-privacy-hint" class="privacy-hint">
          <ShieldCheck :size="14" />
          <span>仅发送当前问题；最近提问只保存在这台设备。</span>
          <span class="question-count" :class="{ invalid: questionLength > 500 }">
            {{ questionLength }}/500
          </span>
        </p>

        <div v-if="searchHistory.length" class="ai-search-history">
          <span class="history-label">最近提问</span>
          <div class="history-tags">
            <button
              v-for="item in searchHistory"
              :key="item"
              type="button"
              class="history-tag"
              :disabled="loading || retrySeconds > 0"
              @click="askSuggestedQuestion(item)"
            >
              {{ item }}
            </button>
          </div>
        </div>

        <div v-if="!loading && !searchResult" class="ai-search-tips">
          <span class="tip-title">你可以这样问</span>
          <div class="tip-items">
            <button
              v-for="tip in tips"
              :key="tip"
              type="button"
              class="tip-item"
              :disabled="loading || retrySeconds > 0"
              @click="askSuggestedQuestion(tip)"
            >
              {{ tip }}
            </button>
          </div>
        </div>

        <div v-if="loading" class="ai-search-loading">
          <span class="loading-spinner" aria-hidden="true"></span>
          <span>正在整理相关信息…</span>
        </div>

        <div v-if="errorState" class="ai-error-shell">
          <div class="ai-search-error" role="alert">
            <AlertCircle :size="17" />
            <span>{{ errorState.message }}</span>
          </div>
          <div v-if="isRetryableError" class="retry-row">
            <small v-if="retrySeconds > 0">
              请在 {{ retrySeconds }} 秒后重新提问。
            </small>
            <small v-else>
              再次提问会使用新的请求额度。
            </small>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="!canRetry"
              @click="handleSearch"
            >
              重新提问
            </button>
          </div>
        </div>

        <article v-if="searchResult" class="ai-search-result">
          <div class="result-header">
            <div>
              <Sparkles :size="16" />
              <strong>AI 参考回答</strong>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" @click="closeResult">
              关闭
            </button>
          </div>
          <div class="result-content">{{ searchResult }}</div>
          <p class="result-disclaimer">
            AI 内容仅供辅助参考，不能替代医生或其他专业人士的判断；遇到呼吸困难、意识异常等紧急情况请立即联系当地急救或专业机构。
          </p>
        </article>
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import {
  AlertCircle,
  Brain,
  Clock3,
  Search,
  ShieldCheck,
  Sparkles
} from 'lucide-vue-next'
import {
  AI_ASSISTANT_CLIENT_KEY,
  AI_CLIENT_ERROR_CODES
} from '@/ai/aiAssistantClient'

const HISTORY_STORAGE_KEY = 'search-history'
const MAX_HISTORY_ITEMS = 5

const aiClient = inject(AI_ASSISTANT_CLIENT_KEY, null)
const searchQuery = ref('')
const searchResult = ref('')
const loading = ref(false)
const errorState = ref(null)
const quota = ref(null)
const searchHistory = ref([])
const retrySeconds = ref(0)
let activeController = null
let retryTimer = null
let requestGeneration = 0
let isMounted = false

const tips = [
  '宝宝辅食怎么添加？',
  '新生儿睡眠规律怎么培养？',
  '如何应对宝宝分离焦虑？',
  '疫苗接种时间表',
  '宝宝发烧怎么办？'
]

const isAvailable = aiClient?.isAvailable === true
const questionLength = computed(() => Array.from(searchQuery.value.trim()).length)
const canSubmit = computed(() => (
  isAvailable &&
  !loading.value &&
  retrySeconds.value === 0 &&
  questionLength.value > 0 &&
  questionLength.value <= 500
))
const quotaLabel = computed(() => {
  if (!quota.value) return ''
  const prefix = quota.value.actorType === 'user' ? '账号额度' : '游客体验'
  return `${prefix} ${quota.value.remaining}/${quota.value.limit}`
})
const isRetryableError = computed(() => [
  AI_CLIENT_ERROR_CODES.PROVIDER_ERROR,
  AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE,
  AI_CLIENT_ERROR_CODES.TIMEOUT
].includes(errorState.value?.code))
const canRetry = computed(() => isRetryableError.value && retrySeconds.value === 0)
const statusAnnouncement = computed(() => {
  if (loading.value) return '正在整理 AI 回答'
  if (errorState.value) {
    const retryAvailable = (
      isRetryableError.value &&
      Number(errorState.value.retryAfterSeconds) > 0 &&
      retrySeconds.value === 0
    )
    return retryAvailable ? '现在可以重新提问' : ''
  }
  if (searchResult.value) {
    const quotaStatus = quotaLabel.value ? `，${quotaLabel.value}` : ''
    return `AI 回答已生成${quotaStatus}`
  }
  return quotaLabel.value
})

onMounted(() => {
  isMounted = true
  try {
    const savedHistory = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]')
    searchHistory.value = Array.isArray(savedHistory)
      ? savedHistory.filter(item => typeof item === 'string').slice(0, MAX_HISTORY_ITEMS)
      : []
  } catch {
    searchHistory.value = []
  }
  for (const legacyKey of ['ai-provider', 'openai-model', 'openai-api-key']) {
    try {
      localStorage.removeItem(legacyKey)
    } catch {
      // Legacy cleanup is best effort and independent from history parsing.
    }
  }
})

onUnmounted(() => {
  isMounted = false
  requestGeneration += 1
  activeController?.abort()
  clearRetryCountdown()
})

function persistHistory() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(searchHistory.value))
  } catch {
    // The answer is already available; history persistence is best effort.
  }
}

function addToHistory(question) {
  const nextHistory = [
    question,
    ...searchHistory.value.filter(item => item !== question)
  ].slice(0, MAX_HISTORY_ITEMS)
  searchHistory.value = nextHistory
  persistHistory()
}

function clearRetryCountdown() {
  if (retryTimer !== null) globalThis.clearInterval(retryTimer)
  retryTimer = null
  retrySeconds.value = 0
}

function startRetryCountdown(seconds) {
  clearRetryCountdown()
  retrySeconds.value = Math.max(0, Math.ceil(Number(seconds) || 0))
  if (retrySeconds.value === 0) return
  retryTimer = globalThis.setInterval(() => {
    retrySeconds.value = Math.max(0, retrySeconds.value - 1)
    if (retrySeconds.value === 0) clearRetryCountdown()
  }, 1000)
}

async function handleSearch() {
  if (!canSubmit.value) return
  const currentGeneration = ++requestGeneration
  loading.value = true
  searchResult.value = ''
  errorState.value = null
  quota.value = null
  clearRetryCountdown()
  activeController = new AbortController()
  const currentController = activeController
  const question = searchQuery.value.trim()
  try {
    const result = await aiClient.ask(question, {
      signal: currentController.signal
    })
    if (
      !isMounted ||
      currentGeneration !== requestGeneration ||
      currentController.signal.aborted
    ) return
    searchResult.value = result.answer
    quota.value = result.quota
    addToHistory(question)
  } catch (error) {
    if (
      !isMounted ||
      currentGeneration !== requestGeneration ||
      error?.code === AI_CLIENT_ERROR_CODES.ABORTED
    ) return
    errorState.value = {
      code: error?.code ?? AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE,
      message: error?.message || 'AI 助手暂时不可用，请稍后重试。',
      retryAfterSeconds: error?.retryAfterSeconds ?? null
    }
    startRetryCountdown(errorState.value.retryAfterSeconds)
  } finally {
    if (currentGeneration === requestGeneration) {
      activeController = null
      loading.value = false
    }
  }
}

function askSuggestedQuestion(question) {
  searchQuery.value = question
  handleSearch()
}

function closeResult() {
  searchResult.value = ''
  errorState.value = null
}
</script>

<style scoped>
.ai-search {
  width: 100%;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.ai-search-card {
  padding: 1.35rem;
  border: 1px solid rgba(196, 225, 218, 0.92);
  border-radius: var(--radius-2xl);
  background:
    radial-gradient(circle at 92% 10%, rgba(249, 191, 128, 0.18), transparent 14rem),
    linear-gradient(135deg, rgba(240, 252, 249, 0.98), rgba(255, 255, 255, 0.98));
  box-shadow: var(--shadow-md);
}

.ai-search-card.unavailable {
  background: var(--surface-soft);
}

.ai-search-header,
.ai-heading-group,
.result-header,
.result-header > div,
.privacy-hint,
.quota-badge,
.ai-search-error,
.ai-search-loading {
  display: flex;
  align-items: center;
}

.ai-search-header,
.result-header {
  justify-content: space-between;
  gap: 1rem;
}

.ai-heading-group {
  gap: 0.75rem;
}

.ai-icon {
  display: grid;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, #27887d, #5fb7a8);
  box-shadow: 0 8px 18px rgba(39, 136, 125, 0.2);
}

.ai-eyebrow {
  display: block;
  margin-bottom: 0.1rem;
  color: var(--primary-color);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.ai-search h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 1.08rem;
}

.ai-description {
  margin: 0.75rem 0 1rem;
  color: var(--text-secondary);
  font-size: 0.88rem;
  line-height: 1.6;
}

.quota-badge {
  flex: 0 0 auto;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  border: 1px solid rgba(39, 136, 125, 0.16);
  border-radius: 999px;
  color: var(--primary-dark);
  background: rgba(255, 255, 255, 0.82);
  font-size: 0.76rem;
  font-weight: 650;
}

.ai-search-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.65rem;
}

.ai-search-input {
  min-width: 0;
  padding: 0.78rem 0.95rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  background: #fff;
  font: inherit;
}

.ai-search-input:focus-visible {
  outline: 3px solid rgba(39, 136, 125, 0.18);
  border-color: var(--primary-color);
}

.ai-search-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-width: 92px;
  padding: 0.75rem 1rem;
  border: 0;
  border-radius: var(--radius-lg);
  color: #fff;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  box-shadow: 0 8px 18px rgba(39, 136, 125, 0.18);
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}

.ai-search-btn:disabled,
.history-tag:disabled,
.tip-item:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.privacy-hint {
  gap: 0.35rem;
  margin: 0.65rem 0 0;
  color: var(--text-tertiary);
  font-size: 0.74rem;
}

.privacy-hint > span:first-of-type {
  min-width: 0;
}

.question-count {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.question-count.invalid {
  color: #b54747;
  font-weight: 700;
}

.ai-search-history,
.ai-search-tips {
  margin-top: 1rem;
}

.history-label,
.tip-title {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--text-secondary);
  font-size: 0.76rem;
  font-weight: 650;
}

.history-tags,
.tip-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.history-tag,
.tip-item {
  max-width: 100%;
  padding: 0.38rem 0.68rem;
  overflow: hidden;
  border: 1px solid rgba(39, 136, 125, 0.14);
  border-radius: 999px;
  color: var(--primary-dark);
  background: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  font: inherit;
  font-size: 0.76rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tip-item:hover,
.history-tag:hover:not(:disabled) {
  border-color: rgba(39, 136, 125, 0.3);
  background: #fff;
}

.ai-search-loading,
.ai-search-error,
.ai-unavailable {
  gap: 0.65rem;
  margin-top: 1rem;
  padding: 0.8rem 0.9rem;
  border-radius: var(--radius-lg);
}

.ai-search-loading {
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.72);
}

.loading-spinner {
  width: 17px;
  height: 17px;
  border: 2px solid rgba(39, 136, 125, 0.2);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: ai-spin 0.8s linear infinite;
}

.ai-error-shell {
  margin-top: 1rem;
  padding: 0.8rem 0.9rem;
  border-radius: var(--radius-lg);
  color: #a84c4c;
  background: rgba(254, 242, 242, 0.9);
}

.ai-search-error {
  color: #a84c4c;
  margin: 0;
  padding: 0;
  background: transparent;
}

.ai-search-error > span {
  flex: 1;
}

.retry-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.55rem;
  padding-top: 0.55rem;
  border-top: 1px solid rgba(168, 76, 76, 0.12);
}

.retry-row small {
  color: #8f5a5a;
  font-size: 0.7rem;
}

.ai-unavailable {
  display: flex;
  align-items: flex-start;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.72);
}

.ai-unavailable strong,
.ai-unavailable span {
  display: block;
}

.ai-unavailable strong {
  margin-bottom: 0.15rem;
  color: var(--text-primary);
}

.ai-unavailable span {
  font-size: 0.82rem;
}

.ai-search-result {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid rgba(39, 136, 125, 0.14);
  border-radius: var(--radius-xl);
  background: #fff;
}

.result-header {
  margin-bottom: 0.8rem;
  padding-bottom: 0.7rem;
  border-bottom: 1px solid var(--border-color);
}

.result-header > div {
  gap: 0.45rem;
  color: var(--primary-dark);
}

.result-content {
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-size: 0.92rem;
  line-height: 1.75;
  white-space: pre-wrap;
}

.result-disclaimer {
  margin: 0.9rem 0 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 0.74rem;
  line-height: 1.55;
}

@keyframes ai-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 540px) {
  .ai-search-card {
    padding: 1rem;
    border-radius: var(--radius-xl);
  }

  .ai-search-header {
    align-items: flex-start;
  }

  .quota-badge {
    padding-inline: 0.5rem;
  }

  .ai-search-form {
    grid-template-columns: minmax(0, 1fr);
  }

  .ai-search-btn {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-spinner {
    animation: none;
  }
}
</style>
