<template>
  <header class="header">
    <div class="container">
      <div class="header-content">
        <button class="btn btn-secondary btn-sm menu-btn" @click="$emit('menu')">
          <Menu :size="20" />
        </button>
        <div class="logo">
          <Sparkles :size="28" />
          <span class="logo-text">潘多拉</span>
          <span class="logo-subtitle">带娃百科导航</span>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" @click="$emit('refresh')">
            <RefreshCw :size="16" />
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { Sparkles, RefreshCw, Menu } from 'lucide-vue-next'

defineEmits(['refresh', 'menu'])
</script>

<style scoped>
.header {
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0;
  gap: 0.75rem;
}

.menu-btn {
  display: none;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
}

.logo-text {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--primary-color);
}

.logo-subtitle {
  font-size: 0.75rem;
  color: var(--text-secondary);
  padding-left: 0.5rem;
  border-left: 1px solid var(--border-color);
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

@media (max-width: 768px) {
  .menu-btn {
    display: flex;
  }
  
  .logo-subtitle {
    display: none;
  }
}
</style>
