<template>
  <div
    v-if="visible"
    class="modal-overlay account-overlay"
    @click.self="close"
    @keydown.stop="handleDialogKeydown"
  >
    <div
      ref="dialog"
      class="modal-content account-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-center-title"
    >
      <header class="account-modal-header">
        <div>
          <span class="account-eyebrow">账号与云同步</span>
          <h2 id="account-center-title">{{ modalTitle }}</h2>
          <p>{{ modalDescription }}</p>
        </div>
        <button
          ref="closeButton"
          type="button"
          class="btn btn-secondary account-close"
          aria-label="关闭账号与云同步"
          title="关闭"
          @click="close"
        >
          <X :size="18" />
        </button>
      </header>

      <div class="account-modal-body">
        <div class="sync-summary" :class="`status-${statusInfo.tone}`">
          <span class="sync-summary-icon" aria-hidden="true">
            <component :is="statusInfo.icon" :size="20" />
          </span>
          <div>
            <strong>{{ statusInfo.label }}</strong>
            <p>{{ statusInfo.description }}</p>
          </div>
          <span v-if="syncState.remoteRevision" class="revision-chip">
            rev {{ syncState.remoteRevision }}
          </span>
        </div>

        <p v-if="actionMessage" class="account-message success-message" role="status">
          {{ actionMessage }}
        </p>
        <p v-if="displayError" class="account-message error-message" role="alert">
          {{ displayError }}
        </p>

        <section v-if="!facade.isSyncAvailable" class="account-section local-only-section">
          <div class="section-heading">
            <HardDrive :size="20" />
            <div>
              <h3>当前为本地模式</h3>
              <p>数据继续保存在这台设备，可正常使用导入和导出。</p>
            </div>
          </div>
          <div class="notice-card">
            部署环境配置 Supabase 后，即可启用邮箱登录和跨设备恢复。
          </div>
          <button type="button" class="btn btn-secondary full-width" @click="$emit('export-data')">
            <Download :size="16" /> 导出本地备份
          </button>
        </section>

        <section v-else-if="!isSignedIn" class="account-section login-section">
          <form v-if="loginStep === 'email'" @submit.prevent="requestCode">
            <div class="form-group">
              <label class="form-label" for="account-email">邮箱地址</label>
              <input
                id="account-email"
                ref="emailInput"
                v-model.trim="email"
                type="email"
                class="form-input"
                autocomplete="email"
                placeholder="name@example.com"
                required
                :disabled="actionBusy"
              />
            </div>
            <button type="submit" class="btn btn-primary full-width" :disabled="actionBusy">
              <Mail :size="17" />
              {{ actionBusy ? '发送中…' : '发送六位验证码' }}
            </button>
          </form>

          <form v-else @submit.prevent="verifyCode">
            <button type="button" class="login-back" :disabled="actionBusy" @click="loginStep = 'email'">
              <ArrowLeft :size="15" /> 修改邮箱
            </button>
            <div class="otp-copy">
              验证码已发送至 <strong>{{ email }}</strong>
            </div>
            <div class="form-group">
              <label class="form-label" for="account-otp">六位验证码</label>
              <input
                id="account-otp"
                ref="otpInput"
                v-model.trim="otp"
                type="text"
                class="form-input otp-input"
                autocomplete="one-time-code"
                inputmode="numeric"
                maxlength="6"
                pattern="[0-9]{6}"
                placeholder="000000"
                required
                :disabled="actionBusy"
              />
            </div>
            <button type="submit" class="btn btn-primary full-width" :disabled="actionBusy">
              <LogIn :size="17" />
              {{ actionBusy ? '登录中…' : '验证并登录' }}
            </button>
            <button
              type="button"
              class="btn btn-secondary full-width resend-button"
              :disabled="actionBusy || cooldown > 0"
              @click="requestCode"
            >
              {{ cooldown > 0 ? `${cooldown} 秒后可重新发送` : '重新发送验证码' }}
            </button>
          </form>
        </section>

        <template v-else>
          <section class="account-section profile-section">
            <div class="profile-avatar"><UserRound :size="24" /></div>
            <div class="profile-copy">
              <h3>{{ accountState.session?.email }}</h3>
              <p>个人数据空间已启用</p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" :disabled="actionBusy" @click="logout">
              退出登录
            </button>
          </section>

          <section v-if="pendingMigration" class="account-section decision-section">
            <div class="section-heading warning-heading">
              <GitCompareArrows :size="20" />
              <div>
                <h3>选择首次同步方式</h3>
                <p>本机和云端都有数据，请确认保留哪一份。</p>
              </div>
            </div>
            <div class="decision-grid">
              <button type="button" class="decision-card" :disabled="actionBusy" @click="resolveFirst('upload-local')">
                <Laptop :size="20" />
                <strong>保留本机</strong>
                <span>将当前本机数据上传到云端</span>
              </button>
              <button type="button" class="decision-card" :disabled="actionBusy" @click="resolveFirst('use-cloud')">
                <CloudDownload :size="20" />
                <strong>使用云端</strong>
                <span>先备份本机数据，再恢复云端</span>
              </button>
              <button type="button" class="decision-card" :disabled="actionBusy" @click="resolveFirst('keep-both')">
                <CopyPlus :size="20" />
                <strong>保留两份</strong>
                <span>云端版本进入恢复副本，本机继续使用</span>
              </button>
            </div>
          </section>

          <section v-if="pendingConflict" class="account-section decision-section conflict-section">
            <div class="section-heading danger-heading">
              <TriangleAlert :size="20" />
              <div>
                <h3>{{ pendingConflict.local ? '检测到其他标签页修改' : '检测到多设备冲突' }}</h3>
                <p>系统没有自动覆盖任何一份数据。</p>
              </div>
            </div>
            <button
              v-if="pendingConflict.local"
              type="button"
              class="btn btn-primary full-width"
              :disabled="actionBusy"
              @click="syncNow"
            >
              重新加载并同步
            </button>
            <div v-else class="decision-grid">
              <button type="button" class="decision-card" :disabled="actionBusy" @click="resolveConflict('keep-local')">
                <Laptop :size="20" />
                <strong>保留本机</strong>
                <span>备份云端版本后上传本机数据</span>
              </button>
              <button type="button" class="decision-card" :disabled="actionBusy" @click="resolveConflict('use-cloud')">
                <CloudDownload :size="20" />
                <strong>使用云端</strong>
                <span>备份本机版本后使用云端数据</span>
              </button>
              <button type="button" class="decision-card" :disabled="actionBusy" @click="resolveConflict('keep-both')">
                <CopyPlus :size="20" />
                <strong>保留两份</strong>
                <span>保留恢复副本并继续使用本机</span>
              </button>
            </div>
          </section>

          <section class="account-section sync-details-section">
            <div class="section-title-row">
              <div>
                <h3>同步详情</h3>
                <p>{{ lastSyncedText }}</p>
              </div>
              <button type="button" class="btn btn-primary btn-sm" :disabled="actionBusy || syncState.status === 'syncing'" @click="syncNow">
                <RefreshCw :size="15" :class="{ spinning: syncState.status === 'syncing' }" />
                立即同步
              </button>
            </div>
            <dl class="sync-metadata-grid">
              <div><dt>状态</dt><dd>{{ statusInfo.label }}</dd></div>
              <div><dt>本地修改</dt><dd>{{ syncState.isDirty ? '待上传' : '已保存' }}</dd></div>
              <div><dt>云端版本</dt><dd>{{ syncState.remoteRevision ?? '尚未创建' }}</dd></div>
            </dl>
          </section>

          <section class="account-section recovery-section">
            <div class="section-title-row">
              <div>
                <h3>恢复副本</h3>
                <p>冲突或覆盖前自动保留，最多五份。</p>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" :disabled="actionBusy" @click="loadRecoveryCopies">
                <RefreshCw :size="14" /> 刷新
              </button>
            </div>
            <div v-if="recoveryLoading" class="recovery-empty">正在读取恢复副本…</div>
            <div v-else-if="!recoveryCopies.length" class="recovery-empty">暂无恢复副本</div>
            <ul v-else class="recovery-list">
              <li v-for="copy in recoveryCopies" :key="copy.id">
                <div>
                  <strong>{{ recoveryReason(copy.reason) }}</strong>
                  <span>{{ formatTime(copy.createdAt) }} · {{ copy.source === 'cloud' ? '云端版本' : '本地版本' }}</span>
                </div>
                <div class="recovery-actions">
                  <button type="button" class="btn btn-secondary btn-sm" @click="exportRecovery(copy)">导出</button>
                  <button type="button" class="btn btn-primary btn-sm" :disabled="actionBusy" @click="restoreRecovery(copy)">恢复</button>
                </div>
              </li>
            </ul>
          </section>

          <section class="account-section account-tools-section">
            <button type="button" class="btn btn-secondary" @click="$emit('export-data')">
              <Download :size="16" /> 导出业务数据
            </button>
            <button type="button" class="btn btn-secondary" :disabled="actionBusy" @click="exportDiagnostics">
              <FileJson :size="16" /> 导出诊断信息
            </button>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import {
  ArrowLeft,
  CheckCircle2,
  Cloud,
  CloudDownload,
  CloudOff,
  CopyPlus,
  Download,
  FileJson,
  GitCompareArrows,
  HardDrive,
  Laptop,
  LoaderCircle,
  LogIn,
  Mail,
  RefreshCw,
  TriangleAlert,
  UserRound,
  WifiOff,
  X
} from 'lucide-vue-next'
import { useDialogFocus } from '@/composables/useDialogFocus'

