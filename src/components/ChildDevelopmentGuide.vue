<template>
  <div v-if="visible" class="development-overlay" @click.self="close" @keydown="handleDialogKeydown">
    <div
      ref="dialog"
      class="development-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="development-guide-title"
    >
      <header class="development-header">
        <div class="heading-icon" aria-hidden="true">
          <Ruler :size="24" />
        </div>
        <div class="heading-copy">
          <div class="guide-eyebrow">国家标准与儿童保健规范</div>
          <h2 id="development-guide-title">儿童成长标准速查</h2>
          <p>先选对年龄标准，再看连续趋势；一键打开官方原文核对完整表格。</p>
        </div>
        <button
          ref="closeButton"
          type="button"
          class="btn btn-secondary guide-close"
          aria-label="关闭儿童成长标准速查"
          @click="close"
        >
          <X :size="20" />
        </button>
      </header>

      <div class="development-body">
        <section v-if="currentStageGuidance" class="current-guidance" aria-label="当前成长阶段提示">
          <Target :size="21" />
          <div>
            <span>当前成长阶段提示</span>
            <h3>{{ currentStageGuidance.title }}</h3>
            <p>{{ currentStageGuidance.description }}</p>
          </div>
        </section>

        <div class="guide-tabs" role="tablist" aria-label="成长标准内容">
          <button
            v-for="(tab, index) in tabs"
            :id="`development-tab-${tab.id}`"
            :key="tab.id"
            ref="tabButtons"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :aria-controls="`development-panel-${tab.id}`"
            :tabindex="activeTab === tab.id ? 0 : -1"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
            @keydown="handleTabKeydown($event, index)"
          >
            <component :is="tab.icon" :size="17" />
            {{ tab.label }}
          </button>
        </div>

        <section
          v-if="activeTab === 'growth'"
          id="development-panel-growth"
          class="guide-panel"
          role="tabpanel"
          tabindex="0"
          aria-labelledby="development-tab-growth"
        >
          <div class="standard-grid">
            <article
              v-for="standard in GROWTH_STANDARD_GROUPS"
              :key="standard.id"
              class="standard-card"
              :class="{ current: isCurrentStandard(standard.id) }"
            >
              <div class="standard-card-top">
                <span class="standard-code">{{ standard.standardCode }}</span>
                <span v-if="isCurrentStandard(standard.id)" class="current-badge">当前适用</span>
              </div>
              <span class="age-range">{{ standard.ageRange }}</span>
              <h3>{{ standard.title }}</h3>
              <p>{{ standard.summary }}</p>
              <div class="indicator-list">
                <span v-for="indicator in standard.indicators" :key="indicator">{{ indicator }}</span>
              </div>
              <div class="standard-actions">
                <button type="button" @click="openSource(standard.sourceUrl)">标准说明</button>
                <button type="button" class="primary" @click="openSource(standard.documentUrl)">
                  查看完整表格
                  <ExternalLink :size="14" />
                </button>
              </div>
            </article>
          </div>

          <div class="reading-steps">
            <div class="section-title">
              <ListChecks :size="19" />
              <div>
                <h3>读表时记住四步</h3>
                <p>标准值用于筛查和趋势参考，不是单次测量诊断。</p>
              </div>
            </div>
            <ol>
              <li><strong>确认年龄：</strong>低龄儿童按精确月龄，学龄期按标准规定的周岁年龄。</li>
              <li><strong>确认分表：</strong>男童、女童分别查表，不套用成人 BMI 界值。</li>
              <li><strong>关注趋势：</strong>尽量使用相同设备和测量方法，连续记录比单点更有意义。</li>
              <li><strong>专业评估：</strong>持续跨越多个等级、增长停滞或伴随其他不适时，咨询儿童保健或儿科专业人员。</li>
            </ol>
          </div>
        </section>

        <section
          v-else-if="activeTab === 'checkups'"
          id="development-panel-checkups"
          class="guide-panel"
          role="tabpanel"
          tabindex="0"
          aria-labelledby="development-tab-checkups"
        >
          <div class="section-title">
            <CalendarCheck2 :size="20" />
            <div>
              <h3>0～6 岁健康管理节点</h3>
              <p>来源于国家基本公共卫生服务和儿童健康管理技术规范。</p>
            </div>
          </div>
          <div class="checkup-grid">
            <article v-for="group in HEALTH_CHECKUP_GROUPS" :key="group.id">
              <span>{{ group.stage }}</span>
              <strong>{{ group.points.join(' · ') }}</strong>
              <p>{{ group.focus }}</p>
            </article>
          </div>

          <div class="section-title vision-title">
            <Eye :size="20" />
            <div>
              <h3>0～6 岁眼保健与视力检查：共 13 次</h3>
              <p>与儿童健康管理时间衔接，出现异常表现不必等到下一节点。</p>
            </div>
          </div>
          <div class="vision-timeline">
            <article v-for="group in VISION_CHECKUP_GROUPS" :key="group.stage">
              <div>
                <span>{{ group.stage }}</span>
                <strong>{{ group.count }} 次</strong>
              </div>
              <p>{{ group.points.join('、') }}</p>
            </article>
          </div>

          <aside class="warning-note" role="note">
            <TriangleAlert :size="19" />
            <p>发现瞳孔区发白、明显斜视、持续畏光流泪、视物眯眼或学习距离越来越近等情况，应及时到专业机构检查。</p>
          </aside>
        </section>

        <section
          v-else
          id="development-panel-sources"
          class="guide-panel"
          role="tabpanel"
          tabindex="0"
          aria-labelledby="development-tab-sources"
        >
          <div class="section-title">
            <Library :size="20" />
            <div>
              <h3>官方资料原文</h3>
              <p>内容核对日期：{{ DEVELOPMENT_GUIDE_UPDATED_AT }}</p>
            </div>
          </div>
          <div class="source-list">
            <button
              v-for="source in DEVELOPMENT_GUIDE_SOURCES"
              :key="source.id"
              type="button"
              @click="openSource(source.url)"
            >
              <FileText :size="19" />
              <span>
                <strong>{{ source.title }}</strong>
                <small>{{ source.meta }}</small>
              </span>
              <em>{{ source.format }}</em>
              <ExternalLink :size="15" />
            </button>
          </div>
        </section>

        <aside class="guide-disclaimer" role="note">
          <ShieldCheck :size="20" />
          <p>
            本工具用于帮助选择正确的国家标准和查找原文，不根据单次数据作医学诊断，也不建议自行节食、用药或延迟就医。早产、慢性疾病或特殊生长情况应由专业人员个体化评估。
          </p>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  CalendarCheck2,
  ChartNoAxesCombined,
  ExternalLink,
  Eye,
  FileText,
  Library,
  ListChecks,
  Ruler,
  ShieldCheck,
  Target,
  TriangleAlert,
  X
} from 'lucide-vue-next'
import { useDialogFocus } from '@/composables/useDialogFocus'
import { openExternalLink } from '@/utils/externalLinks'
import {
  DEVELOPMENT_GUIDE_SOURCES,
  DEVELOPMENT_GUIDE_UPDATED_AT,
  GROWTH_STANDARD_GROUPS,
  HEALTH_CHECKUP_GROUPS,
  VISION_CHECKUP_GROUPS,
  getDevelopmentStageGuidance
} from '@/data/childDevelopmentGuide'

