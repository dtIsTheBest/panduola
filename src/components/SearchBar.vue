<template>
  <div class="search-bar">
    <div class="search-input-wrapper">
      <Search :size="18" class="search-icon" />
      <input
        v-model="searchQuery"
        type="text"
        class="search-input"
        :placeholder="placeholder"
        @input="handleInput"
      />
      <button
        v-if="searchQuery"
        class="search-clear"
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
    default: '搜索链接、标签...'
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
  padding: 0.75rem 0;
}

.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.875rem;
  color: var(--text-secondary);
}

.search-input {
  width: 100%;
  padding: 0.625rem 0.875rem 0.625rem 2.5rem;
  font-size: 0.875rem;
  border: 1px solid var(--border-color);
  border-radius: 9999px;
  background-color: var(--card-bg);
  transition: all 0.2s ease;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
}

.search-clear {
  position: absolute;
  right: 0.75rem;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 50%;
  transition: background-color 0.2s ease;
}

.search-clear:hover {
  background-color: var(--border-color);
}
</style>
