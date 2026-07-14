<template>
  <div class="ai-search">
    <div class="ai-search-card">
      <div class="ai-search-header">
        <div class="ai-icon">
          <Brain :size="20" />
        </div>
        <div class="ai-title">AI 育儿助手</div>
        <div class="ai-settings" @click="showSettings = true">
          <Settings :size="16" />
        </div>
      </div>
      
      <div class="ai-search-input-wrapper">
        <input
          v-model="searchQuery"
          type="text"
          class="ai-search-input"
          :placeholder="loading ? 'AI正在思考中...' : '输入您的育儿问题，比如：宝宝辅食怎么添加？'"
          :disabled="loading"
          @keyup.enter="handleSearch"
        />
        <button class="ai-search-btn" @click="handleSearch" :disabled="loading || !searchQuery.trim()">
          <Search :size="18" />
        </button>
      </div>
      
      <div v-if="searchHistory.length > 0" class="ai-search-history">
        <span class="history-label">历史搜索</span>
        <div class="history-tags">
          <button 
            v-for="item in searchHistory" 
            :key="item" 
            class="history-tag"
            @click="searchQuery = item; handleSearch()"
          >
            {{ item }}
          </button>
        </div>
      </div>
      
      <div v-if="!loading && !searchQuery && !searchResult" class="ai-search-tips">
        <div class="tip-title">试试这些问题</div>
        <div class="tip-items">
          <button 
            v-for="tip in tips" 
            :key="tip" 
            class="tip-item"
            @click="searchQuery = tip; handleSearch()"
          >
            {{ tip }}
          </button>
        </div>
      </div>
      
      <div v-if="searchResult" class="ai-search-result">
        <div class="result-header">
          <Sparkles :size="16" />
          <span>AI回答</span>
          <span class="result-source">{{ currentProviderName }}</span>
          <button class="btn btn-secondary btn-sm" @click="searchResult = null">关闭</button>
        </div>
        <div class="result-content" v-html="formattedResult"></div>
      </div>
      
      <div v-if="loading" class="ai-search-loading">
        <div class="loading-dots">
          <span></span><span></span><span></span>
        </div>
        <span>正在为您查找育儿知识...</span>
      </div>
      
      <div v-if="error" class="ai-search-error">
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
    
    <div v-if="showSettings" class="ai-settings-modal">
      <div class="modal-overlay" @click="showSettings = false"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h3>AI 设置</h3>
          <button class="btn btn-secondary" @click="showSettings = false">
            <X :size="18" />
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>AI 服务提供商</label>
            <select v-model="provider" class="form-control">
              <option value="doubao">豆包（免费网页版，国内）</option>
              <option value="openai">OpenAI（需API Key）</option>
            </select>
            <p class="form-hint">{{ providerHint }}</p>
          </div>
          
          <div v-if="provider === 'openai'" class="form-group">
            <label>OpenAI API Key</label>
            <input
              v-model="apiKey"
              type="password"
              class="form-control"
              placeholder="sk-..."
            />
            <p class="form-hint">获取API Key：https://platform.openai.com/api-keys</p>
          </div>
          
          <div v-if="provider === 'openai'" class="form-group">
            <label>模型选择</label>
            <select v-model="model" class="form-control">
              <option value="gpt-4o-mini">GPT-4o Mini (推荐)</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" @click="showSettings = false">取消</button>
          <button class="btn btn-primary" @click="saveSettings">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Brain, Search, Settings, Sparkles, AlertCircle, X } from 'lucide-vue-next'

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
    return '豆包由字节跳动提供，免费使用，无需配置API Key'
  }
  return '需要配置OpenAI API Key才能使用'
})

const currentProviderName = computed(() => {
  return provider.value === 'doubao' ? '豆包' : 'OpenAI'
})

onMounted(() => {
  const savedProvider = localStorage.getItem('ai-provider')
  const savedKey = localStorage.getItem('openai-api-key')
  const savedModel = localStorage.getItem('openai-model')
  const savedHistory = localStorage.getItem('search-history')
  
  if (savedProvider) provider.value = savedProvider
  if (savedKey) apiKey.value = savedKey
  if (savedModel) model.value = savedModel
  if (savedHistory) searchHistory.value = JSON.parse(savedHistory)
})

const formattedResult = computed(() => {
  if (!searchResult.value) return ''
  
  return searchResult.value
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
    .replace(/^(.*)$/gm, '<p>$1</p>')
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
    error.value = '请先配置OpenAI API Key'
    showSettings.value = true
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
          content: '你是一位专业的育儿专家，擅长解答0-22岁宝宝的育儿问题。请用亲切、专业的语言回答，给出具体的建议和方法。'
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
    localStorage.setItem('search-history', JSON.stringify(searchHistory.value))
  }
}

function saveSettings() {
  localStorage.setItem('ai-provider', provider.value)
  localStorage.setItem('openai-api-key', apiKey.value)
  localStorage.setItem('openai-model', model.value)
  showSettings.value = false
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
</style>