const props = defineProps({
  visible: Boolean,
  selectedAgeStages: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close'])
const dialog = ref(null)
const closeButton = ref(null)
const tabButtons = ref([])
const activeTab = ref('growth')
const tabs = Object.freeze([
  { id: 'growth', label: '生长标准', icon: ChartNoAxesCombined },
  { id: 'checkups', label: '保健节点', icon: CalendarCheck2 },
  { id: 'sources', label: '官方文档', icon: Library }
])

const currentStageGuidance = computed(() => getDevelopmentStageGuidance(props.selectedAgeStages[0]))

watch(() => props.visible, isVisible => {
  if (isVisible) activeTab.value = 'growth'
})

const { handleDialogKeydown } = useDialogFocus({
  isVisible: () => props.visible,
  dialogRef: dialog,
  initialFocus: () => closeButton.value,
  onEscape: close
})

function isCurrentStandard(standardId) {
  return currentStageGuidance.value?.standardIds.includes(standardId) ?? false
}

function handleTabKeydown(event, currentIndex) {
  let nextIndex = null
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
  if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
  if (event.key === 'Home') nextIndex = 0
  if (event.key === 'End') nextIndex = tabs.length - 1
  if (nextIndex === null) return

  event.preventDefault()
  activeTab.value = tabs[nextIndex].id
  void nextTick(() => tabButtons.value[nextIndex]?.focus())
}

function openSource(url) {
  if (!openExternalLink(url)) alert('官方资料链接暂时无法打开')
}

function close() {
  emit('close')
}
</script>

<style scoped>
.development-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background-color: var(--overlay-color);
}

.development-dialog {
  display: flex;
  width: min(100%, 1080px);
  max-height: calc(100vh - 2rem);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-2xl);
  background: var(--card-bg);
  box-shadow: var(--shadow-xl);
}

