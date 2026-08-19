<template>
  <div class="ai-search">
    <div class="ai-search-card">
      <div class="ai-search-header">
        <div class="ai-icon">
          <Brain :size="20" />
        </div>
        <div class="ai-title">AI 成长助手</div>
        <button ref="settingsTrigger" type="button" class="ai-settings" aria-label="打开 AI 助手设置" title="打开 AI 助手设置" @click="openSettings">
          <Settings :size="16" />
        </button>
      </div>

      <div class="ai-search-input-wrapper">
        <input
          v-model="searchQuery"
          type="text"
          class="ai-search-input"
          aria-label="输入成长或育儿问题"
          :placeholder="loading ? '正在整理相关信息...' : '输入成长或育儿问题…'"
          :disabled="loading"
          @keyup.enter="handleSearch"
        />
        <button class="ai-search-btn" aria-label="提交问题" title="提交问题" @click="handleSearch" :disabled="loading || !searchQuery.trim()">
          <Search :size="18" />
        </button>
      </div>

      <div v-if="searchHistory.length > 0" class="ai-search-history">
        <span class="history-label">历史搜索</span>
        <div class="history-tags">
          <button
            v-for="item in searchHistory"
            :key="item"
            type="button"
            class="history-tag"
            @click="searchQuery = item; handleSearch()"
          >
            {{ item }}
          </button>
        </div>
      </div>

      <div v-if="!loading && !searchQuery && !searchResult" class="ai-search-tips">
        <div class="tip-title">你可以这样问</div>
        <div class="tip-items">
          <button
            v-for="tip in tips"
            :key="tip"
            type="button"
            class="tip-item"
            @click="searchQuery = tip; handleSearch()"
          >
            {{ tip }}
          </button>
        </div>
      </div>

      <div v-if="searchResult" class="ai-search-result" role="status" aria-live="polite">
        <div class="result-header">
          <Sparkles :size="16" />
          <span>AI 参考回答</span>
          <span class="result-source">{{ currentProviderName }}</span>
          <button class="btn btn-secondary btn-sm" @click="searchResult = null">关闭</button>
        </div>
        <div class="result-content">{{ searchResult }}</div>
        <p class="result-disclaimer">
          AI 内容仅供辅助参考，不能替代医生或其他专业人士的诊断；遇到呼吸困难、意识异常等紧急情况请立即就医。
        </p>
      </div>

      <div v-if="loading" class="ai-search-loading" role="status" aria-live="polite">
        <div class="loading-dots">
          <span></span><span></span><span></span>
        </div>
        <span>正在整理相关信息...</span>
      </div>

      <div v-if="error" class="ai-search-error" role="alert">
        <AlertCircle :size="16" />
        <span>{{ error }}</span>
        <button class="btn btn-secondary btn-sm" @click="error = null">重试</button>
      </div>

      <div v-if="showIframe" class="ai-search-iframe-container">
        <div class="iframe-header">
          <Sparkles :size="16" />
          <span>豆包 AI 对话</span>
          <button class="btn btn-secondary btn-sm" @click="showIframe = false">关闭</button>
        </div>
        <iframe
          class="ai-search-iframe"
          :src="doubaoUrl"
          title="豆包AI"
          sandbox="allow-scripts allow-same-origin allow-forms"
        ></iframe>
      </div>
    </div>

    <div v-if="showSettings" class="ai-settings-modal" @keydown="handleSettingsKeydown">
      <div class="modal-overlay" @click="closeSettings"></div>
      <div ref="settingsDialog" class="modal-content" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
        <div class="modal-header">
          <h3 id="ai-settings-title">AI 助手设置</h3>
          <button ref="settingsCloseButton" class="btn btn-secondary" aria-label="关闭 AI 设置" title="关闭" @click="closeSettings">
            <X :size="18" />
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="ai-provider">AI 服务提供商</label>
            <select id="ai-provider" v-model="provider" class="form-control">
              <option value="doubao">豆包（免费网页版，国内）</option>
              <option value="openai">OpenAI（需 API Key）</option>
            </select>
            <p class="form-hint">{{ providerHint }}</p>
          </div>

          <div v-if="provider === 'openai'" class="form-group">
            <label for="openai-api-key">OpenAI API Key</label>
            <input
              id="openai-api-key"
              v-model="apiKey"
              type="password"
              class="form-control"
              placeholder="sk-..."
            />
            <p class="form-hint">API Key 仅保存在当前会话内，关闭或刷新页面后需要重新填写。</p>
          </div>

          <div v-if="provider === 'openai'" class="form-group">
            <label for="openai-model">模型选择</label>
            <select id="openai-model" v-model="model" class="form-control">
              <option value="gpt-4o-mini">GPT-4o Mini（推荐）</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeSettings">取消</button>
          <button class="btn btn-primary" @click="saveSettings">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Brain, Search, Settings, Sparkles, AlertCircle, X } from 'lucide-vue-next'
