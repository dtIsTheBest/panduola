import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  evaluateFoodDiversity,
  getFeedingStage,
  getSafetyTips
} from '../src/data/complementaryFoodGuide.js'

test('月龄边界映射到正确辅食阶段', () => {
  const expectations = new Map([
    [0, 'before-six-months'],
    [5, 'before-six-months'],
    [6, 'six-to-eight-months'],
    [8, 'six-to-eight-months'],
    [9, 'nine-to-eleven-months'],
    [11, 'nine-to-eleven-months'],
    [12, 'twelve-to-twenty-three-months'],
    [23, 'twelve-to-twenty-three-months'],
    [24, 'twenty-four-to-thirty-six-months'],
    [36, 'twenty-four-to-thirty-six-months']
  ])

  for (const [ageMonths, stageId] of expectations) {
    assert.equal(getFeedingStage(ageMonths).id, stageId)
  }
})

test('非法月龄会被明确拒绝', () => {
  for (const value of [-1, 37, 6.5, Number.NaN, '6']) {
    assert.throws(() => getFeedingStage(value), /月龄必须是 0—36 之间的整数/)
  }
})

test('阶段配置不可被调用方修改', () => {
  const stage = getFeedingStage(6)

  assert.equal(Object.isFrozen(stage), true)
  assert.throws(() => {
    stage.maxMonths = 36
  }, TypeError)
  assert.equal(getFeedingStage(24).id, 'twenty-four-to-thirty-six-months')
})

test('食物组去重并检查多样性与三项关键覆盖', () => {
  const result = evaluateFoodDiversity([
    'grains',
    'animal-foods',
    'vitamin-a-produce',
    'eggs',
    'eggs'
  ])

  assert.equal(result.selectedCount, 4)
  assert.equal(result.isDiverse, true)
  assert.equal(result.hasGrains, true)
  assert.equal(result.hasProduce, true)
  assert.equal(result.hasIronAnimalFood, true)
  assert.deepEqual(result.nextSteps, [])
})

test('不足的今日搭配返回具体下一步', () => {
  const result = evaluateFoodDiversity(['eggs', 'dairy'])

  assert.equal(result.selectedCount, 2)
  assert.equal(result.isDiverse, false)
  assert.equal(result.hasGrains, false)
  assert.equal(result.hasProduce, false)
  assert.equal(result.hasIronAnimalFood, false)
  assert.equal(result.nextSteps.length, 4)
  assert.match(result.nextSteps.join(' '), /至少 4 类/)
  assert.match(result.nextSteps.join(' '), /谷薯/)
  assert.match(result.nextSteps.join(' '), /蔬菜或水果/)
  assert.match(result.nextSteps.join(' '), /富铁动物性食物/)
})

test('空食物组返回完整补充方向', () => {
  const result = evaluateFoodDiversity([])

  assert.equal(result.selectedCount, 0)
  assert.equal(result.isDiverse, false)
  assert.equal(result.nextSteps.length, 4)
})

test('未知食物组与非法入参会被拒绝', () => {
  assert.throws(() => evaluateFoodDiversity('grains'), /食物组必须是数组/)
  assert.throws(() => evaluateFoodDiversity(['unknown']), /未知食物组/)
  assert.throws(() => evaluateFoodDiversity([null]), /未知食物组/)
})

test('安全提示覆盖未满十二月龄和首次尝试', () => {
  const infantTips = getSafetyTips(8, true).join(' ')
  assert.match(infantTips, /蜂蜜/)
  assert.match(infantTips, /少糖少盐/)
  assert.match(infantTips, /3—5 天/)
  assert.match(infantTips, /咨询医生/)

  const toddlerTips = getSafetyTips(12, false).join(' ')
  assert.doesNotMatch(toddlerTips, /蜂蜜/)
  assert.doesNotMatch(toddlerTips, /3—5 天/)
  assert.throws(() => getSafetyTips(8, 'true'), /首次尝试标记必须是布尔值/)
})
