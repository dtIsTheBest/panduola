export const COMPLEMENTARY_FOOD_GUIDE_UPDATED_AT = '2026-08-20'

export const FOOD_GROUPS = Object.freeze([
  {
    id: 'grains',
    label: '谷薯类',
    examples: '粥、面、软饭、薯类、强化铁米粉',
    icon: 'Wheat'
  },
  {
    id: 'legumes-nuts',
    label: '豆类和坚果类',
    examples: '豆腐、豆泥、细腻坚果酱',
    icon: 'Bean'
  },
  {
    id: 'animal-foods',
    label: '富铁动物性食物',
    examples: '肉、肝、鱼和其他海产品',
    icon: 'Drumstick',
    badge: '富铁重点'
  },
  {
    id: 'eggs',
    label: '蛋类',
    examples: '鸡蛋、鸭蛋等充分煮熟的蛋类',
    icon: 'Egg'
  },
  {
    id: 'vitamin-a-produce',
    label: '深色蔬果',
    examples: '南瓜、胡萝卜、菠菜等',
    icon: 'Carrot'
  },
  {
    id: 'other-produce',
    label: '其他蔬果',
    examples: '西兰花、苹果、梨等',
    icon: 'Apple'
  },
  {
    id: 'dairy',
    label: '奶类及奶制品',
    examples: '母乳、配方奶、无糖酸奶和奶酪',
    icon: 'Milk'
  }
].map(group => Object.freeze(group)))

export const COMPLEMENTARY_FOOD_SOURCES = Object.freeze([
  {
    title: '0—3 岁婴幼儿营养喂养评估服务指南（2025 年版）',
    organization: '国家卫生健康委员会',
    url: 'https://www.nhc.gov.cn/wjw/c100378/202502/bca60484803f4acfb6cdcfa1c054000b.shtml'
  },
  {
    title: '6—23 月龄婴幼儿辅食指南（2023）',
    organization: '世界卫生组织',
    url: 'https://www.who.int/publications/i/item/9789240081864'
  },
  {
    title: '何时、吃什么以及如何引入固体食物',
    organization: '美国疾病控制与预防中心',
    url: 'https://www.cdc.gov/infant-toddler-nutrition/foods-and-drinks/when-what-and-how-to-introduce-solid-foods.html'
  }
].map(source => Object.freeze(source)))

const FEEDING_STAGES = Object.freeze([
  {
    id: 'before-six-months',
    minMonths: 0,
    maxMonths: 5,
    label: '辅食准备期',
    mealFrequency: '通常先以母乳或配方奶为主',
    texture: '暂不把固体食物作为常规喂养',
    focus: '通常约满 6 月龄且出现坐稳扶坐、控头、吞咽等准备信号后，再开始添加辅食。'
  },
  {
    id: 'six-to-eight-months',
    minMonths: 6,
    maxMonths: 8,
    label: '辅食初体验',
    mealFrequency: '每天 2—3 餐辅食',
    texture: '从细腻泥糊逐步过渡到较稠、带细小颗粒',
    focus: '优先加入富铁食物，一次少量，跟随孩子饥饿和饱足信号。'
  },
  {
    id: 'nine-to-eleven-months',
    minMonths: 9,
    maxMonths: 11,
    label: '丰富口感期',
    mealFrequency: '每天 3—4 餐，按需增加 1—2 次营养加餐',
    texture: '碎末、小颗粒和柔软手指食物',
    focus: '扩大食物种类并练习抓取、咀嚼和用杯，继续保证富铁食物。'
  },
  {
    id: 'twelve-to-twenty-three-months',
    minMonths: 12,
    maxMonths: 23,
    label: '家庭餐过渡期',
    mealFrequency: '每天 3—4 餐，按需增加 1—2 次营养加餐',
    texture: '软块、碎切食物，逐步接近清淡家庭餐',
    focus: '鼓励自主进食和共同进餐，食物保持多样，少糖少盐。'
  },
  {
    id: 'twenty-four-to-thirty-six-months',
    minMonths: 24,
    maxMonths: 36,
    label: '规律家庭餐期',
    mealFrequency: '规律三餐，可安排 1—2 次健康加餐',
    texture: '适合咀嚼能力的家庭食物，仍需切小并去除噎食风险',
    focus: '食物多样、清淡烹调，鼓励自主进食，不追喂、不强迫。'
  }
].map(stage => Object.freeze(stage)))

