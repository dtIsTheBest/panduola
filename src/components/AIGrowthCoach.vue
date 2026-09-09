<template>
  <section class="ai-coach" aria-labelledby="ai-coach-title">
    <div class="coach-card" :class="{ unavailable: !isAvailable }">
      <header class="coach-header">
        <div class="coach-title-group">
          <div class="coach-mark" aria-hidden="true">
            <Sparkles :size="21" />
          </div>
          <div>
            <div class="coach-eyebrow-row">
              <span class="coach-eyebrow">AI 成长参谋</span>
              <span class="new-badge">新版体验</span>
            </div>
            <h2 id="ai-coach-title" ref="coachHeading" tabindex="-1">
              不用琢磨怎么问，先选一件想完成的事
            </h2>
          </div>
        </div>
        <div v-if="quota" class="coach-quota">
          <Clock3 :size="14" />
          {{ quotaLabel }}
        </div>
      </header>

      <p class="coach-description">
        我会结合当前成长阶段，把模糊的问题整理成清楚、可执行的下一步。
      </p>

      <div class="coach-context-row">
        <span class="context-chip" :class="{ empty: !ageStage }">
          <Baby :size="14" />
          {{ stageLabel }}
        </span>
        <button type="button" class="classic-link" @click="$emit('open-classic')">
          <MessageCircleMore :size="14" />
          经典自由问答
        </button>
      </div>

      <div v-if="!isAvailable" class="coach-unavailable" role="status">
        <AlertCircle :size="18" />
        <div>
          <strong>AI 参谋暂未开放</strong>
          <span>任务入口可以预览，其他本地功能不受影响。</span>
        </div>
      </div>

      <div class="coach-task-grid" aria-label="选择成长任务">
        <button
          v-for="task in taskOptions"
          :key="task.id"
          ref="taskButtons"
          type="button"
          class="coach-task"
          :class="{ active: activeTaskId === task.id }"
          :aria-pressed="activeTaskId === task.id"
          :disabled="loading"
          @click="selectTask(task.id)"
        >
          <span class="task-icon" :class="`task-icon-${task.icon}`" aria-hidden="true">
            <component :is="taskIcons[task.icon]" :size="20" />
          </span>
          <span class="task-copy">
            <strong>{{ task.title }}</strong>
            <small>{{ task.description }}</small>
          </span>
          <ChevronRight :size="16" class="task-arrow" />
        </button>
      </div>

      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {{ statusAnnouncement }}
      </div>

      <transition name="coach-panel">
        <form v-if="activeTask" class="coach-composer" @submit.prevent="requestAdvice">
          <div class="composer-heading">
            <div>
              <span>已选择</span>
              <strong>{{ activeTask.title }}</strong>
            </div>
            <button
              type="button"
              class="composer-close"
              aria-label="收起任务编辑区"
              title="收起任务编辑区"
              :disabled="loading"
              @click="closeTask"
            >
              <X :size="17" />
            </button>
          </div>

          <label class="detail-label" for="coach-detail">
            补充一点情况
            <span>可选，说一两句就够了</span>
          </label>
          <textarea
            id="coach-detail"
            ref="detailInput"
            v-model="detail"
            class="coach-detail"
            :placeholder="activeTask.placeholder"
            :maxlength="MAX_COACH_DETAIL_CHARACTERS"
            :disabled="loading"
            rows="3"
          ></textarea>

          <div class="composer-footer">
            <p class="coach-privacy">
              <ShieldCheck :size="14" />
              仅发送当前阶段和本次补充，不读取姓名或历史记录
            </p>
            <span class="detail-count">{{ detailLength }}/{{ MAX_COACH_DETAIL_CHARACTERS }}</span>
          </div>

          <button ref="submitButton" type="submit" class="coach-submit" :disabled="!canSubmit">
            <span v-if="loading" class="coach-spinner" aria-hidden="true"></span>
            <WandSparkles v-else :size="17" />
            {{ loading ? '正在整理行动建议…' : '生成我的行动建议' }}
          </button>
        </form>
      </transition>

      <div v-if="errorState" class="coach-error" role="alert">
        <AlertCircle :size="17" />
        <span>{{ errorState.message }}</span>
        <button
          v-if="isRetryableError"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="loading"
          @click="requestAdvice"
        >
          再试一次
        </button>
      </div>

      <article v-if="answer" class="coach-result">
        <header>
          <div>
            <CircleCheckBig :size="17" />
            <strong>{{ activeTask?.title }} · 行动建议</strong>
          </div>
          <button type="button" class="result-close" @click="closeResult">关闭</button>
        </header>
        <div class="coach-answer">{{ answer }}</div>
        <p>
          AI 内容用于帮助梳理思路，不能替代医生或其他专业人士；出现紧急情况请立即联系当地急救或专业机构。
        </p>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  AlertCircle,
  Baby,
  CalendarDays,
  ChevronRight,
  CircleCheckBig,
  Clock3,
  HeartHandshake,
  MessageCircleMore,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Utensils,
  WandSparkles,
  X
} from 'lucide-vue-next'
import {
  COACH_TASKS,
  MAX_COACH_DETAIL_CHARACTERS,
  buildCoachQuestion
} from '@/ai/growthCoach'
import {
  AI_ASSISTANT_CLIENT_KEY,
  AI_CLIENT_ERROR_CODES
} from '@/ai/aiAssistantClient'

