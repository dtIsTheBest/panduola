export const AI_EXPERIENCE_MODES = Object.freeze({
  GUIDED: 'guided',
  CLASSIC: 'classic'
})

export const MAX_COACH_DETAIL_CHARACTERS = 160
export const MAX_COACH_QUESTION_CHARACTERS = 500

export const COACH_TASKS = Object.freeze([
  Object.freeze({
    id: 'growth',
    icon: 'trend',
    title: '看懂成长变化',
    description: '梳理近期变化，找到值得关注的重点',
    placeholder: '例如：最近睡得更晚、食欲有些下降……',
    focus: '结合年龄阶段和补充情况，梳理成长变化、可能影响因素与可观察指标'
  }),
  Object.freeze({
    id: 'week',
    icon: 'calendar',
    title: '安排本周重点',
    description: '生成少而精、能真正执行的一周计划',
    placeholder: '例如：工作日时间少，周末可以多安排活动……',
    focus: '给出不超过三项的一周成长计划，每项说明频率、时长和完成标准'
  }),
  Object.freeze({
    id: 'food',
    icon: 'food',
    title: '优化饮食搭配',
    description: '从年龄和当前饮食中找出调整方向',
    placeholder: '例如：早餐常吃粥和鸡蛋，不太愿意吃蔬菜……',
    focus: '评估当前饮食描述，给出安全、易执行的搭配调整，不提供疾病诊断或用药建议'
  }),
  Object.freeze({
    id: 'family',
    icon: 'heart',
    title: '解决亲子难题',
    description: '把一个困扰拆成今天能做的小步骤',
    placeholder: '例如：写作业容易拖延，提醒多次会闹情绪……',
    focus: '分析亲子困扰，给出尊重年龄特点的沟通方式和一个今天可以尝试的小步骤'
  })
])

export function resolveAiExperienceMode(value) {
  return value === AI_EXPERIENCE_MODES.CLASSIC
    ? AI_EXPERIENCE_MODES.CLASSIC
    : AI_EXPERIENCE_MODES.GUIDED
}

export function buildCoachQuestion({ taskId, ageStage, detail = '' }) {
  const task = COACH_TASKS.find(candidate => candidate.id === taskId)
  if (!task) throw new TypeError('未知的成长参谋任务')
  if (typeof detail !== 'string') throw new TypeError('补充情况必须是文本')

  const normalizedDetail = detail.trim()
  if (Array.from(normalizedDetail).length > MAX_COACH_DETAIL_CHARACTERS) {
    throw new RangeError(`补充情况不能超过 ${MAX_COACH_DETAIL_CHARACTERS} 个字符`)
  }

  const stageContext = normalizeAgeStage(ageStage)
  const detailContext = normalizedDetail || '用户暂未补充具体情况'
  const question = [
    '你是“岁序成章”的成长参谋。',
    `本次任务：${task.focus}。`,
    `年龄阶段：${stageContext}。`,
    `补充情况：${detailContext}。`,
    '请用简洁中文，按“一句话结论、判断依据、今天可以做什么、需要专业帮助的信号”四部分回答。',
    '不要做疾病诊断；信息不足时明确说明，不要自行补全事实。'
  ].join('')

  if (Array.from(question).length > MAX_COACH_QUESTION_CHARACTERS) {
    throw new RangeError('生成的问题超过长度限制')
  }
  return question
}

function normalizeAgeStage(ageStage) {
  if (!ageStage || typeof ageStage !== 'object') return '未选择，请给出通用建议并提示补充年龄'
  const title = typeof ageStage.title === 'string' ? ageStage.title.trim() : ''
  const ageRange = typeof ageStage.ageRange === 'string' ? ageStage.ageRange.trim() : ''
  if (!title && !ageRange) return '未选择，请给出通用建议并提示补充年龄'
  return [title, ageRange].filter(Boolean).join('（') + (title && ageRange ? '）' : '')
}
