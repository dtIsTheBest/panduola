<template>
  <header class="header">
    <div class="container">
      <div class="header-content">
        <button class="btn btn-secondary btn-sm menu-btn" aria-label="打开年龄阶段导航" title="打开年龄阶段导航" @click="$emit('menu', $event.currentTarget)">
          <Menu :size="20" />
        </button>
        <button type="button" class="logo" aria-label="返回首页" @click="$emit('view-change', 'dashboard')">
          <Sprout :size="28" />
          <span class="logo-text">岁序成章</span>
          <span class="logo-subtitle">全龄家庭成长指南</span>
        </button>
        <div class="header-nav">
          <button 
            class="nav-item" 
            :class="{ active: currentView === 'dashboard' }"
            :aria-current="currentView === 'dashboard' ? 'page' : undefined"
            @click="$emit('view-change', 'dashboard')"
          >
            <LayoutDashboard :size="16" />
            <span>概览</span>
          </button>
          <button 
            class="nav-item" 
            :class="{ active: currentView === 'links' }"
            :aria-current="currentView === 'links' ? 'page' : undefined"
            @click="$emit('view-change', 'links')"
          >
            <Link :size="16" />
            <span>资源库</span>
          </button>
        </div>
        <div class="header-actions">
          <button
            type="button"
            class="account-trigger"
            :class="`sync-${syncTone}`"
            :aria-label="accountAriaLabel"
            :title="accountAriaLabel"
            aria-haspopup="dialog"
            :aria-expanded="accountOpen"
            @click="$emit('account', $event.currentTarget)"
          >
            <span class="account-trigger-icon" aria-hidden="true">
              <UserRound v-if="accountState?.status === 'signed-in'" :size="17" />
              <CloudOff v-else-if="!syncAvailable" :size="17" />
              <LoaderCircle v-else-if="isBusyState" :size="17" class="spinning" />
              <Cloud v-else :size="17" />
            </span>
            <span class="account-trigger-copy">
              <strong>{{ accountLabel }}</strong>
              <small>{{ syncLabel }}</small>
            </span>
            <span class="sync-dot" aria-hidden="true"></span>
          </button>
          <button class="btn btn-secondary" aria-label="刷新页面" title="刷新页面" @click="$emit('refresh')">
            <RefreshCw :size="16" />
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue'
import {
  Cloud,
  CloudOff,
  LayoutDashboard,
  Link,
  LoaderCircle,
  Menu,
  RefreshCw,
  Sprout,
  UserRound
} from 'lucide-vue-next'

const props = defineProps({
  currentView: String,
  accountState: Object,
  syncState: Object,
  syncAvailable: Boolean,
  accountOpen: Boolean
})

defineEmits(['refresh', 'menu', 'view-change', 'account'])

const accountLabel = computed(() => {
  if (!props.syncAvailable) return '本地模式'
  if (props.accountState?.status === 'signed-in') {
    return props.accountState.session?.email ?? '个人账号'
  }
  if (props.accountState?.status === 'restoring') return '恢复登录中'
  return '登录'
})

const syncLabelMap = {
  disabled: '仅本机',
  'signed-out': '未开启同步',
  initializing: '初始化中',
  idle: '已同步',
  dirty: '等待同步',
  syncing: '同步中',
  offline: '离线等待',
  conflict: '需要确认',
  error: '同步异常'
}

const syncLabel = computed(() => (
  syncLabelMap[props.syncState?.status]
  ?? syncLabelMap[props.accountState?.status]
  ?? '查看状态'
))
const syncTone = computed(() => {
  const status = props.syncState?.status
  if (status === 'idle') return 'success'
  if (status === 'dirty' || status === 'offline') return 'warning'
  if (status === 'conflict' || status === 'error') return 'danger'
  if (status === 'syncing' || status === 'initializing') return 'info'
  return 'neutral'
})
const isBusyState = computed(() => (
  ['restoring', 'switching'].includes(props.accountState?.status)
  || ['initializing', 'syncing'].includes(props.syncState?.status)
))
const accountAriaLabel = computed(() => (
  `${accountLabel.value}，${syncLabel.value}，打开账号与云同步`
))
</script>

