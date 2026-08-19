<template>
  <div v-if="visible" class="growth-overlay" @click.self="close" @keydown="handleDialogKeydown">
    <div ref="dialog" class="growth-dialog" role="dialog" aria-modal="true" aria-labelledby="growth-tracker-title">
      <header class="growth-header">
        <div class="growth-header-icon">
          <TrendingUp :size="24" />
        </div>
        <div class="growth-header-copy">
          <div class="growth-eyebrow">个人成长记录</div>
          <h2 id="growth-tracker-title">生长曲线</h2>
          <p>持续记录身高、体重和头围，用趋势了解孩子自己的变化。</p>
        </div>
        <button ref="closeButton" type="button" class="btn btn-secondary growth-close" aria-label="关闭生长曲线" @click="close">
          <X :size="20" />
        </button>
      </header>

      <div class="growth-body">
        <section class="growth-summary" aria-label="最新成长数据">
          <article>
            <span class="summary-icon records"><ClipboardList :size="18" /></span>
            <div>
              <small>测量记录</small>
              <strong>{{ sortedRecords.length }} 次</strong>
              <span>{{ latestRecord ? `最近 ${formatDate(latestRecord.measuredAt)}` : '等待首次记录' }}</span>
            </div>
          </article>
          <article v-for="summary in primarySummaries" :key="summary.metric.key">
            <span class="summary-icon" :style="{ color: summary.metric.color, backgroundColor: summary.metric.fill }">
              <component :is="summary.metric.key === 'heightCm' ? Ruler : summary.metric.key === 'weightKg' ? Scale : CircleGauge" :size="18" />
            </span>
            <div>
              <small>最新{{ summary.metric.label }}</small>
              <strong>
                {{ summary.latestValue === null ? '--' : formatNumber(summary.latestValue) }}
                <em v-if="summary.latestValue !== null">{{ summary.metric.unit }}</em>
              </strong>
              <span :class="getChangeClass(summary.change)">{{ formatChange(summary.change, summary.metric.unit) }}</span>
            </div>
          </article>
        </section>

        <div class="growth-main">
          <section class="chart-panel" aria-labelledby="growth-chart-title">
            <div class="panel-heading">
              <div>
                <h3 id="growth-chart-title">变化趋势</h3>
                <p>横轴为测量日期，纵轴为所选指标数值。</p>
              </div>
              <div class="metric-tabs" role="tablist" aria-label="选择趋势指标">
                <button
                  v-for="metric in GROWTH_METRICS"
                  :key="metric.key"
                  type="button"
                  role="tab"
                  :aria-selected="activeMetricKey === metric.key"
                  :class="{ active: activeMetricKey === metric.key }"
                  @click="activeMetricKey = metric.key"
                >
                  {{ metric.label }}
                </button>
              </div>
            </div>

            <div v-if="chartModel.points.length" class="chart-wrap">
              <div class="chart-legend">
                <span :style="{ backgroundColor: chartModel.metric.color }"></span>
                {{ chartModel.metric.label }}（{{ chartModel.metric.unit }}）
              </div>
              <svg
                class="growth-chart"
                :viewBox="chartModel.viewBox"
                role="img"
                :aria-label="`${chartModel.metric.label}变化趋势，共${chartModel.points.length}条记录`"
              >
                <g class="grid-lines">
                  <g v-for="tick in chartModel.yTicks" :key="tick.y">
                    <line x1="54" x2="742" :y1="tick.y" :y2="tick.y" />
                    <text x="46" :y="tick.y + 4" text-anchor="end">{{ tick.value }}</text>
                  </g>
                </g>
                <path v-if="chartModel.areaPath" :d="chartModel.areaPath" :fill="chartModel.metric.fill" />
                <path
                  :d="chartModel.linePath"
                  fill="none"
                  :stroke="chartModel.metric.color"
                  stroke-width="4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <g v-for="point in chartModel.points" :key="point.id" class="chart-point">
                  <circle :cx="point.x" :cy="point.y" r="6" :fill="chartModel.metric.color" />
                  <circle :cx="point.x" :cy="point.y" r="3" fill="white" />
                  <title>{{ formatDate(point.measuredAt) }}：{{ point.valueLabel }}</title>
                </g>
                <g class="x-labels">
                  <text v-for="label in chartModel.xLabels" :key="`${label.x}-${label.label}`" :x="label.x" y="264" text-anchor="middle">
                    {{ label.label }}
                  </text>
                </g>
              </svg>
            </div>

            <div v-else class="chart-empty">
              <LineChart :size="48" />
              <h4>{{ activeMetricKey === 'headCircumferenceCm' ? '还没有头围数据' : '还没有成长记录' }}</h4>
              <p>{{ activeMetricKey === 'headCircumferenceCm' ? '新增记录时填写头围，即可生成趋势。' : '在右侧新增第一次测量，图表会自动生成。' }}</p>
            </div>

            <p class="chart-notice">
              <Info :size="15" />
              图表仅展示个人记录的变化，不代表医学评价、生长百分位或诊断结论。
            </p>
          </section>

          <aside class="record-form-panel" aria-labelledby="growth-form-title">
            <div class="form-panel-heading">
              <div>
                <h3 id="growth-form-title">{{ editingId ? '编辑测量记录' : '新增测量记录' }}</h3>
                <p>建议在相近时段、相似测量条件下记录。</p>
              </div>
              <button v-if="editingId" type="button" class="btn btn-secondary btn-sm" @click="resetForm">取消编辑</button>
            </div>

            <form @submit.prevent="saveRecord">
              <div class="form-group">
                <label class="form-label" for="growth-date">测量日期 *</label>
                <input id="growth-date" v-model="form.measuredAt" class="form-input" type="date" :max="today" required />
              </div>
              <div class="measurement-inputs">
                <div class="form-group">
                  <label class="form-label" for="growth-height">身高（cm）*</label>
                  <input id="growth-height" v-model="form.heightCm" class="form-input" type="number" min="20" max="250" step="0.1" placeholder="例如 105.5" required />
                </div>
                <div class="form-group">
                  <label class="form-label" for="growth-weight">体重（kg）*</label>
                  <input id="growth-weight" v-model="form.weightKg" class="form-input" type="number" min="0.5" max="300" step="0.1" placeholder="例如 16.8" required />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label" for="growth-head">头围（cm，可选）</label>
                <input id="growth-head" v-model="form.headCircumferenceCm" class="form-input" type="number" min="20" max="80" step="0.1" placeholder="婴幼儿阶段可记录" />
              </div>
              <div class="form-group">
                <label class="form-label" for="growth-note">备注（可选）</label>
                <textarea id="growth-note" v-model="form.note" class="form-textarea" maxlength="200" placeholder="例如体检、晨起空腹测量等"></textarea>
                <span class="field-count">{{ form.note.length }}/200</span>
              </div>

              <div v-if="formError" class="form-error" role="alert">
                <AlertCircle :size="16" />
                {{ formError }}
              </div>

              <button type="submit" class="btn btn-primary save-record" :disabled="saving">
                <Save :size="17" />
                {{ saving ? '保存中…' : editingId ? '保存修改' : '添加记录' }}
              </button>
            </form>
          </aside>
        </div>

        <section class="history-panel" aria-labelledby="growth-history-title">
          <div class="panel-heading">
            <div>
              <h3 id="growth-history-title">历史记录</h3>
              <p>按测量日期从近到远排列。</p>
            </div>
          </div>

          <div v-if="recentRecords.length" class="history-list">
            <article v-for="record in recentRecords" :key="record.id">
              <div class="record-date">
                <CalendarDays :size="17" />
                <strong>{{ formatDate(record.measuredAt) }}</strong>
              </div>
              <div class="record-values">
                <span><Ruler :size="15" />{{ formatNumber(record.heightCm) }} cm</span>
                <span><Scale :size="15" />{{ formatNumber(record.weightKg) }} kg</span>
                <span v-if="record.headCircumferenceCm !== null"><CircleGauge :size="15" />{{ formatNumber(record.headCircumferenceCm) }} cm</span>
              </div>
              <p v-if="record.note" class="record-note">{{ record.note }}</p>
              <div class="record-actions">
                <button type="button" class="btn btn-secondary btn-sm" :aria-label="`编辑${record.measuredAt}的成长记录`" @click="editRecord(record)">
                  <Edit3 :size="15" />编辑
                </button>
                <button type="button" class="btn btn-danger btn-sm" :aria-label="`删除${record.measuredAt}的成长记录`" @click="deleteRecord(record)">
                  <Trash2 :size="15" />删除
                </button>
              </div>
            </article>
          </div>

          <div v-else class="history-empty">
            <ClipboardList :size="38" />
            <p>保存测量记录后，会在这里形成连续的成长档案。</p>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  AlertCircle, CalendarDays, CircleGauge, ClipboardList, Edit3, Info,
  LineChart, Ruler, Save, Scale, Trash2, TrendingUp, X
} from 'lucide-vue-next'
import { store, generateId } from '@/data/store'
import { useDialogFocus } from '@/composables/useDialogFocus'
import {
  GROWTH_METRICS,
  buildGrowthChartModel,
  getLatestMetricSummary
} from '@/utils/growthChart'

