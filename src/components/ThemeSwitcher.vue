<template>
  <div ref="container" class="theme-switcher">
    <button
      ref="trigger"
      type="button"
      class="btn btn-secondary theme-trigger"
      aria-haspopup="dialog"
      :aria-expanded="isOpen"
      aria-controls="theme-popover"
      :aria-label="`主题切换，当前主题为${activeTheme.name}`"
      :title="`主题切换 · ${activeTheme.name}`"
      @click="togglePopover"
    >
      <Palette :size="17" />
      <span class="theme-trigger-copy"><strong>主题切换</strong><small>{{ activeTheme.name }}</small></span>
      <ChevronDown :size="14" class="theme-chevron" :class="{ open: isOpen }" />
    </button>

    <transition name="theme-popover">
      <section v-if="isOpen" id="theme-popover" class="theme-popover" role="dialog" aria-label="选择页面主题">
        <header>
          <div><strong>主题切换</strong><span>选择一种适合当下的视觉风格，仅保存在当前设备</span></div>
          <button type="button" aria-label="关闭主题选择" @click="closePopover(true)"><X :size="16" /></button>
        </header>
        <div class="theme-options" role="radiogroup" aria-label="可用主题">
          <button
            v-for="theme in THEMES"
            :key="theme.id"
            ref="themeOptions"
            type="button"
            class="theme-option"
            :class="{ active: activeThemeId === theme.id }"
            role="radio"
            :aria-checked="activeThemeId === theme.id"
            :tabindex="activeThemeId === theme.id ? 0 : -1"
            @click="selectTheme(theme.id)"
            @keydown="handleThemeOptionKeydown($event, theme.id)"
          >
            <span class="theme-preview" aria-hidden="true">
              <i v-for="color in theme.colors" :key="color" :style="{ backgroundColor: color }"></i>
            </span>
            <span class="theme-copy"><strong>{{ theme.name }}</strong><small>{{ theme.description }}</small></span>
            <Check v-if="activeThemeId === theme.id" :size="17" />
          </button>
        </div>
      </section>
    </transition>
    <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ChevronDown, Palette, X } from 'lucide-vue-next'
import {
  THEME_STORAGE_KEY,
  THEMES,
  applyTheme,
  getAppliedTheme
} from '@/theme/themeManager'

const container = ref(null)
const trigger = ref(null)
const themeOptions = ref([])
const isOpen = ref(false)
const activeThemeId = ref(getAppliedTheme())
const announcement = ref('')
const activeTheme = computed(() => (
  THEMES.find(theme => theme.id === activeThemeId.value) ?? THEMES[0]
))

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointer)
  document.addEventListener('keydown', handleDocumentKeydown)
  window.addEventListener('storage', handleStorage)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutsidePointer)
  document.removeEventListener('keydown', handleDocumentKeydown)
  window.removeEventListener('storage', handleStorage)
})

function togglePopover() {
  if (isOpen.value) {
    closePopover(false)
    return
  }
  isOpen.value = true
  void nextTick(() => {
    const activeIndex = THEMES.findIndex(theme => theme.id === activeThemeId.value)
    themeOptions.value[activeIndex]?.focus()
  })
}

function selectTheme(themeId) {
  applyThemeSelection(themeId)
  closePopover(true)
}

function applyThemeSelection(themeId) {
  activeThemeId.value = applyTheme(themeId)
  announcement.value = `已切换为${activeTheme.value.name}`
}

function handleThemeOptionKeydown(event, themeId) {
  const currentIndex = THEMES.findIndex(theme => theme.id === themeId)
  const lastIndex = THEMES.length - 1
  let nextIndex = null

  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    nextIndex = (currentIndex + 1) % THEMES.length
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + THEMES.length) % THEMES.length
  } else if (event.key === 'Home') {
    nextIndex = 0
  } else if (event.key === 'End') {
    nextIndex = lastIndex
  }

  if (nextIndex === null) return
  event.preventDefault()
  applyThemeSelection(THEMES[nextIndex].id)
  void nextTick(() => themeOptions.value[nextIndex]?.focus())
}

