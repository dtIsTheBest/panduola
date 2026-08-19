<template>
  <div class="search-bar">
    <div class="search-input-wrapper">
      <Search :size="18" class="search-icon" />
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        aria-label="搜索资源"
        :placeholder="placeholder"
        @input="handleInput"
      />
      <button
        v-if="searchQuery"
        class="search-clear"
        aria-label="清除搜索内容"
        title="清除搜索内容"
        @click="clear"
      >
        <X :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Search, X } from 'lucide-vue-next'

const props = defineProps({
  modelValue: String,
  placeholder: {
    type: String,
    default: '搜索标题、说明或标签'
  }
})

const emit = defineEmits(['update:modelValue'])

const searchQuery = ref(props.modelValue || '')

watch(() => props.modelValue, (val) => {
  searchQuery.value = val || ''
})

function handleInput() {
  emit('update:modelValue', searchQuery.value)
}

function clear() {
  searchQuery.value = ''
  emit('update:modelValue', '')
}
</script>

<style scoped>
.search-bar {
  flex: 1;
  min-width: min(100%, 260px);
  padding: 0;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 44px;
  background-color: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  transition:
    background-color var(--transition-fast),
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.search-icon {
  position: absolute;
  left: 0.95rem;
  color: var(--primary-dark);
  pointer-events: none;
}

.search-input {
  width: 100%;
  min-width: 0;
  padding: 0.68rem 2.7rem 0.68rem 2.6rem;
  font-size: 0.875rem;
  color: var(--text-primary);
  border: 0;
  border-radius: inherit;
  outline: 0;
  background-color: transparent;
}

.search-input::placeholder {
  color: var(--text-muted);
}

.search-input-wrapper:focus-within {
  background-color: white;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 4px var(--focus-ring);
}

.search-input:focus-visible {
  outline: 2px solid var(--primary-dark);
  outline-offset: 3px;
}

.search-clear {
  position: absolute;
  right: 0.45rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background-color: white;
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  border-radius: 50%;
  transition:
    color var(--transition-fast),
    background-color var(--transition-fast);
}

.search-clear:hover {
  color: var(--danger-dark);
  background-color: #fff1f2;
}
</style>