.development-header {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 1.1rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
  background:
    radial-gradient(circle at 92% 10%, color-mix(in srgb, var(--warm-color) 16%, transparent), transparent 14rem),
    linear-gradient(135deg, var(--primary-soft), var(--warm-surface-end));
}

.heading-icon {
  display: grid;
  flex: 0 0 auto;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 15px;
  color: var(--on-primary);
  background: linear-gradient(135deg, var(--primary-color), var(--primary-dark));
  box-shadow: var(--shadow-sm);
}

.heading-copy {
  min-width: 0;
  flex: 1;
}

.guide-eyebrow {
  margin-bottom: 0.16rem;
  color: var(--primary-dark);
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.06em;
}

.heading-copy h2,
.heading-copy p {
  margin: 0;
}

.heading-copy h2 {
  color: var(--text-primary);
  font-size: 1.2rem;
}

.heading-copy p {
  margin-top: 0.25rem;
  color: var(--text-secondary);
  font-size: 0.82rem;
  line-height: 1.45;
}

.guide-close {
  display: grid;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  padding: 0;
  place-items: center;
}

.development-body {
  padding: 1rem 1.25rem 1.25rem;
  overflow-y: auto;
}

.current-guidance {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  margin-bottom: 0.85rem;
  padding: 0.85rem;
  border: 1px solid color-mix(in srgb, var(--primary-color) 22%, var(--border-color));
  border-radius: var(--radius-lg);
  color: var(--primary-dark);
  background: color-mix(in srgb, var(--primary-soft) 74%, var(--card-bg));
}

.current-guidance span,
.current-guidance h3,
.current-guidance p {
  display: block;
  margin: 0;
}

.current-guidance span {
  font-size: 0.7rem;
  font-weight: 700;
}

.current-guidance h3 {
  margin-top: 0.15rem;
  color: var(--text-primary);
  font-size: 0.95rem;
}

.current-guidance p {
  margin-top: 0.2rem;
  color: var(--text-secondary);
  font-size: 0.78rem;
  line-height: 1.5;
}

.guide-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.45rem;
  margin-bottom: 0.9rem;
  padding: 0.3rem;
  border-radius: var(--radius-lg);
  background: var(--surface-muted);
}

.guide-tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 40px;
  border: 0;
  border-radius: calc(var(--radius-lg) - 0.2rem);
  color: var(--text-secondary);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
}

.guide-tabs button.active {
  color: var(--primary-dark);
  background: var(--card-bg);
  box-shadow: var(--shadow-sm);
}

.guide-panel {
  border-radius: var(--radius-lg);
}

.guide-panel:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 4px;
}

.standard-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
}

.standard-card {
  display: flex;
  min-width: 0;
  padding: 0.9rem;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  background: var(--surface-soft);
}

.standard-card.current {
  border-color: color-mix(in srgb, var(--primary-color) 45%, var(--border-color));
  box-shadow: 0 9px 24px color-mix(in srgb, var(--primary-color) 10%, transparent);
}

.standard-card-top,
.standard-actions,
.section-title,
.source-list button,
.warning-note,
.guide-disclaimer {
  display: flex;
  align-items: center;
}

.standard-card-top {
  justify-content: space-between;
  gap: 0.5rem;
}

.standard-code,
.current-badge,
.age-range,
.indicator-list span {
  font-size: 0.68rem;
}

.standard-code {
  color: var(--primary-dark);
  font-weight: 750;
}

.current-badge {
  padding: 0.16rem 0.4rem;
  border-radius: 999px;
  color: var(--on-primary);
  background: var(--primary-color);
  font-weight: 700;
}

.age-range {
  margin-top: 0.65rem;
  color: var(--text-muted);
}

.standard-card h3 {
  margin: 0.22rem 0 0;
  color: var(--text-primary);
  font-size: 0.9rem;
  line-height: 1.35;
}

.standard-card > p {
  margin: 0.45rem 0 0;
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.55;
}

.indicator-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.65rem;
}

.indicator-list span {
  padding: 0.2rem 0.38rem;
  border-radius: 999px;
  color: var(--text-secondary);
  background: var(--surface-muted);
}