import { useDialogFocus } from '@/composables/useDialogFocus'

const searchQuery = ref('')
const searchResult = ref('')
const loading = ref(false)
const error = ref('')
const showSettings = ref(false)
const showIframe = ref(false)
const provider = ref('doubao')
const apiKey = ref('')
const model = ref('gpt-4o-mini')
const searchHistory = ref([])
const settingsTrigger = ref(null)
const settingsDialog = ref(null)
const settingsCloseButton = ref(null)

const tips = [
  '宝宝辅食怎么添加？',
  '新生儿睡眠规律怎么培养？',
  '如何应对宝宝分离焦虑？',
  '疫苗接种时间表',
  '宝宝发烧怎么办？'
]

const doubaoUrl = computed(() => {
  const baseUrl = 'https://www.doubao.com'
  if (searchQuery.value.trim()) {
    return `${baseUrl}/chat?query=${encodeURIComponent(searchQuery.value)}`
  }
  return baseUrl + '/chat'
})

const providerHint = computed(() => {
  if (provider.value === 'doubao') {
    return '豆包由字节跳动提供，免费使用，无需配置 API Key'
  }
  return '需要配置 OpenAI API Key 才能使用'
})

const currentProviderName = computed(() => {
  return provider.value === 'doubao' ? '豆包' : 'OpenAI'
})

function openSettings() {
  showSettings.value = true
}

function closeSettings() {
  showSettings.value = false
}

const { handleDialogKeydown: handleSettingsKeydown } = useDialogFocus({
  isVisible: () => showSettings.value,
  dialogRef: settingsDialog,
  initialFocus: () => settingsCloseButton.value,
  fallbackFocus: () => settingsTrigger.value,
  onEscape: closeSettings
})

onMounted(() => {
  try {
    const savedProvider = localStorage.getItem('ai-provider')
    const savedModel = localStorage.getItem('openai-model')
    const savedHistory = localStorage.getItem('search-history')

    if (savedProvider) provider.value = savedProvider
    if (savedModel) model.value = savedModel
    if (savedHistory) {
      const parsedHistory = JSON.parse(savedHistory)
      if (Array.isArray(parsedHistory)) {
        searchHistory.value = parsedHistory.filter(item => typeof item === 'string').slice(0, 5)
      }
    }
  } catch {
    searchHistory.value = []
    try {
      localStorage.removeItem('search-history')
    } catch {
      // 存储不可用时保持内存中的空历史即可。
    }
  } finally {
    try {
      localStorage.removeItem('openai-api-key')
    } catch {
      // 旧 Key 清理失败时不阻断组件挂载。
    }
  }
})

async function handleSearch() {
  if (!searchQuery.value.trim()) return

  loading.value = true
  searchResult.value = ''
  error.value = ''
  showIframe.value = false

  try {
    if (provider.value === 'doubao') {
      await searchWithDoubao()
    } else {
      await searchWithOpenAI()
    }

    addToHistory(searchQuery.value)
  } catch (e) {
    console.error(e)
    error.value = '网络错误，请检查网络连接或稍后重试'
  } finally {
    loading.value = false
  }
}

async function searchWithDoubao() {
  showIframe.value = true
}

