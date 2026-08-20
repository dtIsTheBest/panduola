<template>
  <div v-if="visible" class="food-overlay" @click.self="close" @keydown="handleDialogKeydown">
    <div ref="dialog" class="food-dialog" role="dialog" aria-modal="true" aria-labelledby="food-calculator-title">
      <header class="food-header">
        <div class="food-header-icon"><Utensils :size="24" /></div>
        <div class="food-header-copy">
          <span>0—36 月龄 · 本地计算</span>
          <h2 id="food-calculator-title">辅食搭配计算器</h2>
          <p>选月龄、勾食物，快速看看今天还可以补什么。</p>
        </div>
        <button ref="closeButton" type="button" class="btn btn-secondary food-close" aria-label="关闭辅食搭配计算器" @click="close">
          <X :size="20" />
        </button>
      </header>

      <div class="food-body">
        <section class="age-bar" aria-label="孩子月龄">
          <div class="age-field">
            <div class="age-heading">
              <span>当前月龄</span>
              <strong>{{ ageMonths }} 个月</strong>
            </div>
            <div class="age-control">
              <button type="button" aria-label="月龄减少一个月" :disabled="ageMonths === MIN_AGE_MONTHS" @click="ageMonths -= 1">−</button>
              <input v-model.number="ageMonths" type="range" :min="MIN_AGE_MONTHS" :max="MAX_AGE_MONTHS" aria-label="孩子月龄" />
              <button type="button" aria-label="月龄增加一个月" :disabled="ageMonths === MAX_AGE_MONTHS" @click="ageMonths += 1">＋</button>
            </div>
          </div>
        </section>

        <section class="stage-card" aria-labelledby="food-stage-title">
          <div class="stage-badge"><Baby :size="19" />{{ feedingStage.label }}</div>
          <div class="stage-copy">
            <span>{{ ageMonths }} 月龄建议</span>
            <h3 id="food-stage-title">{{ feedingStage.focus }}</h3>
          </div>
          <div class="stage-facts">
            <article><CalendarClock :size="19" /><span>辅食餐次</span><strong>{{ feedingStage.mealFrequency }}</strong></article>
            <article><Soup :size="19" /><span>食物性状</span><strong>{{ feedingStage.texture }}</strong></article>
          </div>
        </section>

        <section v-if="ageMonths < COMPLEMENTARY_FOOD_START_MONTHS" class="readiness-panel" aria-labelledby="food-readiness-title">
          <div class="readiness-icon"><Baby :size="24" /></div>
          <div>
            <span>先观察准备信号</span>
            <h3 id="food-readiness-title">暂不进行食物多样性检查</h3>
            <p>通常约满 6 月龄，且孩子能够扶坐、稳定控制头颈、把食物吞下而不是顶出，并表现出对食物的兴趣时，再开始尝试辅食。</p>
          </div>
        </section>

        <div v-else class="calculator-grid">
          <section class="selection-panel" aria-labelledby="food-groups-title">
            <div class="section-heading">
              <div>
                <span>今日搭配</span>
                <h3 id="food-groups-title">今天吃到了哪些食物？</h3>
                <p>按一天勾选即可，不需要精确填写克数。</p>
              </div>
              <div class="group-counter" :class="{ complete: diversityResult.isDiverse }">
                {{ diversityResult.selectedCount }} / {{ FOOD_GROUPS.length }} 类
              </div>
            </div>

            <div class="food-group-grid">
              <label v-for="group in FOOD_GROUPS" :key="group.id" :class="['food-group-card', { selected: selectedGroupIds.includes(group.id) }]">
                <input v-model="selectedGroupIds" type="checkbox" :value="group.id" />
                <span class="group-icon"><component :is="foodGroupIcons[group.icon]" :size="20" /></span>
                <span class="group-copy">
                  <strong>{{ group.label }}</strong>
                  <small>{{ group.examples }}</small>
                </span>
                <span v-if="group.badge" class="iron-badge">{{ group.badge }}</span>
                <CheckCircle2 v-if="selectedGroupIds.includes(group.id)" class="selected-mark" :size="18" />
              </label>
            </div>

            <label class="new-food-toggle">
              <input v-model="isTryingNewFood" type="checkbox" />
              <span><strong>今天首次尝试一种新食物</strong><small>开启后显示观察和过敏安全提醒</small></span>
            </label>
          </section>

          <aside class="result-panel" aria-labelledby="food-result-title" aria-live="polite">
            <div class="result-heading" :class="{ ready: diversityResult.isDiverse && keyCoverageCount === KEY_COVERAGE_TOTAL }">
              <Sparkles :size="21" />
              <div>
                <span>搭配结果</span>
                <h3 id="food-result-title">{{ resultTitle }}</h3>
              </div>
            </div>

            <div class="coverage-list" aria-label="关键搭配检查">
              <div :class="{ covered: diversityResult.isDiverse }"><component :is="diversityResult.isDiverse ? CheckCircle2 : Circle" :size="18" /><span>至少 4 类食物</span></div>
              <div :class="{ covered: diversityResult.hasGrains }"><component :is="diversityResult.hasGrains ? CheckCircle2 : Circle" :size="18" /><span>有谷薯类</span></div>
              <div :class="{ covered: diversityResult.hasProduce }"><component :is="diversityResult.hasProduce ? CheckCircle2 : Circle" :size="18" /><span>有蔬菜或水果</span></div>
              <div :class="{ covered: diversityResult.hasIronAnimalFood }"><component :is="diversityResult.hasIronAnimalFood ? CheckCircle2 : Circle" :size="18" /><span>有富铁动物性食物</span></div>
            </div>

            <div v-if="diversityResult.nextSteps.length" class="next-steps">
              <strong>下一步可以这样补</strong>
              <ul><li v-for="step in diversityResult.nextSteps" :key="step">{{ step }}</li></ul>
            </div>
            <div v-else class="balanced-message"><CheckCircle2 :size="20" /><span>关键食物组已覆盖，继续跟随孩子食欲，不必强迫吃完。</span></div>
          </aside>
        </div>

        <section class="safety-section" aria-labelledby="food-safety-title">
          <div class="section-heading compact">
            <div class="safety-title"><ShieldCheck :size="21" /><div><span>安全优先</span><h3 id="food-safety-title">喂养时记住这些</h3></div></div>
          </div>
          <div class="safety-grid"><article v-for="tip in safetyTips" :key="tip"><AlertTriangle :size="17" /><span>{{ tip }}</span></article></div>
        </section>

        <aside class="food-disclaimer" role="note">
          <Info :size="19" />
          <p>结果是面向一般健康儿童的喂养参考，不是营养处方。早产、低出生体重、生长异常、严重湿疹或已知过敏，请由儿科医生或营养师个体评估。</p>
        </aside>

        <section class="source-section" aria-labelledby="food-sources-title">
          <div class="section-heading compact">
            <div class="source-title"><FileText :size="20" /><div><h3 id="food-sources-title">官方资料来源</h3><p>内容更新于 {{ COMPLEMENTARY_FOOD_GUIDE_UPDATED_AT }}</p></div></div>
          </div>
          <div class="source-list">
            <button v-for="source in COMPLEMENTARY_FOOD_SOURCES" :key="source.url" type="button" @click="openSource(source.url)">
              <span><strong>{{ source.title }}</strong><small>{{ source.organization }}</small></span><ExternalLink :size="16" />
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  AlertTriangle, Apple, Baby, Bean, CalendarClock, Carrot, CheckCircle2, Circle,
  Drumstick, Egg, ExternalLink, FileText, Info, Milk, ShieldCheck, Soup, Sparkles,
  Utensils, Wheat, X
} from 'lucide-vue-next'
import { useDialogFocus } from '@/composables/useDialogFocus'
import {
  COMPLEMENTARY_FOOD_GUIDE_UPDATED_AT,
  COMPLEMENTARY_FOOD_SOURCES,
  FOOD_GROUPS,
  evaluateFoodDiversity,
  getFeedingStage,
  getSafetyTips
} from '@/data/complementaryFoodGuide'
import { openExternalLink } from '@/utils/externalLinks'