.standard-actions {
  gap: 0.4rem;
  margin-top: auto;
  padding-top: 0.8rem;
}

.standard-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.28rem;
  min-height: 34px;
  padding: 0.38rem 0.55rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  background: var(--card-bg);
  cursor: pointer;
  font: inherit;
  font-size: 0.69rem;
  font-weight: 650;
}

.standard-actions button.primary {
  color: var(--on-primary);
  border-color: transparent;
  background: var(--primary-color);
}

.reading-steps {
  margin-top: 0.85rem;
  padding: 0.9rem;
  border-radius: var(--radius-xl);
  background: var(--surface-soft);
}

.section-title {
  align-items: flex-start;
  gap: 0.55rem;
  color: var(--primary-dark);
}

.section-title h3,
.section-title p {
  margin: 0;
}

.section-title h3 {
  color: var(--text-primary);
  font-size: 0.92rem;
}

.section-title p {
  margin-top: 0.15rem;
  color: var(--text-secondary);
  font-size: 0.72rem;
}

.reading-steps ol {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem 1.2rem;
  margin: 0.75rem 0 0;
  padding-left: 1.25rem;
  color: var(--text-secondary);
  font-size: 0.75rem;
  line-height: 1.55;
}

.reading-steps strong {
  color: var(--text-primary);
}

.checkup-grid,
.vision-timeline {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.6rem;
  margin-top: 0.7rem;
}

.checkup-grid article,
.vision-timeline article {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--surface-soft);
}

.checkup-grid span,
.vision-timeline span {
  color: var(--primary-dark);
  font-size: 0.68rem;
  font-weight: 700;
}

.checkup-grid strong {
  display: block;
  margin-top: 0.32rem;
  color: var(--text-primary);
  font-size: 0.78rem;
  line-height: 1.45;
}

.checkup-grid p,
.vision-timeline p {
  margin: 0.38rem 0 0;
  color: var(--text-secondary);
  font-size: 0.7rem;
  line-height: 1.45;
}

.vision-title {
  margin-top: 1rem;
}

.vision-timeline article > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.vision-timeline strong {
  color: var(--text-primary);
  font-size: 0.74rem;
}

.warning-note,
.guide-disclaimer {
  align-items: flex-start;
  gap: 0.55rem;
  margin-top: 0.8rem;
  padding: 0.75rem;
  border-radius: var(--radius-lg);
}

.warning-note {
  color: var(--danger-color);
  background: color-mix(in srgb, var(--danger-color) 8%, var(--card-bg));
}

.warning-note p,
.guide-disclaimer p {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.55;
}

.source-list {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.source-list button {
  gap: 0.65rem;
  width: 100%;
  min-height: 58px;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  color: var(--primary-dark);
  text-align: left;
  background: var(--surface-soft);
  cursor: pointer;
  font: inherit;
}

.source-list button > span {
  min-width: 0;
  flex: 1;
}

.source-list strong,
.source-list small {
  display: block;
}

.source-list strong {
  color: var(--text-primary);
  font-size: 0.78rem;
}

.source-list small {
  margin-top: 0.18rem;
  color: var(--text-secondary);
  font-size: 0.68rem;
}

.source-list em {
  padding: 0.18rem 0.38rem;
  border-radius: 999px;
  color: var(--text-secondary);
  background: var(--surface-muted);
  font-size: 0.65rem;
  font-style: normal;
}

.guide-disclaimer {
  color: var(--primary-dark);
  background: var(--primary-soft);
}

@media (max-width: 820px) {
  .standard-grid,
  .checkup-grid,
  .vision-timeline {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .development-overlay {
    align-items: stretch;
    padding: 0;
  }

  .development-dialog {
    width: 100%;
    max-height: 100vh;
    border: 0;
    border-radius: 0;
  }

  .development-header {
    align-items: flex-start;
    padding: 0.9rem;
  }

  .heading-icon {
    width: 40px;
    height: 40px;
  }

  .heading-copy p {
    display: none;
  }

  .development-body {
    padding: 0.8rem;
  }

  .guide-tabs {
    position: sticky;
    top: -0.8rem;
    z-index: 2;
  }

  .standard-grid,
  .checkup-grid,
  .vision-timeline,
  .reading-steps ol {
    grid-template-columns: minmax(0, 1fr);
  }

  .standard-actions button {
    flex: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .development-dialog *,
  .development-dialog *::before,
  .development-dialog *::after {
    scroll-behavior: auto !important;
  }
}
</style>