const props = defineProps({
  visible: Boolean
})

const emit = defineEmits(['close'])
const dialog = ref(null)
const closeButton = ref(null)
const activeMetricKey = ref('heightCm')
const editingId = ref(null)
const saving = ref(false)
const formError = ref('')
const today = getLocalDateInputValue()
const form = ref(createEmptyForm())

const sortedRecords = computed(() => (
  [...store.growthRecords].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt))
))
const recentRecords = computed(() => [...sortedRecords.value].reverse())
const latestRecord = computed(() => sortedRecords.value.at(-1) || null)
const chartModel = computed(() => buildGrowthChartModel(sortedRecords.value, activeMetricKey.value))
const primarySummaries = computed(() => (
  GROWTH_METRICS.map(metric => getLatestMetricSummary(sortedRecords.value, metric.key))
))

const { handleDialogKeydown } = useDialogFocus({
  isVisible: () => props.visible,
  dialogRef: dialog,
  initialFocus: () => closeButton.value,
  onEscape: close
})

function getLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function createEmptyForm() {
  return {
    measuredAt: getLocalDateInputValue(),
    heightCm: '',
    weightKg: '',
    headCircumferenceCm: '',
    note: ''
  }
}

function formatNumber(value) {
  return Number(value).toFixed(1).replace(/\.0$/, '')
}

