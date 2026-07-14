<template>
  <header class="header">
    <div class="container">
      <div class="header-content">
        <button class="btn btn-secondary btn-sm menu-btn" @click="$emit('menu')">
          <Menu :size="20" />
        </button>
        <div class="logo" @click="$emit('view-change', 'dashboard')">
          <Sparkles :size="28" />
          <span class="logo-text">潘多拉</span>
          <span class="logo-subtitle">带娃百科导航</span>
        </div>
        <div class="header-nav">
          <button 
            class="nav-item" 
            :class="{ active: currentView === 'dashboard' }"
            @click="$emit('view-change', 'dashboard')"
          >
            <LayoutDashboard :size="16" />
            <span>首页</span>
          </button>
          <button 
            class="nav-item" 
            :class="{ active: currentView === 'links' }"
            @click="$emit('view-change', 'links')"
          >
            <Link :size="16" />
            <span>链接库</span>
          </button>
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
import { Sparkles, RefreshCw, Menu, LayoutDashboard, Link } from 'lucide-vue-next'

defineProps({
  currentView: String
})

defineEmits(['refresh', 'menu', 'view-change'])
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
  cursor: pointer;
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

.header-nav {
  display: flex;
  gap: 0.25rem;
  background-color: var(--bg-color);
  padding: 0.25rem;
  border-radius: var(--radius-md);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
  background-color: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

.nav-item:hover {
  color: var(--text-primary);
  background-color: rgba(0, 0, 0, 0.05);
}

.nav-item.active {
  background-color: var(--card-bg);
  color: var(--primary-color);
  box-shadow: var(--shadow-sm);
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
  
  .header-nav {
    display: none;
  }
}
</style>