const props = defineProps({
  ageStage: {
    type: Object,
    default: null
  }
})

defineEmits(['open-classic'])

const aiClient = inject(AI_ASSISTANT_CLIENT_KEY, null)
const activeTaskId = ref(null)
const detail = ref('')
const answer = ref('')
const errorState = ref(null)
const quota = ref(null)
const loading = ref(false)
const detailInput = ref(null)
const taskButtons = ref([])
const submitButton = ref(null)
const coachHeading = ref(null)
let activeController = null
let activeRequestPromise = null
let requestGeneration = 0

const taskOptions = COACH_TASKS
const taskIcons = Object.freeze({
  calendar: CalendarDays,
  food: Utensils,
  heart: HeartHandshake,
  trend: TrendingUp
})
const isAvailable = aiClient?.isAvailable === true
const activeTask = computed(() => taskOptions.find(task => task.id === activeTaskId.value) ?? null)
const detailLength = computed(() => Array.from(detail.value.trim()).length)
const stageLabel = computed(() => props.ageStage
  ? `当前阶段：${props.ageStage.title} · ${props.ageStage.ageRange}`
  : '尚未选择成长阶段')
const stageKey = computed(() => props.ageStage?.id ?? '')
const canSubmit = computed(() => isAvailable && Boolean(activeTask.value) && !loading.value)
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
const statusAnnouncement = computed(() => {
  if (loading.value) return '正在整理行动建议'
  if (errorState.value) return errorState.value.message
  if (answer.value) return `行动建议已生成${quotaLabel.value ? `，${quotaLabel.value}` : ''}`
  if (activeTask.value) return `已选择${activeTask.value.title}`
  return ''
})

onBeforeUnmount(() => {
  requestGeneration += 1
  activeController?.abort()
})

watch(stageKey, () => {
  requestGeneration += 1
  activeController?.abort()
  if (!activeController) loading.value = false
  answer.value = ''
  errorState.value = null
})

function selectTask(taskId) {
  if (loading.value) return
  activeTaskId.value = taskId
  detail.value = ''
  answer.value = ''
  errorState.value = null
  void nextTick(() => detailInput.value?.focus())
}

function closeTask() {
  const taskIndex = taskOptions.findIndex(task => task.id === activeTaskId.value)
  activeTaskId.value = null
  detail.value = ''
  answer.value = ''
  errorState.value = null
  void nextTick(() => taskButtons.value[taskIndex]?.focus())
}

async function requestAdvice() {
  if (!canSubmit.value) return
  const currentGeneration = ++requestGeneration
  const question = buildCoachQuestion({
    taskId: activeTaskId.value,
    ageStage: props.ageStage,
    detail: detail.value
  })

  loading.value = true
  answer.value = ''
  errorState.value = null
  activeController = new AbortController()
  const currentController = activeController
  const currentRequest = aiClient.ask(question, { signal: currentController.signal })
  activeRequestPromise = currentRequest
  try {
    const result = await currentRequest
    if (currentGeneration !== requestGeneration || currentController.signal.aborted) return
    answer.value = result.answer
    quota.value = result.quota
  } catch (error) {
    if (currentGeneration !== requestGeneration || error?.code === AI_CLIENT_ERROR_CODES.ABORTED) return
    errorState.value = {
      code: error?.code ?? AI_CLIENT_ERROR_CODES.SERVICE_UNAVAILABLE,
      message: error?.message || 'AI 参谋暂时不可用，请稍后重试。'
    }
  } finally {
    if (activeRequestPromise === currentRequest) {
      activeRequestPromise = null
      activeController = null
      loading.value = false
    }
  }
}

function closeResult() {
  answer.value = ''
  errorState.value = null
  void nextTick(() => submitButton.value?.focus())
}

function focusStart() {
  coachHeading.value?.focus()
}

defineExpose({ focusStart })
</script>

<style scoped>
.ai-coach {
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

.coach-card {
  position: relative;
  padding: 1.35rem;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--primary-light) 46%, var(--border-color));
  border-radius: var(--radius-2xl);
  background:
    radial-gradient(circle at 94% 4%, color-mix(in srgb, var(--warm-color) 24%, transparent), transparent 15rem),
    radial-gradient(circle at 3% 100%, color-mix(in srgb, var(--primary-light) 18%, transparent), transparent 17rem),
    var(--card-bg);
  box-shadow: var(--shadow-md);
}