const props = defineProps({
  visible: Boolean,
  facade: {
    type: Object,
    required: true
  },
  triggerElement: Object
})

const emit = defineEmits(['close', 'export-data'])
const dialog = ref(null)
const closeButton = ref(null)
const emailInput = ref(null)
const otpInput = ref(null)
const email = ref('')
const otp = ref('')
const loginStep = ref('email')
const cooldown = ref(0)
const actionBusy = ref(false)
const actionError = ref('')
const actionMessage = ref('')
const recoveryCopies = ref([])
const recoveryLoading = ref(false)
let cooldownTimer = null
let recoveryRequestId = 0
let recoveryOwnerId = null

const accountState = computed(() => props.facade.accountState)
const syncState = computed(() => props.facade.syncState)
const isSignedIn = computed(() => accountState.value.status === 'signed-in')
const pendingMigration = computed(() => props.facade.pendingMigration)
const pendingConflict = computed(() => props.facade.pendingConflict)
const hasPendingMigration = computed(() => Boolean(pendingMigration.value))
const hasPendingConflict = computed(() => Boolean(pendingConflict.value))
const sessionUserId = computed(() => accountState.value.session?.userId ?? null)

const statusMap = {
  disabled: { label: '本地模式', description: '数据仅保存在当前设备', tone: 'neutral', icon: HardDrive },
  'signed-out': { label: '未登录', description: '登录后可跨设备恢复数据', tone: 'neutral', icon: CloudOff },
  initializing: { label: '正在初始化', description: '正在检查云端数据', tone: 'info', icon: LoaderCircle },
  idle: { label: '已同步', description: '本地与云端数据一致', tone: 'success', icon: CheckCircle2 },
  dirty: { label: '等待同步', description: '修改已保存到本地', tone: 'warning', icon: Cloud },
  syncing: { label: '同步中', description: '正在安全上传最新数据', tone: 'info', icon: LoaderCircle },
  offline: { label: '离线等待', description: '联网后会自动继续同步', tone: 'warning', icon: WifiOff },
  conflict: { label: '需要确认', description: '检测到两份不同的数据', tone: 'danger', icon: TriangleAlert },
  error: { label: '同步异常', description: '本地数据仍然安全', tone: 'danger', icon: TriangleAlert },
  restoring: { label: '恢复登录中', description: '本地数据已经可以使用', tone: 'info', icon: LoaderCircle },
  switching: { label: '切换账号中', description: '正在加载个人数据空间', tone: 'info', icon: LoaderCircle }
}