function formatDate(value) {
  const [year, month, day] = value.split('-')
  return `${year}年${Number(month)}月${Number(day)}日`
}

function formatChange(change, unit) {
  if (change === null) return '暂无对比数据'
  if (change === 0) return '与上次相同'
  return `较上次 ${change > 0 ? '+' : ''}${formatNumber(change)} ${unit}`
}

function getChangeClass(change) {
  if (change === null || change === 0) return ''
  return change > 0 ? 'change-up' : 'change-down'
}

function resetForm() {
  editingId.value = null
  formError.value = ''
  form.value = createEmptyForm()
}

function validateForm() {
  if (form.value.measuredAt > today) return '测量日期不能晚于今天'
  const duplicate = store.growthRecords.some(record => (
    record.measuredAt === form.value.measuredAt && record.id !== editingId.value
  ))
  if (duplicate) return '该日期已经有记录，请编辑现有记录或选择其他日期'
  const height = Number(form.value.heightCm)
  const weight = Number(form.value.weightKg)
  if (!Number.isFinite(height) || height < 20 || height > 250) return '身高请输入 20—250 cm 之间的数值'
  if (!Number.isFinite(weight) || weight < 0.5 || weight > 300) return '体重请输入 0.5—300 kg 之间的数值'
  if (form.value.headCircumferenceCm !== '') {
    const head = Number(form.value.headCircumferenceCm)
    if (!Number.isFinite(head) || head < 20 || head > 80) return '头围请输入 20—80 cm 之间的数值'
  }
  return ''
}

async function saveRecord() {
  formError.value = validateForm()
  if (formError.value) return

  saving.value = true
  const existing = editingId.value
    ? store.growthRecords.find(record => record.id === editingId.value)
    : null
  const now = Date.now()
  const record = {
    id: editingId.value || generateId('growth-'),
    measuredAt: form.value.measuredAt,
    heightCm: Number(form.value.heightCm),
    weightKg: Number(form.value.weightKg),
    headCircumferenceCm: form.value.headCircumferenceCm === ''
      ? null
      : Number(form.value.headCircumferenceCm),
    note: form.value.note.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  }

  try {
    await store.upsertGrowthRecord(record)
    resetForm()
  } catch {
    formError.value = '记录保存失败，请稍后重试'
  } finally {
    saving.value = false
  }
}

function editRecord(record) {
  editingId.value = record.id
  formError.value = ''
  form.value = {
    measuredAt: record.measuredAt,
    heightCm: String(record.heightCm),
    weightKg: String(record.weightKg),
    headCircumferenceCm: record.headCircumferenceCm === null ? '' : String(record.headCircumferenceCm),
    note: record.note
  }
  dialog.value?.querySelector('#growth-date')?.focus()
}