.coach-card::before {
  position: absolute;
  top: -72px;
  right: -62px;
  width: 150px;
  height: 150px;
  content: "";
  border: 1px solid color-mix(in srgb, var(--primary-light) 25%, transparent);
  border-radius: 50%;
  box-shadow:
    0 0 0 20px color-mix(in srgb, var(--primary-light) 5%, transparent),
    0 0 0 42px color-mix(in srgb, var(--warm-color) 4%, transparent);
  pointer-events: none;
}

.coach-header,
.coach-title-group,
.coach-eyebrow-row,
.coach-context-row,
.coach-quota,
.coach-unavailable,
.coach-error,
.coach-result header,
.coach-result header > div,
.composer-heading,
.composer-heading > div,
.composer-footer,
.coach-privacy,
.coach-submit {
  display: flex;
  align-items: center;
}

.coach-header,
.coach-context-row,
.coach-result header,
.composer-heading,
.composer-footer {
  justify-content: space-between;
}

.coach-header,
.coach-title-group {
  gap: 0.8rem;
}

.coach-title-group {
  min-width: 0;
}

.coach-mark {
  display: grid;
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  box-shadow: 0 9px 20px color-mix(in srgb, var(--primary-color) 24%, transparent);
  transform: rotate(-4deg);
}

.coach-eyebrow-row {
  gap: 0.45rem;
  margin-bottom: 0.18rem;
}

.coach-eyebrow {
  color: var(--primary-dark);
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.08em;
}

.new-badge {
  padding: 0.18rem 0.42rem;
  border-radius: 999px;
  color: var(--primary-dark);
  background: color-mix(in srgb, var(--primary-light) 18%, transparent);
  font-size: 0.64rem;
  font-weight: 700;
}

.coach-card h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: clamp(1.02rem, 2vw, 1.2rem);
  line-height: 1.35;
}

.coach-description {
  margin: 0.7rem 0 0.85rem 3.45rem;
  color: var(--text-secondary);
  font-size: 0.86rem;
  line-height: 1.55;
}

.coach-context-row {
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--border-color) 80%, transparent);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-soft) 82%, transparent);
}

.context-chip,
.classic-link {
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
}

.context-chip {
  min-width: 0;
  color: var(--primary-dark);
  font-size: 0.76rem;
  font-weight: 650;
}

.context-chip.empty {
  color: var(--text-tertiary);
}

.classic-link {
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  color: var(--text-secondary);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 0.73rem;
}

.classic-link:hover {
  color: var(--primary-dark);
}

.coach-quota {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  gap: 0.35rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  color: var(--primary-dark);
  background: var(--card-bg);
  font-size: 0.72rem;
  font-weight: 650;
}

.coach-task-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
}

.coach-task {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.58rem;
  align-items: center;
  min-height: 82px;
  padding: 0.72rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  color: var(--text-primary);
  text-align: left;
  background: color-mix(in srgb, var(--card-bg) 92%, transparent);
  cursor: pointer;
  font: inherit;
  transition: transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.coach-task:hover,
.coach-task.active {
  border-color: color-mix(in srgb, var(--primary-color) 44%, var(--border-color));
  box-shadow: 0 9px 22px color-mix(in srgb, var(--primary-color) 12%, transparent);
  transform: translateY(-2px);
}

.coach-task.active {
  background: color-mix(in srgb, var(--primary-light) 10%, var(--card-bg));
}

.coach-task:focus-visible,
.classic-link:focus-visible,
.composer-close:focus-visible,
.result-close:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--primary-color) 22%, transparent);
  outline-offset: 2px;
}

.coach-task:disabled {
  cursor: wait;
}

.task-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 12px;
}