const errorMessages = {
  CONFIG_MISSING: '云同步尚未配置，本地功能仍可正常使用。',
  INVALID_EMAIL: '请输入有效的邮箱地址。',
  INVALID_OTP: '请输入正确的六位验证码。',
  OTP_EXPIRED: '验证码已过期，请重新发送。',
  OTP_RATE_LIMITED: '验证码请求过于频繁，请稍后再试。',
  SESSION_EXPIRED: '登录状态已过期，请重新登录。',
  OFFLINE: '当前网络不可用，修改仍已保存在本地。',
  REMOTE_UNAVAILABLE: '云同步服务暂时不可用，请稍后重试。',
  UNAUTHORIZED: '账号权限异常，请重新登录。',
  REVISION_CONFLICT: '云端数据已变化，请选择要保留的版本。',
  SNAPSHOT_TOO_LARGE: '数据量超过同步上限，请先导出并精简数据。',
  LOCAL_STORAGE_FAILED: '本地存储失败，请先导出备份并检查可用空间。',
  RECOVERY_WRITE_FAILED: '恢复副本保存失败，系统已停止覆盖数据。',
  LOCAL_REVISION_CONFLICT: '其他标签页更新了数据，请重新加载后再试。'
}

const statusInfo = computed(() => {
  if (['restoring', 'switching'].includes(accountState.value.status)) {
    return statusMap[accountState.value.status]
  }
  return statusMap[syncState.value.status]
    ?? statusMap[accountState.value.status]
    ?? statusMap.error
})
const modalTitle = computed(() => (
  isSignedIn.value ? '个人数据空间' : '登录并保护数据'
))
const modalDescription = computed(() => (
  isSignedIn.value
    ? '查看同步状态、处理冲突或恢复历史副本'
    : '使用邮箱验证码登录，无需设置密码'
))
const displayError = computed(() => {
  if (actionError.value) return actionError.value
  const errorCode = accountState.value.errorCode ?? syncState.value.errorCode
  return errorCode ? (errorMessages[errorCode] ?? `操作失败（${errorCode}）`) : ''
})
const lastSyncedText = computed(() => (
  syncState.value.lastSyncedAt
    ? `最近同步：${formatTime(syncState.value.lastSyncedAt)}`
    : '尚未完成首次云端同步'
))