<style scoped>
.header {
  min-height: var(--header-height);
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.97), rgba(242, 251, 248, 0.97));
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 5px 18px rgba(41, 84, 76, 0.05);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: var(--header-height);
  padding: 0.6rem 0;
  gap: 1rem;
}

.menu-btn {
  display: none;
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  flex: 1;
  min-width: 0;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.logo > :deep(svg) {
  box-sizing: content-box;
  padding: 0.48rem;
  color: white;
  background: linear-gradient(135deg, var(--primary-color), #d99a2b);
  border-radius: 0.9rem;
  box-shadow: 0 9px 20px rgba(31, 118, 108, 0.22);
}

.logo-text {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--primary-dark);
  letter-spacing: 0.02em;
}

.logo-subtitle {
  font-size: 0.76rem;
  font-weight: 550;
  color: var(--text-secondary);
  padding-left: 0.65rem;
  border-left: 1px solid var(--border-color);
}

.header-nav {
  display: flex;
  gap: 0.35rem;
  background-color: var(--surface-muted);
  padding: 0.3rem;
  border: 1px solid rgba(200, 221, 215, 0.72);
  border-radius: var(--radius-lg);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  min-height: 36px;
  padding: 0.42rem 0.82rem;
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--text-secondary);
  background-color: transparent;
  border: none;
  cursor: pointer;
  transition:
    color var(--transition-fast),
    background-color var(--transition-fast),
    box-shadow var(--transition-base),
    transform var(--transition-fast);
}

.nav-item:hover {
  color: var(--primary-dark);
  background-color: rgba(255, 255, 255, 0.72);
}

.nav-item.active {
  background-color: var(--card-bg);
  color: var(--primary-dark);
  box-shadow: var(--shadow-sm);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.header-actions .btn {
  width: 40px;
  padding: 0;
  color: var(--primary-dark);
}

.account-trigger {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 40px;
  max-width: 220px;
  padding: 0.32rem 0.62rem 0.32rem 0.38rem;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
}

.account-trigger:hover {
  border-color: var(--primary-color);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.account-trigger-icon {
  display: grid;
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  place-items: center;
  color: var(--primary-dark);
  background: var(--primary-soft);
  border-radius: 50%;
}

.account-trigger-copy {
  min-width: 0;
  text-align: left;
}

.account-trigger-copy strong,
.account-trigger-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-trigger-copy strong {
  font-size: 0.74rem;
  font-weight: 750;
}

.account-trigger-copy small {
  margin-top: 0.04rem;
  color: var(--text-secondary);
  font-size: 0.62rem;
}

.sync-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  background: #94a3b8;
  border-radius: 50%;
}

.sync-success .sync-dot { background: #2fa37e; }
.sync-warning .sync-dot { background: #e0a22d; }
.sync-danger .sync-dot { background: #d45b5b; }
.sync-info .sync-dot { background: #4d93bb; }
.spinning { animation: header-spin 0.8s linear infinite; }

@keyframes header-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .menu-btn {
    display: flex;
    width: 40px;
    padding: 0;
  }
  
  .logo-subtitle {
    display: none;
  }
  
  .header-nav {
    display: none;
  }

  .logo {
    gap: 0.55rem;
  }

  .logo > :deep(svg) {
    padding: 0.4rem;
  }

  .account-trigger {
    width: 40px;
    padding: 0;
    justify-content: center;
  }

  .account-trigger-copy,
  .account-trigger .sync-dot {
    display: none;
  }
}

@media (max-width: 420px) {
  .logo-text {
    font-size: 1.12rem;
  }

  .header-content {
    gap: 0.55rem;
  }
}
</style>
