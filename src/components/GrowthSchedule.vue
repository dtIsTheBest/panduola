<template>
  <div v-if="visible" class="schedule-overlay" @click.self="close" @keydown="handleDialogKeydown">
    <div ref="dialog" class="schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
      <header class="schedule-header">
        <div><span>家庭计划</span><h2 id="schedule-title">成长日程</h2><p>今天做什么，一眼就知道。</p></div>
        <button ref="closeButton" class="btn btn-secondary" type="button" :disabled="busy" aria-label="关闭成长日程" @click="close"><X :size="20" /></button>
      </header>

      <div class="schedule-toolbar">
        <div class="view-tabs" role="group" aria-label="日程范围">
          <button v-for="view in views" :key="view.id" type="button" :aria-pressed="activeView === view.id" :disabled="busy" :class="{ active: activeView === view.id }" @click="activeView = view.id">{{ view.label }}</button>
        </div>
        <select v-model="childFilter" class="form-input" aria-label="筛选孩子" :disabled="busy">
          <option value="all">全部家庭</option>
          <option value="family">全家事项</option>
          <option v-for="child in store.growthChildren" :key="child.id" :value="child.id">{{ child.name }}</option>
        </select>
        <button ref="addButton" type="button" class="btn btn-primary" :disabled="busy" @click="startCreate"><Plus :size="16" />新增日程</button>
      </div>

      <main class="schedule-content">
        <section class="schedule-list" :aria-label="activeView === 'today' ? '今天日程' : '接下来日程'">
          <article v-for="occurrence in visibleOccurrences" :key="`${occurrence.id}-${occurrence.occurrenceDate}`" :class="['schedule-item', { completed: occurrence.completed }]">
            <button type="button" class="complete-button" :aria-label="occurrence.completed ? '撤销完成' : '标记完成'" :disabled="busy" @click="toggleComplete(occurrence)"><Check v-if="occurrence.completed" :size="17" /></button>
            <div class="item-copy">
              <div class="item-meta"><span>{{ formatDate(occurrence.occurrenceDate) }}</span><span v-if="occurrence.startTime">{{ occurrence.startTime }}</span><span>{{ ownerLabel(occurrence.childId) }}</span><span>{{ typeLabel(occurrence.type) }}</span></div>
              <strong>{{ occurrence.title }}</strong>
              <small>{{ statusLabel(occurrence) }}<template v-if="occurrence.recurrence !== 'none'"> · {{ recurrenceLabel(occurrence.recurrence) }}</template></small>
            </div>
            <div class="item-actions">
              <button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="editItem(occurrence)">编辑</button>
              <button type="button" class="btn btn-danger btn-sm" :disabled="busy" @click="removeItem(occurrence)">删除</button>
            </div>
          </article>
          <div v-if="!visibleOccurrences.length" class="empty-state"><CalendarDays :size="40" /><strong>{{ activeView === 'today' ? '今天没有安排' : '接下来还没有日程' }}</strong><span>留一点空白，也是一种好安排。</span></div>
        </section>

        <aside v-if="formVisible" class="schedule-form-panel" aria-label="日程表单">
          <div class="form-heading"><h3>{{ editingId ? '编辑日程' : '新增日程' }}</h3><button type="button" class="btn btn-secondary btn-sm" :disabled="busy" @click="cancelForm">取消</button></div>
          <form @submit.prevent="saveItem">
            <fieldset :disabled="busy">
            <label>事项名称<input ref="titleInput" v-model="form.title" class="form-input" maxlength="60" :disabled="busy" required placeholder="例如：儿童保健体检" /></label>
            <div class="form-row"><label>日期<input v-model="form.startDate" class="form-input" type="date" required /></label><label>时间（可选）<input v-model="form.startTime" class="form-input" type="time" /></label></div>
            <div class="form-row"><label>归属<select v-model="form.childId" class="form-input"><option value="">全家</option><option v-for="child in store.growthChildren" :key="child.id" :value="child.id">{{ child.name }}</option></select></label><label>类型<select v-model="form.type" class="form-input"><option v-for="type in types" :key="type.id" :value="type.id">{{ type.label }}</option></select></label></div>
            <label>重复<select v-model="form.recurrence" class="form-input"><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option></select></label>
            <label>备注（可选）<textarea v-model="form.note" class="form-textarea" maxlength="200" placeholder="补充地点或注意事项"></textarea></label>
            <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
            <button class="btn btn-primary save-button" type="submit" :disabled="busy">{{ busy ? '保存中…' : '保存日程' }}</button>
            </fieldset>
          </form>
        </aside>
      </main>
      <p class="sr-only" role="status" aria-live="polite">{{ announcement }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarDays, Check, Plus, X } from 'lucide-vue-next'
