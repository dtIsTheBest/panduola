<template>
  <div class="interaction-effects" aria-hidden="true">
    <div
      v-for="burst in bursts"
      :key="burst.id"
      class="click-burst"
      :style="{ '--burst-x': `${burst.x}px`, '--burst-y': `${burst.y}px` }"
    >
      <span class="burst-ring"></span>
      <i
        v-for="particle in burst.particles"
        :key="particle.id"
        class="burst-particle"
        :class="particle.shape"
        :style="{
          '--particle-angle': particle.angle,
          '--particle-distance': particle.distance,
          '--particle-delay': particle.delay,
          '--particle-size': particle.size,
          '--particle-color': particle.color
        }"
      ></i>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  CLICK_BURST_DURATION_MS,
  MAX_ACTIVE_CLICK_BURSTS,
  createClickBurst
} from '@/utils/interactionEffects'

const CLICK_THROTTLE_MS = 120
const IGNORED_TARGET_SELECTOR = 'input, textarea, select, [contenteditable="true"], [data-no-burst]'

const bursts = ref([])
const cleanupTimers = new Map()
let burstSequence = 0
let lastBurstAt = 0
let reducedMotionQuery = null

onMounted(() => {
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  document.addEventListener('click', handleClick, { passive: true })
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClick)
  for (const timer of cleanupTimers.values()) window.clearTimeout(timer)
  cleanupTimers.clear()
})

function handleClick(event) {
  if (event.button !== 0 || event.detail === 0 || reducedMotionQuery?.matches) return
  if (event.target instanceof Element && event.target.closest(IGNORED_TARGET_SELECTOR)) return

  const now = performance.now()
  if (now - lastBurstAt < CLICK_THROTTLE_MS) return
  lastBurstAt = now

  burstSequence += 1
  const burst = createClickBurst({
    id: `click-burst-${burstSequence}`,
    x: event.clientX,
    y: event.clientY
  })

  if (bursts.value.length >= MAX_ACTIVE_CLICK_BURSTS) removeBurst(bursts.value[0].id)
  bursts.value = [...bursts.value, burst]
  const timer = window.setTimeout(() => removeBurst(burst.id), CLICK_BURST_DURATION_MS)
  cleanupTimers.set(burst.id, timer)
}

function removeBurst(burstId) {
  const timer = cleanupTimers.get(burstId)
  if (timer) window.clearTimeout(timer)
  cleanupTimers.delete(burstId)
  bursts.value = bursts.value.filter(burst => burst.id !== burstId)
}
</script>

<style scoped>
.interaction-effects {
  position: fixed;
  inset: 0;
  z-index: 3000;
  overflow: hidden;
  pointer-events: none;
}

.click-burst {
  position: absolute;
  top: var(--burst-y);
  left: var(--burst-x);
  width: 0;
  height: 0;
}

.burst-ring,
.burst-particle {
  position: absolute;
  top: 0;
  left: 0;
  display: block;
  pointer-events: none;
}

.burst-ring {
  width: 12px;
  height: 12px;
  margin: -6px;
  border: 2px solid var(--primary-light);
  border-radius: 50%;
  animation: burst-ring 560ms ease-out forwards;
  box-shadow: 0 0 14px var(--primary-color);
}

.burst-particle {
  width: var(--particle-size);
  height: var(--particle-size);
  margin: calc(var(--particle-size) / -2);
  background-color: var(--particle-color);
  border-radius: 50%;
  box-shadow: 0 0 9px var(--particle-color);
  animation: burst-particle 680ms cubic-bezier(0.16, 0.84, 0.32, 1) var(--particle-delay) forwards;
}

.burst-particle.diamond {
  border-radius: 1px;
}

@keyframes burst-ring {
  from { opacity: 0.9; transform: scale(0.25); }
  to { opacity: 0; transform: scale(3.2); }
}

@keyframes burst-particle {
  from {
    opacity: 1;
    transform: rotate(var(--particle-angle)) translateX(3px) scale(1);
  }
  to {
    opacity: 0;
    transform: rotate(var(--particle-angle)) translateX(var(--particle-distance)) scale(0.2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .interaction-effects {
    display: none;
  }
}
</style>