.task-icon-trend { color: #2563eb; background: rgba(59, 130, 246, 0.12); }
.task-icon-calendar { color: #7c3aed; background: rgba(139, 92, 246, 0.12); }
.task-icon-food { color: #059669; background: rgba(16, 185, 129, 0.12); }
.task-icon-heart { color: #db2777; background: rgba(236, 72, 153, 0.12); }

.task-copy,
.task-copy strong,
.task-copy small {
  display: block;
  min-width: 0;
}

.task-copy strong {
  font-size: 0.82rem;
}

.task-copy small {
  display: -webkit-box;
  margin-top: 0.22rem;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 0.69rem;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.task-arrow {
  color: var(--text-tertiary);
  transition: transform var(--transition-fast);
}

.coach-task:hover .task-arrow,
.coach-task.active .task-arrow {
  color: var(--primary-color);
  transform: translateX(2px);
}

.coach-composer {
  margin-top: 0.85rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--primary-color) 18%, var(--border-color));
  border-radius: var(--radius-xl);
  background: color-mix(in srgb, var(--surface-soft) 82%, transparent);
}

.composer-heading {
  gap: 1rem;
  margin-bottom: 0.8rem;
}

.composer-heading > div {
  align-items: baseline;
  gap: 0.45rem;
}

.composer-heading span,
.detail-label span {
  color: var(--text-tertiary);
  font-size: 0.7rem;
}

.composer-heading strong {
  color: var(--primary-dark);
  font-size: 0.85rem;
}

.composer-close,
.result-close {
  border: 0;
  color: var(--text-secondary);
  background: transparent;
  cursor: pointer;
}

.composer-close {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 50%;
}

.composer-close:hover {
  background: var(--card-bg);
}

.detail-label {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  margin-bottom: 0.45rem;
  color: var(--text-primary);
  font-size: 0.8rem;
  font-weight: 650;
}

.coach-detail {
  width: 100%;
  min-height: 82px;
  padding: 0.75rem 0.85rem;
  resize: vertical;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  background: var(--card-bg);
  font: inherit;
  font-size: 0.84rem;
  line-height: 1.55;
}

.coach-detail:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--primary-color) 17%, transparent);
  border-color: var(--primary-color);
}

.composer-footer {
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.coach-privacy {
  gap: 0.32rem;
  margin: 0;
  color: var(--text-tertiary);
  font-size: 0.69rem;
}

.detail-count {
  flex: 0 0 auto;
  color: var(--text-tertiary);
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
}

.coach-submit {
  justify-content: center;
  gap: 0.45rem;
  width: 100%;
  min-height: 42px;
  margin-top: 0.75rem;
  border: 0;
  border-radius: var(--radius-lg);
  color: #fff;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  box-shadow: 0 8px 20px color-mix(in srgb, var(--primary-color) 20%, transparent);
  cursor: pointer;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
}

.coach-submit:disabled {
  opacity: 0.58;
  cursor: not-allowed;
}

.coach-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: coach-spin 0.8s linear infinite;
}

.coach-unavailable,
.coach-error {
  gap: 0.6rem;
  margin-bottom: 0.8rem;
  padding: 0.72rem 0.8rem;
  border-radius: var(--radius-lg);
}

.coach-unavailable {
  align-items: flex-start;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--surface-soft) 88%, transparent);
}

.coach-unavailable strong,
.coach-unavailable span {
  display: block;
}

.coach-unavailable strong {
  color: var(--text-primary);
  font-size: 0.8rem;
}

.coach-unavailable span {
  margin-top: 0.12rem;
  font-size: 0.72rem;
}

.coach-error {
  margin-top: 0.85rem;
  margin-bottom: 0;
  color: #a84c4c;
  background: rgba(254, 242, 242, 0.88);
}

.coach-error > span {
  flex: 1;
  font-size: 0.78rem;
}

.coach-result {
  margin-top: 0.85rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--primary-color) 18%, var(--border-color));
  border-radius: var(--radius-xl);
  background: var(--card-bg);
}

.coach-result header {
  gap: 0.8rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid var(--border-color);
}

.coach-result header > div {
  gap: 0.4rem;
  color: var(--primary-dark);
}

.coach-result header strong {
  font-size: 0.83rem;
}

.result-close {
  font: inherit;
  font-size: 0.72rem;
}

.coach-answer {
  overflow-wrap: anywhere;
  color: var(--text-primary);
  font-size: 0.86rem;
  line-height: 1.72;
  white-space: pre-wrap;
}

.coach-result > p {
  margin: 0.75rem 0 0;
  padding-top: 0.65rem;
  border-top: 1px solid var(--border-color);
  color: var(--text-tertiary);
  font-size: 0.68rem;
  line-height: 1.5;
}

.coach-panel-enter-active,
.coach-panel-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.coach-panel-enter-from,
.coach-panel-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@keyframes coach-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 980px) {
  .coach-task-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 540px) {
  .coach-card {
    padding: 1rem;
    border-radius: var(--radius-xl);
  }

  .coach-header {
    align-items: flex-start;
  }

  .coach-description {
    margin-left: 0;
  }

  .coach-context-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.5rem;
  }

  .coach-task-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .coach-task {
    min-height: 70px;
  }

  .composer-footer {
    align-items: flex-start;
  }

  .coach-privacy {
    align-items: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .coach-task,
  .task-arrow,
  .coach-panel-enter-active,
  .coach-panel-leave-active {
    transition: none;
  }

  .coach-task:hover,
  .coach-task.active {
    transform: none;
  }

  .coach-spinner {
    animation: none;
  }
}
</style>