import { generateId, store } from '@/data/store'
import { addDays, getLocalDateOnly, getOccurrenceStatus, getScheduleOccurrences } from '@/utils/growthSchedule'
import { useDialogFocus } from '@/composables/useDialogFocus'

const props = defineProps({ visible: Boolean })
const emit = defineEmits(['close'])
const views = [{ id: 'today', label: '今天' }, { id: 'upcoming', label: '接下来' }]
const types = [
  { id: 'checkup', label: '体检' }, { id: 'vaccine', label: '疫苗' },
  { id: 'course', label: '课程' }, { id: 'activity', label: '活动' },
  { id: 'habit', label: '习惯' }, { id: 'other', label: '其他' }
]
const dialog = ref(null)
const closeButton = ref(null)
const titleInput = ref(null)
const addButton = ref(null)
const activeView = ref('today')
const childFilter = ref('all')
const formVisible = ref(false)
const editingId = ref(null)
const busy = ref(false)
const formError = ref('')
const announcement = ref('')
const pendingReset = ref(false)
const nowTick = ref(Date.now())
const form = ref(emptyForm())
const today = computed(() => getLocalDateOnly(new Date(nowTick.value)))
const currentTime = computed(() => new Date(nowTick.value).toTimeString().slice(0, 5))

const occurrences = computed(() => getScheduleOccurrences(
  store.scheduleItems,
  store.scheduleCompletions,
  today.value,
  addDays(today.value, 30)
))
const visibleOccurrences = computed(() => occurrences.value.filter(item => {
  const matchesView = activeView.value === 'today'
    ? item.occurrenceDate === today.value
    : item.occurrenceDate > today.value
  const matchesChild = childFilter.value === 'all' ||
    (childFilter.value === 'family' ? item.childId === null : item.childId === childFilter.value)
  return matchesView && matchesChild
}))

const { handleDialogKeydown } = useDialogFocus({
  isVisible: () => props.visible,
  dialogRef: dialog,
  initialFocus: () => closeButton.value,
  onEscape: close
})

let clockTimer = null
onMounted(() => {
  clockTimer = setInterval(() => { nowTick.value = Date.now() }, 60_000)
  document.addEventListener('visibilitychange', refreshClock)
})
onBeforeUnmount(() => {
  clearInterval(clockTimer)
  document.removeEventListener('visibilitychange', refreshClock)
})

watch([() => store.activeSpaceKey, () => store.dataGeneration], resetForAuthoritativeUpdate)
watch(busy, value => { if (!value && pendingReset.value) resetForAuthoritativeUpdate() })

function emptyForm() {
  return { title: '', startDate: getLocalDateOnly(), startTime: '', childId: '', type: 'activity', recurrence: 'none', note: '' }
}
function refreshClock() { if (!document.hidden) nowTick.value = Date.now() }
function startCreate() { if (busy.value) return; editingId.value = null; form.value = emptyForm(); formVisible.value = true; void nextTick(() => titleInput.value?.focus()) }
function cancelForm(restoreFocus = true) { formVisible.value = false; editingId.value = null; formError.value = ''; form.value = emptyForm(); if (restoreFocus) void nextTick(() => addButton.value?.focus()) }
function resetForAuthoritativeUpdate() { if (!props.visible) { pendingReset.value = false; childFilter.value = 'all'; cancelForm(false); announcement.value = ''; return }; if (busy.value) { pendingReset.value = true; return }; pendingReset.value = false; childFilter.value = 'all'; cancelForm(false); announcement.value = '数据已更新，请重新操作'; void nextTick(() => addButton.value?.focus()) }
function editItem(item) { if (busy.value) return; editingId.value = item.id; form.value = { title: item.title, startDate: item.startDate, startTime: item.startTime || '', childId: item.childId || '', type: item.type, recurrence: item.recurrence, note: item.note }; formVisible.value = true; void nextTick(() => titleInput.value?.focus()) }
function ownerLabel(childId) { return childId === null ? '全家' : store.growthChildren.find(child => child.id === childId)?.name || '未知孩子' }
function typeLabel(type) { return types.find(item => item.id === type)?.label || '其他' }
function recurrenceLabel(value) { return value === 'daily' ? '每天' : '每周' }
function formatDate(value) { const [, month, day] = value.split('-'); return `${Number(month)}月${Number(day)}日` }
function statusLabel(item) { return { completed: '已完成', overdue: '已逾期', today: '今天', upcoming: '即将到来' }[getOccurrenceStatus(item, today.value, currentTime.value)] }