const MIN_AGE_MONTHS = 0
const MAX_AGE_MONTHS = 36
const COMPLEMENTARY_FOOD_START_MONTHS = 6
const KEY_COVERAGE_TOTAL = 4

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['close'])
const dialog = ref(null)
const closeButton = ref(null)
const ageMonths = ref(6)
const selectedGroupIds = ref([])
const isTryingNewFood = ref(false)

const foodGroupIcons = { Wheat, Bean, Drumstick, Egg, Carrot, Apple, Milk }
const feedingStage = computed(() => getFeedingStage(ageMonths.value))
const diversityResult = computed(() => evaluateFoodDiversity(selectedGroupIds.value))
const safetyTips = computed(() => {
  const shouldShowNewFoodTips = ageMonths.value >= COMPLEMENTARY_FOOD_START_MONTHS && isTryingNewFood.value
  return getSafetyTips(ageMonths.value, shouldShowNewFoodTips)
})
const keyCoverageCount = computed(() => [
  diversityResult.value.isDiverse,
  diversityResult.value.hasGrains,
  diversityResult.value.hasProduce,
  diversityResult.value.hasIronAnimalFood
].filter(Boolean).length)
const resultTitle = computed(() => {
  if (keyCoverageCount.value === KEY_COVERAGE_TOTAL) return '今天的关键搭配已覆盖'
  if (diversityResult.value.selectedCount === 0) return '从今天吃过的食物开始勾选'
  return `还差 ${KEY_COVERAGE_TOTAL - keyCoverageCount.value} 个关键项`
})