const { handleDialogKeydown } = useDialogFocus({
  isVisible: () => props.visible,
  dialogRef: dialog,
  initialFocus: () => {
    if (!props.facade.isSyncAvailable || isSignedIn.value) return closeButton.value
    return loginStep.value === 'otp' ? otpInput.value : emailInput.value
  },
  fallbackFocus: () => props.triggerElement,
  onEscape: close
})

watch([() => props.visible, sessionUserId], async ([visible, userId]) => {
  recoveryRequestId += 1
  recoveryOwnerId = null
  recoveryCopies.value = []
  if (!visible) return
  clearFeedback()
  if (userId) await loadRecoveryCopies()
  await nextTick()
}, { flush: 'post' })

watch(
  [loginStep, isSignedIn, hasPendingMigration, hasPendingConflict],
  async () => {
    if (!props.visible) return
    await nextTick()
    if (!isSignedIn.value && props.facade.isSyncAvailable) {
      const input = loginStep.value === 'otp' ? otpInput.value : emailInput.value
      input?.focus()
      return
    }
    closeButton.value?.focus()
  },
  { flush: 'post' }
)

onUnmounted(stopCooldown)

function clearFeedback() {
  actionError.value = ''
  actionMessage.value = ''
}

function setError(error) {
  const code = error?.code
  actionError.value = errorMessages[code] ?? error?.message ?? '操作失败，请稍后重试。'
  if (code === 'OTP_RATE_LIMITED') {
    startCooldown(error?.retryAfter ?? 60)
  }
}