async function saveItem() {
  if (busy.value) return
  busy.value = true
  const operationSpaceKey = store.activeSpaceKey
  const generation = store.dataGeneration
  const now = Date.now()
  try {
    await store.upsertScheduleItem({ id: editingId.value || generateId('schedule-'), childId: form.value.childId || null, title: form.value.title, type: form.value.type, startDate: form.value.startDate, startTime: form.value.startTime || null, recurrence: form.value.recurrence, note: form.value.note, createdAt: editingId.value ? store.scheduleItems.find(item => item.id === editingId.value)?.createdAt ?? now : now, updatedAt: now }, { expectedDataGeneration: generation })
    if (store.activeSpaceKey === operationSpaceKey) { announcement.value = '日程已保存'; cancelForm() }
  } catch (error) { if (store.activeSpaceKey === operationSpaceKey) formError.value = error instanceof Error ? error.message : '日程保存失败' }
  finally { busy.value = false }
}
async function toggleComplete(item) { if (busy.value) return; busy.value = true; const spaceKey = store.activeSpaceKey; try { await store.setScheduleOccurrenceCompleted(item.id, item.occurrenceDate, !item.completed, { expectedDataGeneration: store.dataGeneration }); if (store.activeSpaceKey === spaceKey) announcement.value = item.completed ? '已撤销完成' : '已完成' } catch { if (store.activeSpaceKey === spaceKey) announcement.value = '操作失败，请稍后重试' } finally { busy.value = false } }
async function removeItem(item) { const scope = item.recurrence === 'none' ? '此日程' : '整组重复日程及其完成记录'; if (busy.value || !confirm(`确定删除${scope}“${item.title}”吗？`)) return; busy.value = true; const spaceKey = store.activeSpaceKey; try { await store.deleteScheduleItem(item.id, { expectedDataGeneration: store.dataGeneration }); if (store.activeSpaceKey === spaceKey) { announcement.value = '日程已删除'; if (editingId.value === item.id) cancelForm(false); void nextTick(() => addButton.value?.focus()) } } catch { if (store.activeSpaceKey === spaceKey) announcement.value = '删除失败，请稍后重试' } finally { busy.value = false } }
function close() { if (!busy.value) emit('close') }
</script>

<style scoped>
.schedule-overlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:1rem;background:var(--overlay-color)}
.schedule-dialog{width:min(980px,100%);max-height:calc(100vh - 2rem);overflow:auto;background:var(--surface-color);border-radius:var(--radius-xl);box-shadow:var(--shadow-xl)}
.schedule-header,.schedule-toolbar,.schedule-content{display:flex;gap:.75rem;padding:1rem}.schedule-header{align-items:flex-start;justify-content:space-between;border-bottom:1px solid var(--border-color)}
.schedule-header span,.item-meta,small{color:var(--text-secondary);font-size:.72rem}.schedule-header h2{margin:.15rem 0}.schedule-header p{margin:0;color:var(--text-secondary)}
.schedule-toolbar{align-items:center;background:var(--surface-soft);border-bottom:1px solid var(--border-color)}.schedule-toolbar select{width:12rem}.view-tabs{display:flex;gap:.25rem}.view-tabs button{padding:.55rem .8rem;border:0;border-radius:var(--radius-md);background:transparent}.view-tabs button.active{color:white;background:var(--primary-color)}
.schedule-content{align-items:flex-start}.schedule-list{display:grid;flex:1;gap:.6rem;min-width:0}.schedule-item{display:flex;align-items:center;gap:.65rem;padding:.75rem;border:1px solid var(--border-color);border-radius:var(--radius-lg)}.schedule-item.completed{opacity:.65}.complete-button{display:grid;place-items:center;width:1.8rem;height:1.8rem;border:2px solid var(--primary-color);border-radius:50%;color:white;background:transparent}.completed .complete-button{background:var(--primary-color)}.item-copy{display:grid;flex:1;gap:.2rem;min-width:0;overflow-wrap:anywhere}.item-meta{display:flex;flex-wrap:wrap;gap:.5rem}.item-actions{display:flex;gap:.35rem}
.schedule-form-panel{width:20rem;padding:1rem;background:var(--surface-soft);border-radius:var(--radius-lg)}.form-heading{display:flex;align-items:center;justify-content:space-between}.schedule-form-panel form,.schedule-form-panel fieldset,.schedule-form-panel label{display:grid;gap:.4rem}.schedule-form-panel fieldset{padding:0;border:0;gap:.7rem}.form-row{display:grid;grid-template-columns:1fr 1fr;gap:.55rem}.save-button{width:100%}.form-error{color:var(--danger-dark)}.empty-state{display:grid;place-items:center;gap:.4rem;padding:3rem;color:var(--text-secondary)}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:700px){.schedule-overlay{align-items:flex-end;padding:0}.schedule-dialog{max-height:94vh;border-radius:var(--radius-xl) var(--radius-xl) 0 0}.schedule-toolbar,.schedule-content{flex-direction:column}.schedule-toolbar>*{width:100%!important}.schedule-form-panel{width:100%}.item-actions{flex-direction:column}.form-row{grid-template-columns:1fr}}
</style>