const { handleDialogKeydown } = useDialogFocus({
  isVisible: () => props.visible,
  dialogRef: dialog,
  initialFocus: () => closeButton.value,
  onEscape: close
})

function openSource(url) {
  if (!openExternalLink(url)) {
    alert('官方资料链接暂时无法打开')
  }
}

function close() {
  emit('close')
}
</script>

<style scoped>
.food-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background-color: var(--overlay-color);
  backdrop-filter: blur(7px);
}

.food-dialog {
  display: flex;
  flex-direction: column;
  width: min(1040px, calc(100vw - 3rem));
  max-height: min(820px, calc(100vh - 3rem));
  overflow: hidden;
  background-color: var(--card-bg);
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-xl);
}

.food-header {
  display: flex;
  align-items: flex-start;
  gap: 0.9rem;
  padding: 1.2rem 1.4rem;
  background: radial-gradient(circle at 88% 12%, rgba(255, 185, 94, 0.18), transparent 13rem), linear-gradient(135deg, var(--primary-soft), #fff9ef);
  border-bottom: 1px solid var(--border-color);
}

.food-header-icon {
  display: grid;
  flex: 0 0 2.8rem;
  place-items: center;
  width: 2.8rem;
  height: 2.8rem;
  color: white;
  background: linear-gradient(135deg, #1f927f, var(--primary-color));
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.food-header-copy {
  flex: 1;
  min-width: 0;
}

.food-header-copy > span,
.section-heading span,
.stage-copy > span,
.result-heading span,
.safety-title span {
  color: var(--primary-color);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.food-header h2 {
  margin: 0.12rem 0 0.18rem;
  font-size: clamp(1.45rem, 2.5vw, 1.8rem);
}

.food-header p,
.section-heading p,
.source-title p {
  margin: 0;
  color: var(--text-secondary);
}

.food-close {
  flex: 0 0 2.6rem;
  width: 2.6rem;
  height: 2.6rem;
  padding: 0;
  border-radius: 50%;
}

.food-body {
  display: grid;
  gap: 1rem;
  min-height: 0;
  padding: 1.2rem 1.35rem 1.4rem;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.age-bar {
  padding: 1rem;
  background-color: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
}

.age-field {
  display: grid;
  gap: 0.45rem;
}

.age-heading > span {
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 600;
}

.age-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.age-heading strong {
  color: var(--primary-color);
}

.age-control {
  display: grid;
  grid-template-columns: 2.5rem 1fr 2.5rem;
  gap: 0.55rem;
  align-items: center;
}

.age-control button {
  width: 2.5rem;
  height: 2.5rem;
  color: var(--primary-color);
  font-size: 1.15rem;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 50%;
  cursor: pointer;
}

.age-control button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.age-control input {
  width: 100%;
  accent-color: var(--primary-color);
}

.stage-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(23rem, 1.2fr);
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  background: linear-gradient(135deg, rgba(31, 118, 108, 0.1), rgba(255, 248, 238, 0.86));
  border: 1px solid rgba(31, 118, 108, 0.2);
  border-radius: var(--radius-xl);
}

.stage-badge {
  display: grid;
  gap: 0.3rem;
  place-items: center;
  min-width: 6.5rem;
  padding: 0.75rem;
  color: var(--primary-color);
  font-size: 0.78rem;
  font-weight: 700;
  text-align: center;
  background-color: rgba(255, 255, 255, 0.8);
  border-radius: var(--radius-lg);
}

.stage-copy h3 {
  margin: 0.22rem 0 0;
  font-size: 1rem;
  line-height: 1.55;
}

.stage-facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

.stage-facts article {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.5rem;
  padding: 0.7rem;
  background-color: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(31, 118, 108, 0.12);
  border-radius: var(--radius-lg);
}

.stage-facts svg {
  grid-row: 1 / 3;
  color: var(--primary-color);
}

.stage-facts span {
  color: var(--text-secondary);
  font-size: 0.72rem;
}

.stage-facts strong {
  font-size: 0.8rem;
  line-height: 1.4;
}

.calculator-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(17rem, 0.85fr);
  gap: 1rem;
  align-items: start;
}

.readiness-panel {
  display: flex;
  gap: 0.8rem;
  align-items: flex-start;
  padding: 1rem;
  background: linear-gradient(135deg, #fff9ee, var(--surface-soft));
  border: 1px solid #f2dfbd;
  border-radius: var(--radius-xl);
}

.readiness-icon {
  display: grid;
  flex: 0 0 2.7rem;
  place-items: center;
  width: 2.7rem;
  height: 2.7rem;
  color: #b96a0c;
  background-color: white;
  border-radius: var(--radius-lg);
}

.readiness-panel span {
  color: #b96a0c;
  font-size: 0.75rem;
  font-weight: 700;
}

.readiness-panel h3 {
  margin: 0.12rem 0 0.25rem;
  font-size: 1rem;
}

.readiness-panel p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8rem;
  line-height: 1.55;
}

.selection-panel,
.result-panel,
.safety-section,
.source-section {
  padding: 1rem;
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.section-heading h3,
.result-heading h3,
.safety-title h3,
.source-title h3 {
  margin: 0.15rem 0;
  font-size: 1rem;
}

.group-counter {
  flex: 0 0 auto;
  padding: 0.45rem 0.7rem;
  color: var(--text-secondary);
  font-size: 0.78rem;
  font-weight: 700;
  background-color: var(--surface-muted);
  border-radius: 999px;
}

.group-counter.complete {
  color: var(--primary-color);
  background-color: var(--primary-soft);
}

.food-group-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.food-group-card {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0.55rem;
  align-items: center;
  min-height: 4.4rem;
  padding: 0.7rem;
  background-color: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.food-group-card:hover {
  border-color: var(--primary-light);
  transform: translateY(-1px);
}

.food-group-card.selected {
  background-color: var(--primary-soft);
  border-color: var(--primary-light);
  box-shadow: 0 7px 18px rgba(31, 118, 108, 0.1);
}

.food-group-card:focus-within,
.new-food-toggle:focus-within {
  outline: 3px solid rgba(31, 118, 108, 0.28);
  outline-offset: 2px;
}

.food-group-card > input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.group-icon {
  display: grid;
  place-items: center;
  width: 2.25rem;
  height: 2.25rem;
  color: var(--primary-color);
  background-color: var(--card-bg);
  border-radius: var(--radius-md);
}

.group-copy {
  display: grid;
  gap: 0.12rem;
  min-width: 0;
  padding-right: 1.2rem;
}

.group-copy strong {
  font-size: 0.83rem;
}

.group-copy small {
  color: var(--text-secondary);
  font-size: 0.7rem;
  line-height: 1.35;
}

.iron-badge {
  grid-column: 2;
  width: max-content;
  padding: 0.16rem 0.42rem;
  color: #a15c08;
  font-size: 0.66rem;
  font-weight: 700;
  background-color: #fff3d8;
  border-radius: 999px;
}

.selected-mark {
  position: absolute;
  top: 0.55rem;
  right: 0.55rem;
  color: var(--primary-color);
}

.new-food-toggle {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  margin-top: 0.75rem;
  padding: 0.75rem;
  background-color: #fff9ee;
  border: 1px solid #f2dfbd;
  border-radius: var(--radius-lg);
  cursor: pointer;
}

.new-food-toggle input {
  width: 1.05rem;
  height: 1.05rem;
  accent-color: var(--primary-color);
}

.new-food-toggle span {
  display: grid;
  gap: 0.12rem;
}

.new-food-toggle small {
  color: var(--text-secondary);
}

.result-panel {
  position: sticky;
  top: 0;
  display: grid;
  gap: 0.8rem;
  background: linear-gradient(160deg, var(--surface-soft), var(--card-bg));
}

.result-heading {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  padding: 0.75rem;
  color: var(--primary-color);
  background-color: var(--primary-soft);
  border-radius: var(--radius-lg);
}

.result-heading.ready {
  color: #14704f;
  background-color: #e8f7ef;
}

.coverage-list {
  display: grid;
  gap: 0.5rem;
}

.coverage-list > div {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.coverage-list > div.covered {
  color: var(--primary-color);
  font-weight: 700;
}

.next-steps {
  padding-top: 0.75rem;
  border-top: 1px solid var(--border-color);
}

.next-steps > strong {
  font-size: 0.82rem;
}

.next-steps ul {
  display: grid;
  gap: 0.45rem;
  margin: 0.55rem 0 0;
  padding-left: 1.1rem;
  color: var(--text-secondary);
  font-size: 0.76rem;
  line-height: 1.45;
}

.balanced-message {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  padding: 0.75rem;
  color: #14704f;
  font-size: 0.8rem;
  line-height: 1.45;
  background-color: #e8f7ef;
  border-radius: var(--radius-lg);
}

.section-heading.compact {
  margin-bottom: 0.7rem;
}

.safety-title,
.source-title {
  display: flex;
  gap: 0.55rem;
  align-items: center;
}

.safety-title > svg,
.source-title > svg {
  color: var(--primary-color);
}

.safety-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.safety-grid article {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  padding: 0.7rem;
  color: var(--text-secondary);
  font-size: 0.76rem;
  line-height: 1.45;
  background-color: var(--surface-soft);
  border-radius: var(--radius-lg);
}

.safety-grid svg {
  flex: 0 0 auto;
  margin-top: 0.1rem;
  color: #d07a13;
}

.food-disclaimer {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  padding: 0.8rem 0.9rem;
  color: var(--text-secondary);
  background-color: #fff9ee;
  border: 1px solid #f2dfbd;
  border-radius: var(--radius-lg);
}

.food-disclaimer svg {
  flex: 0 0 auto;
  color: #b96a0c;
}

.food-disclaimer p {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.5;
}

.source-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
}

.source-list button {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding: 0.7rem;
  text-align: left;
  background-color: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  cursor: pointer;
}

.source-list button:hover {
  border-color: var(--primary-light);
}

.source-list span {
  display: grid;
  gap: 0.18rem;
  min-width: 0;
}

.source-list strong {
  font-size: 0.76rem;
  line-height: 1.35;
}

.source-list small {
  color: var(--text-secondary);
  font-size: 0.68rem;
}

.source-list svg {
  flex: 0 0 auto;
  color: var(--primary-color);
}

@media (max-width: 820px) {
  .stage-card {
    grid-template-columns: auto 1fr;
  }

  .stage-facts {
    grid-column: 1 / -1;
  }

  .calculator-grid {
    grid-template-columns: 1fr;
  }

  .result-panel {
    position: static;
  }

  .source-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .food-overlay {
    align-items: flex-end;
    padding: 0;
    backdrop-filter: blur(5px);
  }

  .food-dialog {
    width: 100%;
    max-height: 94vh;
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    border-radius: var(--radius-2xl) var(--radius-2xl) 0 0;
  }

  .food-header,
  .food-body {
    padding-right: 1rem;
    padding-left: 1rem;
  }

  .food-header-icon {
    display: none;
  }

  .stage-card,
  .stage-facts,
  .food-group-grid,
  .safety-grid {
    grid-template-columns: 1fr;
  }

  .stage-badge {
    display: flex;
    justify-content: center;
    min-width: 0;
  }

  .stage-facts {
    grid-column: auto;
  }
}
</style>
