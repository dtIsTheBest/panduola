import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AI_EXPERIENCE_MODES,
  COACH_TASKS,
  MAX_COACH_DETAIL_CHARACTERS,
  MAX_COACH_QUESTION_CHARACTERS,
  buildCoachQuestion,
  resolveAiExperienceMode
} from '../src/ai/growthCoach.js'

test('AI 体验模式默认使用任务式且可显式切回经典问答', () => {
  assert.equal(resolveAiExperienceMode(), AI_EXPERIENCE_MODES.GUIDED)
  assert.equal(resolveAiExperienceMode('unknown'), AI_EXPERIENCE_MODES.GUIDED)
  assert.equal(resolveAiExperienceMode('classic'), AI_EXPERIENCE_MODES.CLASSIC)
})

test('成长参谋提供四类稳定任务且定义不可被调用方修改', () => {
  assert.equal(COACH_TASKS.length, 4)
  assert.deepEqual(COACH_TASKS.map(task => task.id), ['growth', 'week', 'food', 'family'])
  assert.equal(Object.isFrozen(COACH_TASKS), true)
  assert.equal(COACH_TASKS.every(Object.isFrozen), true)
})

test('结构化问题只包含任务、年龄阶段和本次补充内容', () => {
  const question = buildCoachQuestion({
    taskId: 'week',
    ageStage: { title: '幼儿期', ageRange: '1–3 岁', secret: '不能发送' },
    detail: ' 工作日只有晚饭后有时间 '
  })

  assert.match(question, /本次任务：给出不超过三项的一周成长计划/)
  assert.match(question, /年龄阶段：幼儿期（1–3 岁）/)
  assert.match(question, /补充情况：工作日只有晚饭后有时间/)
  assert.equal(question.includes('secret'), false)
  assert.equal(question.includes('不能发送'), false)
  assert.ok(Array.from(question).length <= MAX_COACH_QUESTION_CHARACTERS)
})

test('未选择阶段和空补充信息会安全降级', () => {
  const question = buildCoachQuestion({ taskId: 'growth', ageStage: null })

  assert.match(question, /年龄阶段：未选择/)
  assert.match(question, /用户暂未补充具体情况/)
})

test('成长参谋拒绝未知任务、非文本和超过一百六十字的补充信息', () => {
  assert.throws(() => buildCoachQuestion({ taskId: 'missing' }), /未知/)
  assert.throws(() => buildCoachQuestion({ taskId: 'growth', detail: null }), /必须是文本/)
  assert.throws(() => buildCoachQuestion({
    taskId: 'growth',
    detail: '长'.repeat(MAX_COACH_DETAIL_CHARACTERS + 1)
  }), /不能超过/)

  const boundaryQuestion = buildCoachQuestion({
    taskId: 'growth',
    detail: '刚'.repeat(MAX_COACH_DETAIL_CHARACTERS)
  })
  assert.ok(Array.from(boundaryQuestion).length <= MAX_COACH_QUESTION_CHARACTERS)
})