async function searchWithOpenAI() {
  if (!apiKey.value) {
    error.value = '请先配置 OpenAI API Key'
    openSettings()
    return
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey.value}`
    },
    body: JSON.stringify({
      model: model.value,
      messages: [
        {
          role: 'system',
          content: '你是一位专业的家庭成长助手，擅长解答0-22岁孩子成长与育儿相关问题。请用亲切、专业的语言回答，给出具体的建议和方法。'
        },
        {
          role: 'user',
          content: searchQuery.value
        }
      ],
      temperature: 0.7
    })
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI 请求失败（${response.status}）`)
  }

  if (data.choices && data.choices[0] && data.choices[0].message) {
    searchResult.value = data.choices[0].message.content
  } else {
    throw new Error('AI回答失败，请重试')
  }
}

function addToHistory(query) {
  if (!searchHistory.value.includes(query)) {
    searchHistory.value.unshift(query)
    if (searchHistory.value.length > 5) {
      searchHistory.value.pop()
    }
    try {
      localStorage.setItem('search-history', JSON.stringify(searchHistory.value))
    } catch {
      // 搜索本身已成功，本地历史写入失败不应覆盖回答。
    }
  }
}

function saveSettings() {
  try {
    localStorage.setItem('ai-provider', provider.value)
    localStorage.setItem('openai-model', model.value)
    localStorage.removeItem('openai-api-key')
  } catch {
    error.value = '设置暂时无法保存，但当前会话仍可继续使用'
  }
  closeSettings()
}
</script>

<style scoped>
.ai-search {
  width: 100%;
}

.ai-search-card {
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: var(--radius-xl);
  padding: 1.5rem;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

.ai-search-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.ai-icon {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.ai-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-settings {
  margin-left: auto;
  padding: 0.375rem;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-secondary);
}

.ai-settings:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.ai-search-input-wrapper {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.ai-search-input {
  flex: 1;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-lg);
  border: 2px solid var(--border-color);
  font-size: 0.9375rem;
  transition: all 0.2s ease;
  background-color: white;
}

.ai-search-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.ai-search-input:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.ai-search-btn {
  padding: 0.75rem 1.25rem;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--primary-color), var(--primary-light));
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-search-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.ai-search-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-search-history {
  margin-bottom: 1rem;
}

.history-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-right: 0.5rem;
}

.history-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.history-tag {
  padding: 0.25rem 0.625rem;
  background-color: white;
  border-radius: 9999px;
  font-size: 0.75rem;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s ease;
}

.history-tag:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.ai-search-tips {
  margin-top: 1rem;
}