async function runAction(
  operation,
  successMessage = '',
  isSuccessful = result => result !== false
) {
  if (actionBusy.value) return false
  actionBusy.value = true
  clearFeedback()
  try {
    const result = await operation()
    if (!isSuccessful(result)) return false
    actionMessage.value = successMessage
    return true
  } catch (error) {
    setError(error)
    return false
  } finally {
    actionBusy.value = false
  }
}

async function requestCode() {
  const succeeded = await runAction(
    () => props.facade.requestLoginCode(email.value),
    '验证码已发送，请检查邮箱。'
  )
  if (!succeeded) return
  loginStep.value = 'otp'
  otp.value = ''
  startCooldown()
  await nextTick()
  otpInput.value?.focus()
}

async function verifyCode() {
  const succeeded = await runAction(
    () => props.facade.verifyLoginCode(email.value, otp.value),
    '登录成功，个人数据空间已启用。'
  )
  if (!succeeded) return
  otp.value = ''
  await loadRecoveryCopies()
}

async function logout() {
  const succeeded = await runAction(
    () => props.facade.logout(),
    '已安全退出，当前显示游客数据。'
  )
  if (!succeeded) return
  loginStep.value = 'email'
  recoveryCopies.value = []
}

async function syncNow() {
  await runAction(
    () => props.facade.syncNow(),
    '同步请求已完成。',
    result => !['conflict', 'error', 'offline'].includes(result?.status)
  )
}

async function resolveFirst(strategy) {
  const succeeded = await runAction(
    () => props.facade.resolveFirstLogin(strategy),
    '首次同步方案已应用。',
    () => !props.facade.pendingMigration
  )
  if (succeeded) await loadRecoveryCopies()
}

async function resolveConflict(strategy) {
  const succeeded = await runAction(
    () => props.facade.resolveConflict(strategy),
    '冲突已安全处理。',
    () => !props.facade.pendingConflict
  )
  if (succeeded) await loadRecoveryCopies()
}

async function loadRecoveryCopies() {
  if (!isSignedIn.value) return
  const requestId = ++recoveryRequestId
  const userId = sessionUserId.value
  recoveryLoading.value = true
  try {
    const copies = await props.facade.listRecoveryCopies()
    if (
      requestId !== recoveryRequestId ||
      userId !== sessionUserId.value ||
      !props.visible
    ) return
    recoveryOwnerId = userId
    recoveryCopies.value = copies
  } catch (error) {
    if (requestId === recoveryRequestId && userId === sessionUserId.value) {
      setError(error)
    }
  } finally {
    if (requestId === recoveryRequestId) recoveryLoading.value = false
  }
}

async function restoreRecovery(copy) {
  if (!recoveryOwnerId || recoveryOwnerId !== sessionUserId.value) {
    actionError.value = '账号已变化，请刷新恢复副本后再操作。'
    return
  }
  if (!confirm('恢复此副本将替换当前数据，系统会先备份当前版本。确定继续吗？')) return
  const succeeded = await runAction(
    () => props.facade.restoreRecoveryCopy(copy.id),
    '恢复副本已应用，并进入待同步状态。'
  )
  if (succeeded) await loadRecoveryCopies()
}