const FOOD_GROUP_IDS = new Set(FOOD_GROUPS.map(group => group.id))
const PRODUCE_GROUP_IDS = new Set(['vitamin-a-produce', 'other-produce'])

function assertValidAgeMonths(ageMonths) {
  if (!Number.isInteger(ageMonths) || ageMonths < 0 || ageMonths > 36) {
    throw new TypeError('月龄必须是 0—36 之间的整数')
  }
}

function normalizeSelectedGroupIds(selectedGroupIds) {
  if (!Array.isArray(selectedGroupIds)) {
    throw new TypeError('食物组必须是数组')
  }

  const uniqueIds = new Set(selectedGroupIds)
  for (const groupId of uniqueIds) {
    if (!FOOD_GROUP_IDS.has(groupId)) {
      throw new TypeError(`未知食物组：${String(groupId)}`)
    }
  }
  return uniqueIds
}

export function getFeedingStage(ageMonths) {
  assertValidAgeMonths(ageMonths)
  return FEEDING_STAGES.find(stage => ageMonths >= stage.minMonths && ageMonths <= stage.maxMonths)
}

export function evaluateFoodDiversity(selectedGroupIds) {
  const uniqueIds = normalizeSelectedGroupIds(selectedGroupIds)
  const hasGrains = uniqueIds.has('grains')
  const hasProduce = [...PRODUCE_GROUP_IDS].some(groupId => uniqueIds.has(groupId))
  const hasIronAnimalFood = uniqueIds.has('animal-foods')
  const isDiverse = uniqueIds.size >= 4
  const nextSteps = []

  if (!isDiverse) {
    nextSteps.push(`今天已覆盖 ${uniqueIds.size} 类，可在孩子接受的前提下逐步丰富到至少 4 类。`)
  }
  if (!hasGrains) {
    nextSteps.push('补充一类谷薯食物，例如粥、面、软饭、薯类或强化铁米粉。')
  }
  if (!hasProduce) {
    nextSteps.push('补充一类蔬菜或水果，优先选择当季、柔软、便于吞咽的食材。')
  }
  if (!hasIronAnimalFood) {
    nextSteps.push('安排一种富铁动物性食物，例如肉、肝或鱼；具体选择需结合过敏和进食能力。')
  }

  return {
    selectedCount: uniqueIds.size,
    isDiverse,
    hasGrains,
    hasProduce,
    hasIronAnimalFood,
    nextSteps
  }
}

export function getSafetyTips(ageMonths, isTryingNewFood = false) {
  assertValidAgeMonths(ageMonths)
  if (typeof isTryingNewFood !== 'boolean') {
    throw new TypeError('首次尝试标记必须是布尔值')
  }

  const tips = [
    '全程坐直并由成人看护；整颗坚果、硬块和圆形食物应磨碎、压软或切成安全形态。',
    '回应孩子的饥饿和饱足信号，鼓励但不强迫进食。',
    '保持食物原味，少糖少盐，避免用甜味或重口味引导进食。'
  ]

  if (ageMonths < 12) {
    tips.push('未满 12 月龄不吃蜂蜜，也不要用牛奶替代母乳或配方奶作为主要饮品。')
  }
  if (isTryingNewFood) {
    tips.push('首次尝试宜从一种单一食物、少量开始，并连续观察 3—5 天是否出现异常反应。')
    tips.push('严重湿疹、已知食物过敏或既往严重反应的孩子，引入常见过敏原前先咨询医生。')
  }
  return tips
}