function closePopover(restoreFocus) {
  isOpen.value = false
  if (restoreFocus) void nextTick(() => trigger.value?.focus())
}

function handleOutsidePointer(event) {
  if (isOpen.value && !container.value?.contains(event.target)) closePopover(false)
}

function handleDocumentKeydown(event) {
  if (event.key !== 'Escape' || !isOpen.value) return
  event.preventDefault()
  closePopover(true)
}

function handleStorage(event) {
  if (event.key !== THEME_STORAGE_KEY) return
  activeThemeId.value = applyTheme(event.newValue, { persist: false })
}
</script>

<style scoped>
.theme-switcher {
  position: relative;
}

.theme-trigger {
  width: auto;
  min-width: 40px;
  padding: 0 0.7rem;
  color: var(--primary-dark);
  white-space: nowrap;
}

.theme-trigger-copy {
  display: grid;
  gap: 0.02rem;
  text-align: left;
  line-height: 1.08;
}

.theme-trigger-copy strong {
  font-size: 0.72rem;
}

.theme-trigger-copy small {
  color: var(--text-secondary);
  font-size: 0.58rem;
}

.theme-chevron {
  transition: transform var(--transition-fast);
}

.theme-chevron.open {
  transform: rotate(180deg);
}

.theme-popover {
  position: absolute;
  top: calc(100% + 0.65rem);
  right: 0;
  z-index: 220;
  width: min(20rem, calc(100vw - 1.5rem));
  padding: 0.8rem;
  color: var(--text-primary);
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
}

.theme-popover::before {
  position: absolute;
  top: -0.38rem;
  right: 1rem;
  width: 0.7rem;
  height: 0.7rem;
  content: "";
  background-color: var(--card-bg);
  border-top: 1px solid var(--border-color);
  border-left: 1px solid var(--border-color);
  transform: rotate(45deg);
}

.theme-popover > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.15rem 0.1rem 0.7rem;
}

.theme-popover header > div {
  display: grid;
  gap: 0.1rem;
}

.theme-popover header strong {
  font-size: 0.88rem;
}

.theme-popover header span {
  color: var(--text-secondary);
  font-size: 0.68rem;
}

.theme-popover header button {
  display: grid;
  width: 1.9rem;
  height: 1.9rem;
  padding: 0;
  place-items: center;
  color: var(--text-secondary);
  background-color: var(--surface-muted);
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.theme-options {
  display: grid;
  gap: 0.45rem;
}

.theme-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.65rem;
  align-items: center;
  width: 100%;
  min-height: 58px;
  padding: 0.6rem;
  color: var(--text-primary);
  text-align: left;
  background-color: var(--surface-soft);
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  cursor: pointer;
}

.theme-option:hover,
.theme-option:focus-visible {
  background-color: var(--primary-soft);
  border-color: var(--primary-light);
}

.theme-option.active {
  color: var(--primary-dark);
  border-color: var(--primary-light);
  box-shadow: inset 0 0 0 1px var(--focus-ring);
}

.theme-preview {
  display: flex;
  width: 3rem;
  height: 2.15rem;
  overflow: hidden;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 0.65rem;
}

.theme-preview i {
  flex: 1;
}

.theme-copy {
  display: grid;
  gap: 0.08rem;
  min-width: 0;
}

.theme-copy strong {
  font-size: 0.8rem;
}

.theme-copy small {
  color: var(--text-secondary);
  font-size: 0.68rem;
  line-height: 1.35;
}

.theme-popover-enter-active,
.theme-popover-leave-active {
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}

.theme-popover-enter-from,
.theme-popover-leave-to {
  opacity: 0;
  transform: translateY(-0.35rem) scale(0.98);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 768px) {
  .theme-trigger {
    width: 40px;
    padding: 0;
  }

  .theme-trigger-copy,
  .theme-chevron {
    display: none;
  }

  .theme-popover {
    position: fixed;
    top: calc(var(--header-height) + 0.5rem);
    right: 0.75rem;
    left: 0.75rem;
    width: auto;
  }

  .theme-popover::before {
    display: none;
  }
}
</style>