function exportRecovery(copy) {
  if (!recoveryOwnerId || recoveryOwnerId !== sessionUserId.value) {
    actionError.value = '账号已变化，请刷新恢复副本后再导出。'
    return
  }
  downloadJson(
    `panduola-recovery-${copy.createdAt.slice(0, 10)}.json`,
    { ...copy.snapshot, recoveredFrom: copy.id, exportedAt: new Date().toISOString() }
  )
}

async function exportDiagnostics() {
  const succeeded = await runAction(async () => {
    const report = await props.facade.exportDiagnosticReport()
    downloadJson(
      `panduola-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      report
    )
  }, '诊断信息已导出。')
  return succeeded
}

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json'
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

function startCooldown(seconds = 60) {
  stopCooldown()
  cooldown.value = Math.max(1, Math.ceil(seconds))
  cooldownTimer = window.setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0) stopCooldown()
  }, 1000)
}

function stopCooldown() {
  if (cooldownTimer !== null) window.clearInterval(cooldownTimer)
  cooldownTimer = null
  cooldown.value = 0
}

function recoveryReason(reason) {
  return {
    'first-login': '首次登录备份',
    'revision-conflict': '同步冲突备份',
    'manual-import': '手动操作备份'
  }[reason] ?? '恢复副本'
}

function formatTime(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function close() {
  if (actionBusy.value) return
  emit('close')
}
</script>

<style scoped>
.account-overlay {
  z-index: 1600;
}

.account-modal {
  width: min(680px, calc(100vw - 2rem));
  max-height: min(820px, calc(100vh - 2rem));
  overflow: hidden;
}

.account-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.35rem 1.5rem;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
  background:
    radial-gradient(circle at 92% 8%, rgba(255, 175, 128, 0.28), transparent 11rem),
    linear-gradient(135deg, var(--primary-soft), var(--surface-soft));
}

.account-eyebrow {
  display: block;
  margin-bottom: 0.3rem;
  color: var(--primary-color);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.account-modal-header h2 {
  margin: 0;
  font-size: 1.28rem;
  font-weight: 800;
}

.account-modal-header p {
  margin: 0.35rem 0 0;
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.account-close {
  flex: 0 0 auto;
  width: 38px;
  min-height: 38px;
  padding: 0;
  border-radius: 50%;
}

.account-modal-body {
  display: grid;
  gap: 1rem;
  max-height: calc(100vh - 10rem);
  padding: 1.15rem 1.5rem 1.5rem;
  overflow-y: auto;
}

.sync-summary {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--surface-soft);
}

.sync-summary-icon {
  display: grid;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.82);
}

.sync-summary strong {
  display: block;
  font-size: 0.9rem;
}

.sync-summary p {
  margin: 0.14rem 0 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.status-success { color: #18775f; border-color: rgba(24, 119, 95, 0.24); background: #effaf6; }
.status-warning { color: #9a6814; border-color: rgba(198, 135, 25, 0.25); background: #fff9ea; }
.status-danger { color: #b44949; border-color: rgba(190, 70, 70, 0.24); background: #fff3f2; }
.status-info { color: #376f91; border-color: rgba(55, 111, 145, 0.22); background: #eff8fc; }
.status-neutral { color: var(--text-secondary); }

.revision-chip {
  margin-left: auto;
  padding: 0.25rem 0.5rem;
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.68rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 999px;
}

.account-message {
  margin: 0;
  padding: 0.72rem 0.85rem;
  border-radius: var(--radius-md);
  font-size: 0.8rem;
}

.success-message { color: #176d58; background: #effaf6; }
.error-message { color: #a93e3e; background: #fff0ef; }

.account-section {
  padding: 1rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--card-bg);
}

.login-section {
  max-width: 450px;
  width: 100%;
  margin: 0 auto;
}

.login-section form {
  display: grid;
  gap: 0.85rem;
}

.full-width { width: 100%; }

.login-back {
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  width: fit-content;
  padding: 0;
  color: var(--primary-color);
  font-size: 0.76rem;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.otp-copy {
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.otp-input {
  font-size: 1.3rem;
  font-weight: 750;
  letter-spacing: 0.34em;
  text-align: center;
}

.resend-button { margin-top: -0.25rem; }

.section-heading,
.section-title-row,
.profile-section {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.section-heading h3,
.section-title-row h3,
.profile-section h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 0.92rem;
}

.section-heading p,
.section-title-row p,
.profile-section p {
  margin: 0.18rem 0 0;
  color: var(--text-secondary);
  font-size: 0.76rem;
}

.notice-card {
  margin: 0.8rem 0;
  padding: 0.75rem;
  color: var(--text-secondary);
  font-size: 0.78rem;
  background: var(--surface-soft);
  border-radius: var(--radius-md);
}

.profile-avatar {
  display: grid;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  place-items: center;
  color: white;
  background: linear-gradient(135deg, var(--primary-color), #65b6a7);
  border-radius: 50%;
}

.profile-copy {
  flex: 1;
  min-width: 0;
}

.profile-copy h3 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.decision-section {
  border-color: rgba(206, 145, 37, 0.28);
  background: #fffcf4;
}

.conflict-section {
  border-color: rgba(190, 70, 70, 0.24);
  background: #fff8f7;
}

.warning-heading { color: #9a6814; }
.danger-heading { color: #b44949; }

.decision-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
  margin-top: 0.85rem;
}

.decision-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-height: 122px;
  padding: 0.85rem;
  color: var(--text-primary);
  text-align: left;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: transform var(--transition-fast), border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.decision-card:hover:not(:disabled) {
  border-color: var(--primary-color);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.decision-card strong {
  margin-top: 0.6rem;
  font-size: 0.82rem;
}

.decision-card span {
  margin-top: 0.22rem;
  color: var(--text-secondary);
  font-size: 0.7rem;
  line-height: 1.45;
}

.section-title-row {
  justify-content: space-between;
}

.sync-metadata-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
  margin: 0.85rem 0 0;
}

.sync-metadata-grid div {
  padding: 0.65rem;
  background: var(--surface-soft);
  border-radius: var(--radius-md);
}

.sync-metadata-grid dt {
  color: var(--text-secondary);
  font-size: 0.66rem;
}

.sync-metadata-grid dd {
  margin: 0.22rem 0 0;
  color: var(--text-primary);
  font-size: 0.78rem;
  font-weight: 700;
}

.recovery-empty {
  margin-top: 0.8rem;
  padding: 0.8rem;
  color: var(--text-secondary);
  font-size: 0.76rem;
  text-align: center;
  background: var(--surface-soft);
  border-radius: var(--radius-md);
}

.recovery-list {
  display: grid;
  gap: 0.55rem;
  margin: 0.8rem 0 0;
  padding: 0;
  list-style: none;
}

.recovery-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  padding: 0.7rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
}

.recovery-list strong,
.recovery-list span {
  display: block;
}

.recovery-list strong { font-size: 0.78rem; }
.recovery-list span { margin-top: 0.15rem; color: var(--text-secondary); font-size: 0.68rem; }

.recovery-actions,
.account-tools-section {
  display: flex;
  gap: 0.45rem;
}

.account-tools-section .btn { flex: 1; }

.spinning { animation: account-spin 0.8s linear infinite; }

@keyframes account-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 600px) {
  .account-modal {
    width: calc(100vw - 1rem);
    max-height: calc(100vh - 1rem);
  }

  .account-modal-header,
  .account-modal-body {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .decision-grid,
  .sync-metadata-grid {
    grid-template-columns: 1fr;
  }

  .decision-card { min-height: 98px; }

  .profile-section,
  .section-title-row,
  .recovery-list li {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .profile-copy { width: calc(100% - 60px); }
  .recovery-actions { width: 100%; }
  .recovery-actions .btn { flex: 1; }
  .account-tools-section { flex-direction: column; }
}
</style>
