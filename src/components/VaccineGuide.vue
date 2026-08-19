<template>
  <div v-if="visible" class="vaccine-guide-overlay" @click.self="close" @keydown="handleDialogKeydown">
    <div ref="dialog" class="vaccine-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="vaccine-guide-title">
      <header class="vaccine-guide-header">
        <div class="guide-heading-icon">
          <Syringe :size="24" />
        </div>
        <div class="guide-heading-copy">
          <div class="guide-eyebrow">国家免疫规划 · 2026 年版</div>
          <h2 id="vaccine-guide-title">疫苗接种攻略</h2>
          <p>快速核对关键时间点，实际接种请以接种证和当地接种门诊评估为准。</p>
        </div>
        <button ref="closeButton" type="button" class="btn btn-secondary guide-close" aria-label="关闭疫苗接种攻略" @click="close">
          <X :size="20" />
        </button>
      </header>

      <div class="vaccine-guide-body">
        <section v-if="currentStageGuidance" class="current-stage-card">
          <Target :size="22" />
          <div>
            <span>当前成长阶段提示</span>
            <h3>{{ currentStageGuidance.title }}</h3>
            <p>{{ currentStageGuidance.description }}</p>
          </div>
        </section>

        <section class="guide-update-card" aria-labelledby="guide-update-title">
          <div class="section-heading compact">
            <Sparkles :size="20" />
            <div>
              <h3 id="guide-update-title">2026 年版关键更新</h3>
              <p>本工具已按最新国家程序更新。</p>
            </div>
          </div>
          <div class="update-grid">
            <div class="update-item">
              <strong>百白破改为 5 剂</strong>
              <span>2、4、6、18 月龄和 6 周岁各接种 1 剂。</span>
            </div>
            <div class="update-item">
              <strong>HPV 纳入国家免疫规划</strong>
              <span>13 周岁女孩免费接种 2 剂双价 HPV 疫苗，间隔 6 个月。</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="schedule-title">
          <div class="section-heading">
            <CalendarDays :size="21" />
            <div>
              <h3 id="schedule-title">国家免疫规划接种时间表</h3>
              <p>高亮项目与当前选择的成长阶段相关。</p>
            </div>
          </div>

          <div class="schedule-grid">
            <article
              v-for="item in VACCINE_SCHEDULE"
              :key="item.id"
              class="schedule-card"
              :class="{ current: isCurrentStageSchedule(item.id) }"
            >
              <div class="schedule-age">
                <Clock3 :size="16" />
                <strong>{{ item.age }}</strong>
                <span v-if="isCurrentStageSchedule(item.id)">当前重点</span>
              </div>
              <ul>
                <li v-for="vaccine in item.vaccines" :key="vaccine">
                  <CheckCircle2 :size="15" />
                  <span>{{ vaccine }}</span>
                </li>
              </ul>
              <p v-if="item.note" class="schedule-note">{{ item.note }}</p>
            </article>
          </div>
        </section>

        <section aria-labelledby="principles-title">
          <div class="section-heading">
            <ShieldCheck :size="21" />
            <div>
              <h3 id="principles-title">补种与接种原则</h3>
              <p>用于快速理解通用规则，不用于自行计算个体补种日期。</p>
            </div>
          </div>

          <div class="principle-grid">
            <article>
              <h4>漏种不用从头开始</h4>
              <p>未满 18 周岁且未完成规定剂次时，应尽早补齐未完成剂次，无需重新开始全程接种。</p>
            </article>
            <article>
              <h4>多种疫苗可以同时接种</h4>
              <p>国家免疫规划疫苗可按程序同时接种；两种注射类减毒活疫苗若未同时接种，应至少间隔 28 天。</p>
            </article>
            <article>
              <h4>按接种证和门诊记录核对</h4>
              <p>不同出生年份、既往接种产品及地方增补政策可能影响实际安排，补种间隔由接种门诊确认。</p>
            </article>
            <article>
              <h4>非免疫规划疫苗按需选择</h4>
              <p>流感、水痘、肺炎球菌、Hib、轮状病毒等疫苗，应结合年龄、健康状况、说明书和当地建议决定。</p>
            </article>
          </div>
        </section>

        <section aria-labelledby="safety-title">
          <div class="section-heading">
            <HeartPulse :size="21" />
            <div>
              <h3 id="safety-title">接种前后这样做</h3>
              <p>准备充分、如实告知、完成留观。</p>
            </div>
          </div>

          <div class="safety-grid">
            <article>
              <h4>接种前</h4>
              <ul>
                <li>携带预防接种证及当地要求的身份证明。</li>
                <li>如实告知发热或急性疾病、既往严重过敏、免疫缺陷或免疫抑制治疗、近期使用血液制品等情况。</li>
                <li>不要自行判断禁忌或提前、推迟接种，由接种医生评估。</li>
              </ul>
            </article>
            <article>
              <h4>接种后</h4>
              <ul>
                <li>在接种单位指定区域留观 30 分钟。</li>
                <li>保持接种部位清洁，轻微低热、红肿或乏力通常可先观察并适当休息。</li>
                <li>出现呼吸困难、意识异常、持续高热或其他严重不适时，立即告知接种人员或及时就医。</li>
              </ul>
            </article>
          </div>
        </section>

        <aside class="guide-disclaimer" role="note">
          <AlertTriangle :size="20" />
          <p>
            本攻略适用于中国大陆国家免疫规划的通用查阅，不记录个人接种史，也不替代医生诊断或接种门诊评估。地方增加的免费疫苗、疫苗供应和具体预约方式可能不同。
          </p>
        </aside>

        <section class="source-section" aria-labelledby="sources-title">
          <div class="section-heading compact">
            <FileText :size="20" />
            <div>
              <h3 id="sources-title">官方资料来源</h3>
              <p>内容更新于 {{ VACCINE_GUIDE_UPDATED_AT }}</p>
            </div>
          </div>
          <div class="source-list">
            <button v-for="source in VACCINE_GUIDE_SOURCES" :key="source.url" type="button" @click="openSource(source.url)">
              <span>
                <strong>{{ source.title }}</strong>
                <small>{{ source.organization }}</small>
              </span>
              <ExternalLink :size="16" />
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
  AlertTriangle, CalendarDays, CheckCircle2, Clock3, ExternalLink, FileText,
  HeartPulse, ShieldCheck, Sparkles, Syringe, Target, X
} from 'lucide-vue-next'
import { useDialogFocus } from '@/composables/useDialogFocus'
import { openExternalLink } from '@/utils/externalLinks'
import {
  VACCINE_GUIDE_SOURCES,
  VACCINE_GUIDE_UPDATED_AT,
  VACCINE_SCHEDULE,
  VACCINE_STAGE_GUIDANCE
} from '@/data/vaccineGuide'

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