.tip-title {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.tip-items {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.tip-item {
  padding: 0.375rem 0.75rem;
  background-color: rgba(99, 102, 241, 0.05);
  border-radius: var(--radius-md);
  font-size: 0.8125rem;
  color: var(--primary-color);
  border: 1px solid rgba(99, 102, 241, 0.1);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tip-item:hover {
  background-color: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.2);
}

.ai-search-result {
  margin-top: 1rem;
  background-color: white;
  border-radius: var(--radius-lg);
  padding: 1rem;
  border: 1px solid var(--border-color);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--border-color);
}

.result-header span {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.result-source {
  font-size: 0.75rem !important;
  font-weight: 400 !important;
  color: var(--text-secondary) !important;
  margin-left: auto;
  padding: 0.125rem 0.5rem;
  background-color: var(--bg-color);
  border-radius: 9999px;
}

.result-content {
  font-size: 0.9375rem;
  color: var(--text-primary);
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.result-content strong {
  color: var(--primary-color);
  font-weight: 600;
}

.result-content p {
  margin-bottom: 0.5rem;
}

.result-content p:last-child {
  margin-bottom: 0;
}

.result-disclaimer {
  margin: 0.9rem 0 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 0.76rem;
  line-height: 1.55;
}

.ai-search-loading {
  margin-top: 1rem;
  text-align: center;
  padding: 1.5rem;
}

.loading-dots {
  display: flex;
  justify-content: center;
  gap: 0.375rem;
  margin-bottom: 0.5rem;
}

.loading-dots span {
  width: 8px;
  height: 8px;
  background-color: var(--primary-color);
  border-radius: 50%;
  animation: dotBounce 1.4s infinite ease-in-out both;
}

.loading-dots span:nth-child(1) { animation-delay: -0.32s; }
.loading-dots span:nth-child(2) { animation-delay: -0.16s; }

@keyframes dotBounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.ai-search-loading span {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.ai-search-error {
  margin-top: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: rgba(239, 68, 68, 0.05);
  border-radius: var(--radius-md);
  color: #ef4444;
}

.ai-search-error span {
  flex: 1;
}

.ai-settings-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
}

.modal-content {
  position: relative;
  background-color: white;
  border-radius: var(--radius-xl);
  width: 90%;
  max-width: 480px;
  box-shadow: var(--shadow-xl);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-body {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 0.375rem;
}

.form-control {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  font-size: 0.9375rem;
  transition: all 0.2s ease;
}

.form-control:focus {
  outline: none;
  border-color: var(--primary-color);
}

.form-hint {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color);
}

.ai-search-iframe-container {
  margin-top: 1rem;
  background-color: white;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.iframe-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background-color: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
}

.iframe-header span {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}

.ai-search-iframe {
  width: 100%;
  height: 400px;
  border: none;
}

@media (max-width: 768px) {
  .ai-search-card {
    padding: 1rem;
  }

  .ai-search-input {
    padding: 0.625rem 0.75rem;
  }

  .ai-search-btn {
    padding: 0.625rem 1rem;
  }

  .tip-items {
    gap: 0.375rem;
  }

  .tip-item {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
  }

  .ai-search-iframe {
    height: 300px;
  }
}

/* Align the AI experience with the shared parenting theme. */
.ai-search-card {
  position: relative;
  padding: 1.25rem;
  background:
    radial-gradient(circle at 92% 12%, rgba(255, 122, 104, 0.13), transparent 13rem),
    linear-gradient(135deg, #ffffff 0%, #f0faf7 58%, #fff8eb 100%);
  border-color: rgba(40, 127, 116, 0.2);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.ai-search-card::before {
  content: "";
  position: absolute;
  top: -58px;
  right: -42px;
  width: 150px;
  height: 150px;
  border: 24px solid rgba(255, 255, 255, 0.54);
  border-radius: 50%;
  pointer-events: none;
}

.ai-search-card > * {
  position: relative;
  z-index: 1;
}

.ai-search-header {
  gap: 0.7rem;
  margin-bottom: 0.9rem;
}

.ai-icon {
  width: 42px;
  height: 42px;
  background: linear-gradient(135deg, var(--accent-color), #e45f67);
  border-radius: 1rem;
  box-shadow: 0 10px 22px rgba(228, 95, 103, 0.2);
}

.ai-title {
  font-size: 1rem;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 0.01em;
}

.ai-title::after {
  content: "辅助梳理问题，重要决定请咨询专业人士";
  display: block;
  margin-top: 0.05rem;
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 500;
}

.ai-settings {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-left: auto;
  padding: 0;
  color: var(--primary-dark);
  background-color: rgba(255, 255, 255, 0.78);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition:
    color var(--transition-fast),
    background-color var(--transition-fast),
    transform var(--transition-fast);
}

.ai-settings:hover {
  color: white;
  background-color: var(--primary-color);
  transform: rotate(7deg);
}

.ai-search-input-wrapper {
  gap: 0.6rem;
  margin-bottom: 0.9rem;
  padding: 0.4rem;
  background-color: rgba(255, 255, 255, 0.88);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}

.ai-search-input {
  min-width: 0;
  padding: 0.7rem 0.8rem;
  color: var(--text-primary);
  background-color: transparent;
  border: 0;
  border-radius: var(--radius-lg);
}

.ai-search-input::placeholder {
  color: var(--text-muted);
}

.ai-search-input:focus,
.ai-search-input:focus-visible {
  outline: 2px solid var(--primary-dark);
  outline-offset: 1px;
  border-color: transparent;
  box-shadow: none;
}

.ai-search-btn {
  flex: 0 0 auto;
  width: 46px;
  min-height: 44px;
  padding: 0;
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 18px rgba(40, 127, 116, 0.2);
}

.ai-search-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #236f67, #175e57);
  box-shadow: 0 10px 24px rgba(40, 127, 116, 0.26);
}

.history-label,
.tip-title {
  font-weight: 650;
  color: var(--text-secondary);
}

.history-tags,
.tip-items {
  gap: 0.45rem;
}

.history-tag,
.tip-item {
  min-height: 32px;
  padding: 0.35rem 0.68rem;
  color: var(--primary-dark);
  background-color: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(40, 127, 116, 0.18);
  border-radius: 999px;
  font-weight: 550;
}

.history-tag:hover,
.tip-item:hover {
  color: var(--primary-dark);
  background-color: var(--primary-soft);
  border-color: rgba(40, 127, 116, 0.36);
  transform: translateY(-1px);
}

.ai-search-result,
.ai-search-iframe-container {
  background-color: rgba(255, 255, 255, 0.94);
  border-color: var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}

.result-header,
.iframe-header {
  min-height: 44px;
}

.result-source {
  color: var(--primary-dark) !important;
  background-color: var(--primary-soft);
}

.result-content {
  color: var(--text-primary);
}

.result-content strong {
  color: var(--primary-dark);
  font-weight: 750;
}

.ai-search-loading {
  margin-top: 0.75rem;
  padding: 1rem;
  color: var(--text-secondary);
  background-color: rgba(255, 255, 255, 0.66);
  border-radius: var(--radius-lg);
}

.loading-dots span {
  background-color: var(--accent-color);
}

.ai-search-error {
  padding: 0.8rem;
  color: var(--danger-dark);
  background-color: #fff1f2;
  border: 1px solid rgba(196, 72, 84, 0.2);
  border-radius: var(--radius-lg);
}

.ai-settings-modal {
  padding: 1rem;
}

.ai-settings-modal .modal-overlay {
  background-color: var(--overlay-color);
  z-index: 0;
}

.ai-settings-modal .modal-content {
  position: relative;
  z-index: 1;
  width: min(100%, 480px);
  max-height: calc(100vh - 2rem);
  background-color: var(--card-bg);
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-xl);
  overflow-y: auto;
}

.modal-header {
  padding: 1rem 1.25rem;
  background: linear-gradient(135deg, var(--primary-soft), #fffaf1);
}

.modal-header h3 {
  font-size: 1.05rem;
  font-weight: 750;
}

.modal-header .btn {
  width: 38px;
  padding: 0;
}

.modal-body {
  padding: 1.25rem;
}

.form-group label {
  font-weight: 650;
}

.form-control {
  padding: 0.65rem 0.75rem;
  color: var(--text-primary);
  background-color: var(--surface-soft);
  border-color: var(--border-color);
}

.form-control:focus,
.form-control:focus-visible {
  outline: 2px solid var(--primary-dark);
  outline-offset: 2px;
  border-color: var(--primary-color);
  background-color: white;
  box-shadow: 0 0 0 4px var(--focus-ring);
}

.form-hint {
  color: var(--text-secondary);
  line-height: 1.5;
}

.modal-footer {
  padding: 0.9rem 1.25rem;
  background-color: var(--surface-soft);
}

.iframe-header {
  background: linear-gradient(90deg, var(--primary-soft), var(--surface-soft));
}

@media (max-width: 768px) {
  .ai-search-card {
    padding: 1rem;
    border-radius: var(--radius-xl);
  }

  .ai-search-input-wrapper {
    gap: 0.4rem;
  }

  .ai-search-input {
    padding: 0.65rem;
  }

  .ai-search-btn {
    width: 42px;
    min-height: 42px;
  }

  .history-tag,
  .tip-item {
    padding: 0.32rem 0.58rem;
  }
}

@media (max-width: 480px) {
  .ai-title::after {
    display: none;
  }

  .result-header,
  .iframe-header {
    flex-wrap: wrap;
  }

  .result-source {
    margin-left: 0;
  }

  .ai-settings-modal {
    align-items: flex-end;
    padding: 0.75rem;
  }

  .ai-settings-modal .modal-content {
    max-height: calc(100vh - 1.5rem);
    border-radius: var(--radius-xl);
  }
}
</style>
