<template>
  <div class="ai-experience">
    <div
      v-if="currentMode === AI_EXPERIENCE_MODES.CLASSIC"
      ref="classicPanel"
      class="classic-experience"
      tabindex="-1"
    >
      <div v-if="canReturnToGuided" class="classic-mode-bar">
        <div>
          <span>经典自由问答</span>
          <small>原有 AI 组件与交互保持不变</small>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="showGuidedMode">
          <LayoutGrid :size="15" />
          返回任务模式
        </button>
      </div>
      <AISearch />
    </div>
    <AIGrowthCoach
      v-else
      ref="guidedCoach"
      :age-stage="ageStage"
      @open-classic="showClassicMode"
    />
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { LayoutGrid } from 'lucide-vue-next'
import {
  AI_EXPERIENCE_MODES,
  resolveAiExperienceMode
} from '@/ai/growthCoach'
import AIGrowthCoach from './AIGrowthCoach.vue'
import AISearch from './AISearch.vue'

defineProps({
  ageStage: {
    type: Object,
    default: null
  }
})

const configuredMode = resolveAiExperienceMode(import.meta.env.VITE_AI_EXPERIENCE_MODE)
const currentMode = ref(configuredMode)
const classicPanel = ref(null)
const guidedCoach = ref(null)
const canReturnToGuided = computed(() => configuredMode === AI_EXPERIENCE_MODES.GUIDED)

function showClassicMode() {
  currentMode.value = AI_EXPERIENCE_MODES.CLASSIC
  void nextTick(() => classicPanel.value?.focus())
}

function showGuidedMode() {
  currentMode.value = AI_EXPERIENCE_MODES.GUIDED
  void nextTick(() => guidedCoach.value?.focusStart())
}
</script>

<style scoped>
.ai-experience {
  width: 100%;
}

.classic-experience:focus {
  outline: none;
}

.classic-mode-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.7rem;
  padding: 0 0.25rem;
}

.classic-mode-bar div,
.classic-mode-bar span,
.classic-mode-bar small {
  display: block;
}

.classic-mode-bar span {
  color: var(--text-primary);
  font-size: 0.84rem;
  font-weight: 700;
}

.classic-mode-bar small {
  margin-top: 0.1rem;
  color: var(--text-tertiary);
  font-size: 0.72rem;
}

.classic-mode-bar .btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
}

@media (max-width: 540px) {
  .classic-mode-bar {
    align-items: flex-start;
  }

  .classic-mode-bar small {
    display: none;
  }
}
</style>
