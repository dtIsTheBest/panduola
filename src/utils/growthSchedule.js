const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
export const SCHEDULE_TYPES = ['checkup', 'vaccine', 'course', 'activity', 'habit', 'other']
export const SCHEDULE_RECURRENCES = ['none', 'daily', 'weekly']

function unicodeLength(value) {
  return Array.from(value).length
}

export function isValidDateOnly(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function getLocalDateOnly(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function normalizeScheduleItem(rawItem, childIds) {
  const source = rawItem && typeof rawItem === 'object' ? rawItem : {}
  const title = typeof source.title === 'string' ? source.title.trim() : ''
  const note = typeof source.note === 'string' ? source.note.trim() : ''
  const childId = source.childId === null ? null : source.childId
  const valid = (
    typeof source.id === 'string' && source.id.length > 0 &&
    unicodeLength(title) >= 1 && unicodeLength(title) <= 60 &&
    (childId === null || (typeof childId === 'string' && childIds.has(childId))) &&
    SCHEDULE_TYPES.includes(source.type) &&
    isValidDateOnly(source.startDate) &&
    (source.startTime === null || (typeof source.startTime === 'string' && TIME_PATTERN.test(source.startTime))) &&
    SCHEDULE_RECURRENCES.includes(source.recurrence) &&
    unicodeLength(note) <= 200 &&
    Number.isFinite(source.createdAt) && source.createdAt >= 0 &&
    Number.isFinite(source.updatedAt) && source.updatedAt >= 0
  )
  if (!valid) throw new TypeError('成长日程的标题、归属、类型、日期、时间、重复规则或备注无效')
  return {
    id: source.id,
    childId,
    title,
    type: source.type,
    startDate: source.startDate,
    startTime: source.startTime,
    recurrence: source.recurrence,
    note,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  }
}

export function normalizeScheduleCompletion(rawCompletion, scheduleItemsById) {
  const source = rawCompletion && typeof rawCompletion === 'object' ? rawCompletion : {}
  const scheduleItem = scheduleItemsById.get(source.scheduleId)
  if (
    typeof source.id !== 'string' || !source.id ||
    typeof source.scheduleId !== 'string' || !scheduleItem ||
    !isValidDateOnly(source.occurrenceDate) ||
    !doesScheduleOccurOnDate(scheduleItem, source.occurrenceDate) ||
    !Number.isFinite(source.completedAt) || source.completedAt < 0
  ) throw new TypeError('成长日程完成记录无效')
  return {
    id: source.id,
    scheduleId: source.scheduleId,
    occurrenceDate: source.occurrenceDate,
    completedAt: source.completedAt
  }
}

export function doesScheduleOccurOnDate(item, date) {
  if (!isValidDateOnly(date) || !isValidDateOnly(item?.startDate)) return false
  if (date < item.startDate) return false
  if (item.recurrence === 'none') return date === item.startDate
  const elapsedDays = Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${item.startDate}T00:00:00Z`)) / 86_400_000
  )
  if (item.recurrence === 'daily') return true
  return item.recurrence === 'weekly' && elapsedDays % 7 === 0
}

export function getScheduleOccurrences(items, completions, fromDate, toDate) {
  if (!isValidDateOnly(fromDate) || !isValidDateOnly(toDate) || fromDate > toDate) {
    throw new TypeError('日程查询日期范围无效')
  }
  const rangeDays = Math.round(
    (Date.parse(`${toDate}T00:00:00Z`) - Date.parse(`${fromDate}T00:00:00Z`)) / 86_400_000
  )
  if (rangeDays > 30) throw new TypeError('日程查询范围不能超过 31 天')
  const completionKeys = new Set(
    completions.map(completion => `${completion.scheduleId}:${completion.occurrenceDate}`)
  )
  const occurrences = []
  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    for (const item of items) {
      if (!doesScheduleOccurOnDate(item, date)) continue
      occurrences.push({
        ...item,
        occurrenceDate: date,
        completed: completionKeys.has(`${item.id}:${date}`)
      })
    }
  }
  return occurrences.sort((left, right) => (
    left.occurrenceDate.localeCompare(right.occurrenceDate) ||
    (left.startTime || '23:59').localeCompare(right.startTime || '23:59') ||
    left.title.localeCompare(right.title)
  ))
}

export function getOccurrenceStatus(occurrence, today, currentTime = '00:00') {
  if (occurrence.completed) return 'completed'
  if (occurrence.occurrenceDate < today) return 'overdue'
  if (occurrence.occurrenceDate > today) return 'upcoming'
  if (occurrence.startTime && occurrence.startTime < currentTime) return 'overdue'
  return 'today'
}