const currentStageGuidance = computed(() => {
  const stageId = props.selectedAgeStages[0]
  return stageId ? VACCINE_STAGE_GUIDANCE[stageId] : null
})

const { handleDialogKeydown } = useDialogFocus({
  isVisible: () => props.visible,
  dialogRef: dialog,
  initialFocus: () => closeButton.value,
  onEscape: close
})

function isCurrentStageSchedule(scheduleId) {
  return currentStageGuidance.value?.scheduleIds.includes(scheduleId) || false
}

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
.vaccine-guide-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background-color: var(--overlay-color);
}

.vaccine-guide-dialog {
  display: flex;
  width: min(100%, 1080px);
  max-height: calc(100vh - 2rem);
  flex-direction: column;
  overflow: hidden;
  background-color: var(--card-bg);
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-xl);
}

.vaccine-guide-header {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 1.1rem 1.25rem;
  background:
    radial-gradient(circle at 92% 10%, rgba(255, 122, 104, 0.16), transparent 14rem),
    linear-gradient(135deg, var(--primary-soft), #fffaf2);
  border-bottom: 1px solid var(--border-color);
}

.guide-heading-icon {
  display: flex;
  width: 46px;
  height: 46px;
  align-items: center;
  justify-content: center;
  flex: 0 0 46px;
  color: white;
  background: linear-gradient(135deg, var(--accent-color), #d95d68);
  border-radius: 1rem;
  box-shadow: 0 10px 20px rgba(217, 93, 104, 0.18);
}

.guide-heading-copy {
  min-width: 0;
  flex: 1;
}

.guide-eyebrow {
  color: var(--primary-dark);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.08em;
}

.guide-heading-copy h2 {
  color: var(--text-primary);
  font-size: 1.25rem;
  line-height: 1.35;
}

.guide-heading-copy p {
  margin-top: 0.1rem;
  color: var(--text-secondary);
  font-size: 0.76rem;
}

.guide-close {
  width: 40px;
  min-height: 40px;
  flex: 0 0 40px;
  padding: 0;
  border-radius: 50%;
}

.vaccine-guide-body {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  padding: 1.2rem;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.current-stage-card {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 0.95rem 1rem;
  color: var(--primary-dark);
  background: linear-gradient(135deg, var(--primary-soft), #f8fcfa);
  border: 1px solid rgba(31, 118, 108, 0.2);
  border-radius: var(--radius-xl);
}

.current-stage-card > svg {
  flex: 0 0 auto;
  margin-top: 0.15rem;
}

.current-stage-card span {
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.06em;
}

.current-stage-card h3 {
  margin-top: 0.1rem;
  color: var(--text-primary);
  font-size: 0.98rem;
}

.current-stage-card p {
  margin-top: 0.2rem;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin-bottom: 0.75rem;
  color: var(--primary-dark);
}

.section-heading.compact {
  margin-bottom: 0.65rem;
}

.section-heading > svg {
  flex: 0 0 auto;
  margin-top: 0.14rem;
}

.section-heading h3 {
  color: var(--text-primary);
  font-size: 0.96rem;
  line-height: 1.4;
}

.section-heading p {
  margin-top: 0.08rem;
  color: var(--text-secondary);
  font-size: 0.72rem;
}

.guide-update-card {
  padding: 0.95rem 1rem;
  background: linear-gradient(135deg, var(--warm-soft), #fffaf2);
  border: 1px solid rgba(242, 173, 74, 0.28);
  border-radius: var(--radius-xl);
}

.update-grid,
.principle-grid,
.safety-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.update-item,
.principle-grid article,
.safety-grid article {
  padding: 0.8rem;
  background-color: rgba(255, 255, 255, 0.76);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.update-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.update-item strong,
.principle-grid h4,
.safety-grid h4 {
  color: var(--text-primary);
  font-size: 0.82rem;
}

.update-item span,
.principle-grid p,
.safety-grid li {
  color: var(--text-secondary);
  font-size: 0.74rem;
  line-height: 1.6;
}

.schedule-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.7rem;
}

.schedule-card {
  min-width: 0;
  padding: 0.85rem;
  background: linear-gradient(145deg, var(--surface-soft), white);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.schedule-card.current {
  background: linear-gradient(145deg, var(--primary-soft), white);
  border-color: rgba(31, 118, 108, 0.36);
  box-shadow: var(--shadow-sm);
}

.schedule-age {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--primary-dark);
}

.schedule-age strong {
  color: var(--text-primary);
  font-size: 0.82rem;
}

.schedule-age span {
  margin-left: auto;
  padding: 0.12rem 0.4rem;
  color: white;
  background-color: var(--primary-color);
  border-radius: 999px;
  font-size: 0.62rem;
  font-weight: 700;
}

.schedule-card ul,
.safety-grid ul {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.55rem;
  list-style: none;
}

.schedule-card li {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  color: var(--text-primary);
  font-size: 0.74rem;
  line-height: 1.5;
}

.schedule-card li svg {
  flex: 0 0 auto;
  margin-top: 0.08rem;
  color: var(--success-color);
}

.schedule-note {
  margin-top: 0.55rem;
  padding-top: 0.5rem;
  color: var(--text-secondary);
  border-top: 1px dashed var(--border-color);
  font-size: 0.68rem;
  line-height: 1.55;
}

.principle-grid article {
  background-color: var(--surface-soft);
}

.principle-grid p {
  margin-top: 0.25rem;
}

.safety-grid article {
  background: linear-gradient(145deg, #ffffff, var(--surface-soft));
}

.safety-grid li {
  position: relative;
  padding-left: 0.8rem;
}

.safety-grid li::before {
  content: "";
  position: absolute;
  top: 0.58rem;
  left: 0;
  width: 4px;
  height: 4px;
  background-color: var(--primary-color);
  border-radius: 50%;
}

.guide-disclaimer {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.85rem;
  color: #74520d;
  background-color: var(--warm-soft);
  border: 1px solid rgba(242, 173, 74, 0.3);
  border-radius: var(--radius-lg);
}

.guide-disclaimer svg {
  flex: 0 0 auto;
  margin-top: 0.08rem;
}

.guide-disclaimer p {
  font-size: 0.72rem;
  line-height: 1.6;
}

.source-section {
  padding: 0.9rem;
  background-color: var(--surface-muted);
  border-radius: var(--radius-xl);
}

.source-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
}

.source-list button {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 0.55rem;
  padding: 0.7rem;
  color: var(--text-primary);
  text-align: left;
  background-color: white;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.source-list button:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.source-list button span {
  min-width: 0;
  flex: 1;
}

.source-list strong,
.source-list small {
  display: block;
}

.source-list strong {
  font-size: 0.7rem;
  line-height: 1.45;
}

.source-list small {
  margin-top: 0.15rem;
  color: var(--text-secondary);
  font-size: 0.62rem;
}

.source-list svg {
  flex: 0 0 auto;
  color: var(--primary-dark);
}

@media (max-width: 900px) {
  .schedule-grid,
  .source-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .vaccine-guide-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .vaccine-guide-dialog {
    width: 100%;
    max-height: 96vh;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  }

  .vaccine-guide-header {
    align-items: flex-start;
    padding: 0.9rem;
  }

  .guide-heading-icon {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
    border-radius: 0.82rem;
  }

  .guide-heading-copy h2 {
    font-size: 1.08rem;
  }

  .guide-heading-copy p {
    display: none;
  }

  .guide-close {
    width: 36px;
    min-height: 36px;
    flex-basis: 36px;
  }

  .vaccine-guide-body {
    gap: 1rem;
    padding: 0.85rem;
  }

  .schedule-grid,
  .update-grid,
  .principle-grid,
  .safety-grid,
  .source-list {
    grid-template-columns: 1fr;
  }
}
</style>