async function deleteRecord(record) {
  if (!confirm(`确定删除 ${formatDate(record.measuredAt)} 的成长记录吗？`)) return
  try {
    await store.deleteGrowthRecord(record.id)
    if (editingId.value === record.id) resetForm()
  } catch {
    alert('成长记录删除失败，请稍后重试')
  }
}

function close() {
  emit('close')
}
</script>

<style scoped>
.growth-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background-color: var(--overlay-color);
}

.growth-dialog {
  display: flex;
  width: min(100%, 1140px);
  max-height: calc(100vh - 2rem);
  flex-direction: column;
  overflow: hidden;
  background-color: var(--card-bg);
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: var(--radius-2xl);
  box-shadow: var(--shadow-xl);
}

.growth-header {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 1.05rem 1.25rem;
  background:
    radial-gradient(circle at 92% 10%, rgba(59, 130, 246, 0.13), transparent 14rem),
    linear-gradient(135deg, #eef5ff, #effbf7 56%, #fffaf1);
  border-bottom: 1px solid var(--border-color);
}

.growth-header-icon {
  display: flex;
  width: 46px;
  height: 46px;
  align-items: center;
  justify-content: center;
  flex: 0 0 46px;
  color: white;
  background: linear-gradient(135deg, #4f8df5, #287f74);
  border-radius: 1rem;
  box-shadow: 0 10px 20px rgba(59, 130, 246, 0.2);
}

.growth-header-copy {
  min-width: 0;
  flex: 1;
}

.growth-eyebrow {
  color: var(--primary-dark);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.08em;
}

.growth-header h2 {
  color: var(--text-primary);
  font-size: 1.25rem;
  line-height: 1.35;
}

.growth-header p {
  margin-top: 0.08rem;
  color: var(--text-secondary);
  font-size: 0.76rem;
}

.growth-close {
  width: 40px;
  min-height: 40px;
  flex: 0 0 40px;
  padding: 0;
  border-radius: 50%;
}

.growth-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.1rem;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.growth-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
}

.growth-summary article {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 0.65rem;
  padding: 0.8rem;
  background: linear-gradient(145deg, white, var(--surface-soft));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.summary-icon {
  display: flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  flex: 0 0 38px;
  border-radius: 0.8rem;
}

.summary-icon.records {
  color: var(--primary-dark);
  background-color: var(--primary-soft);
}

.growth-summary article > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.growth-summary small {
  color: var(--text-secondary);
  font-size: 0.66rem;
}

.growth-summary strong {
  color: var(--text-primary);
  font-size: 1.02rem;
  line-height: 1.35;
}

.growth-summary strong em {
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-style: normal;
  font-weight: 550;
}

.growth-summary article > div > span {
  color: var(--text-muted);
  font-size: 0.63rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.growth-summary .change-up {
  color: var(--success-color);
}

.growth-summary .change-down {
  color: var(--accent-color);
}

.growth-main {
  display: grid;
  grid-template-columns: minmax(0, 1.75fr) minmax(280px, 0.8fr);
  align-items: start;
  gap: 0.8rem;
}

.chart-panel,
.record-form-panel,
.history-panel {
  padding: 1rem;
  background-color: white;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
}

.panel-heading,
.form-panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
  margin-bottom: 0.8rem;
}

.panel-heading h3,
.form-panel-heading h3 {
  color: var(--text-primary);
  font-size: 0.94rem;
}

.panel-heading p,
.form-panel-heading p {
  margin-top: 0.08rem;
  color: var(--text-secondary);
  font-size: 0.7rem;
}

.metric-tabs {
  display: inline-flex;
  gap: 0.2rem;
  padding: 0.2rem;
  background-color: var(--surface-muted);
  border-radius: var(--radius-md);
}

.metric-tabs button {
  min-height: 32px;
  padding: 0.3rem 0.65rem;
  color: var(--text-secondary);
  background-color: transparent;
  border: 0;
  border-radius: 0.55rem;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
}

.metric-tabs button.active {
  color: white;
  background-color: var(--primary-color);
  box-shadow: var(--shadow-sm);
}

.chart-wrap {
  position: relative;
  min-height: 300px;
  padding-top: 1.1rem;
  background: linear-gradient(180deg, var(--surface-soft), white);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.chart-legend {
  position: absolute;
  top: 0.6rem;
  right: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-secondary);
  font-size: 0.68rem;
}

.chart-legend span {
  width: 18px;
  height: 4px;
  border-radius: 999px;
}

.growth-chart {
  display: block;
  width: 100%;
  min-height: 280px;
}

.grid-lines line {
  stroke: var(--border-color);
  stroke-dasharray: 4 6;
  stroke-width: 1;
}

.grid-lines text,
.x-labels text {
  fill: var(--text-muted);
  font-size: 11px;
}

.chart-point {
  cursor: help;
}

.chart-empty {
  display: flex;
  min-height: 300px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 2rem;
  color: var(--primary-light);
  text-align: center;
  background: linear-gradient(145deg, var(--surface-soft), white);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
}

.chart-empty h4 {
  margin-top: 0.7rem;
  color: var(--text-primary);
  font-size: 0.9rem;
}

.chart-empty p {
  margin-top: 0.2rem;
  color: var(--text-secondary);
  font-size: 0.72rem;
}

.chart-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  margin-top: 0.65rem;
  color: var(--text-secondary);
  font-size: 0.68rem;
  line-height: 1.5;
}

.chart-notice svg {
  flex: 0 0 auto;
  margin-top: 0.08rem;
  color: var(--primary-dark);
}

.record-form-panel {
  background: linear-gradient(145deg, #ffffff, var(--surface-soft));
}

.record-form-panel .form-group {
  position: relative;
  margin-bottom: 0.8rem;
}

.measurement-inputs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.field-count {
  position: absolute;
  right: 0.55rem;
  bottom: 0.35rem;
  color: var(--text-muted);
  font-size: 0.6rem;
}

.form-error {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  margin-bottom: 0.8rem;
  padding: 0.65rem;
  color: var(--danger-dark);
  background-color: #fff1f2;
  border: 1px solid rgba(196, 72, 84, 0.2);
  border-radius: var(--radius-md);
  font-size: 0.7rem;
  line-height: 1.45;
}

.form-error svg {
  flex: 0 0 auto;
}

.save-record {
  width: 100%;
}

.history-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.history-list article {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
  padding: 0.75rem;
  background-color: var(--surface-soft);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.record-date {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--primary-dark);
}

.record-date strong {
  color: var(--text-primary);
  font-size: 0.75rem;
  white-space: nowrap;
}

.record-values {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.record-values span {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.22rem 0.42rem;
  color: var(--text-secondary);
  background-color: white;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 0.65rem;
}

.record-note {
  grid-column: 1 / -1;
  color: var(--text-secondary);
  font-size: 0.68rem;
  line-height: 1.45;
}

.record-actions {
  display: flex;
  gap: 0.35rem;
}

.history-empty {
  display: flex;
  min-height: 120px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: var(--primary-light);
  text-align: center;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
}

.history-empty p {
  margin-top: 0.45rem;
  color: var(--text-secondary);
  font-size: 0.72rem;
}

@media (max-width: 960px) {
  .growth-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .growth-main {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .history-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .growth-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .growth-dialog {
    width: 100%;
    max-height: 96vh;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  }

  .growth-header {
    align-items: flex-start;
    padding: 0.9rem;
  }

  .growth-header-icon {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
    border-radius: 0.82rem;
  }

  .growth-header h2 {
    font-size: 1.08rem;
  }

  .growth-header p {
    display: none;
  }

  .growth-close {
    width: 36px;
    min-height: 36px;
    flex-basis: 36px;
  }

  .growth-body {
    padding: 0.75rem;
  }

  .growth-summary {
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .growth-summary article {
    gap: 0.5rem;
    padding: 0.65rem;
  }

  .summary-icon {
    width: 34px;
    height: 34px;
    flex-basis: 34px;
  }

  .chart-panel,
  .record-form-panel,
  .history-panel {
    padding: 0.8rem;
    border-radius: var(--radius-lg);
  }

  .panel-heading {
    flex-direction: column;
  }

  .metric-tabs {
    width: 100%;
  }

  .metric-tabs button {
    flex: 1;
  }

  .chart-wrap,
  .chart-empty {
    min-height: 240px;
  }

  .growth-chart {
    min-width: 520px;
    min-height: 240px;
  }

  .chart-wrap {
    overflow-x: auto;
  }

  .measurement-inputs {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .history-list article {
    grid-template-columns: 1fr;
  }

  .record-actions {
    justify-content: flex-end;
  }
}
</style>
