export const DEVELOPMENT_GUIDE_UPDATED_AT = '2026-09-16'

export const GROWTH_STANDARD_GROUPS = deepFreeze([
  {
    id: 'under-7',
    ageRange: '出生至未满 7 周岁',
    standardCode: 'WS/T 423—2022',
    title: '7岁以下儿童生长标准',
    organization: '国家卫生健康委员会',
    summary: '按性别和精确月龄查看体重、身长/身高、身高别体重、BMI 和头围的百分位数。',
    indicators: ['年龄别体重', '年龄别身长/身高', '身长/身高别体重', '年龄别 BMI', '0～3 岁年龄别头围'],
    sourceUrl: 'https://www.nhc.gov.cn/fzs/c100048/202211/5001d7cf57774770a1d49c1df46a291f.shtml',
    documentUrl: 'https://www.nhc.gov.cn/cms-search/downFiles/e38068f0a62d4a1eb1bd451414444ec1.pdf'
  },
  {
    id: 'school-height',
    ageRange: '7～18 周岁',
    standardCode: 'WS/T 612—2018',
    title: '儿童青少年身高发育等级评价',
    organization: '国家卫生健康委员会',
    summary: '按性别和周岁年龄查看身高的 −2SD、−1SD、中位数、+1SD、+2SD 等级界值。',
    indicators: ['年龄别身高', '身高发育等级', '男生与女生分表'],
    sourceUrl: 'https://www.nhc.gov.cn/wjw/pqt/201807/a5269d062966455ea55d90a02c690311.shtml',
    documentUrl: 'https://www.nhc.gov.cn/ewebeditor/uploadfile/2018/07/20180704145256369.pdf'
  },
  {
    id: 'school-bmi',
    ageRange: '6～18 周岁学龄儿童青少年',
    standardCode: 'WS/T 586—2018',
    title: '学龄儿童青少年超重与肥胖筛查',
    organization: '国家卫生健康委员会',
    summary: '按性别和年龄使用 BMI 界值进行超重与肥胖筛查，不以成人 BMI 界值直接判断儿童。',
    indicators: ['年龄别 BMI', '超重筛查界值', '肥胖筛查界值'],
    sourceUrl: 'https://www.nhc.gov.cn/wjw/pqt/201803/a7962d1ac01647b9837110bfd2d69b26.shtml',
    documentUrl: 'https://www.nhc.gov.cn/ewebeditor/uploadfile/2018/03/20180330094031236.pdf'
  }
])

export const HEALTH_CHECKUP_GROUPS = deepFreeze([
  {
    id: 'newborn',
    stage: '新生儿期',
    points: ['出生后 1 周内家庭访视', '满月健康管理'],
    focus: '喂养、黄疸、脐部、体重和先天异常观察'
  },
  {
    id: 'infant',
    stage: '婴儿期',
    points: ['3 月龄', '6 月龄', '8 月龄', '12 月龄'],
    focus: '体格测量、心理行为发育、喂养与伤害预防'
  },
  {
    id: 'toddler',
    stage: '幼儿期',
    points: ['18 月龄', '24 月龄', '30 月龄', '36 月龄'],
    focus: '生长趋势、语言运动发育、口腔和饮食行为'
  },
  {
    id: 'preschool',
    stage: '学龄前期',
    points: ['4 岁', '5 岁', '6 岁'],
    focus: '视力听力、体格发育、入学准备和健康行为'
  }
])

export const VISION_CHECKUP_GROUPS = deepFreeze([
  { stage: '新生儿期', points: ['家庭访视', '满月'], count: 2 },
  { stage: '婴儿期', points: ['3 月龄', '6 月龄', '8 月龄', '12 月龄'], count: 4 },
  { stage: '幼儿期', points: ['18 月龄', '24 月龄', '30 月龄', '36 月龄'], count: 4 },
  { stage: '学龄前期', points: ['4 岁', '5 岁', '6 岁'], count: 3 }
])

export const DEVELOPMENT_STAGE_GUIDANCE = deepFreeze({
  'age0-1': {
    title: '婴儿期重点',
    description: '使用 WS/T 423—2022 的精确月龄表，连续观察体重、身长和头围趋势。',
    standardIds: ['under-7']
  },
  'age1-3': {
    title: '幼儿期重点',
    description: '继续使用 WS/T 423—2022，并结合 18、24、30、36 月龄健康管理节点。',
    standardIds: ['under-7']
  },
  'age3-6': {
    title: '学龄前重点',
    description: '使用 WS/T 423—2022 观察身高、体重和 BMI 趋势，并按 4、5、6 岁完成视力检查。',
    standardIds: ['under-7']
  },
  'age6-9': {
    title: '标准衔接阶段',
    description: '未满 7 周岁仍使用 WS/T 423—2022；满 7 周岁后转用学龄期身高和 BMI 筛查标准。',
    standardIds: ['under-7', 'school-height', 'school-bmi']
  },
  'age9-12': {
    title: '小学高年级重点',
    description: '按性别和周岁年龄使用 WS/T 612—2018 与 WS/T 586—2018，避免套用成人标准。',
    standardIds: ['school-height', 'school-bmi']
  },
  'age12-15': {
    title: '青春期重点',
    description: '青春期生长速度差异较大，应结合连续趋势、青春期阶段和专业评估综合判断。',
    standardIds: ['school-height', 'school-bmi']
  },
  'age15-18': {
    title: '高中阶段重点',
    description: '18 周岁前继续使用儿童青少年标准；单次偏高或偏低不能独立作为诊断结论。',
    standardIds: ['school-height', 'school-bmi']
  }
})

export const DEVELOPMENT_GUIDE_SOURCES = deepFreeze([
  {
    id: 'under-7-standard',
    title: '7岁以下儿童生长标准',
    meta: '国家卫生健康委 · WS/T 423—2022',
    url: 'https://www.nhc.gov.cn/cms-search/downFiles/e38068f0a62d4a1eb1bd451414444ec1.pdf',
    format: 'PDF'
  },
  {
    id: 'school-height-standard',
    title: '7岁～18岁儿童青少年身高发育等级评价',
    meta: '国家卫生健康委 · WS/T 612—2018',
    url: 'https://www.nhc.gov.cn/ewebeditor/uploadfile/2018/07/20180704145256369.pdf',
    format: 'PDF'
  },
  {
    id: 'school-bmi-standard',
    title: '学龄儿童青少年超重与肥胖筛查',
    meta: '国家卫生健康委 · WS/T 586—2018',
    url: 'https://www.nhc.gov.cn/wjw/pqt/201803/a7962d1ac01647b9837110bfd2d69b26.shtml',
    format: '网页'
  },
  {
    id: 'child-health-management',
    title: '0～6岁儿童健康管理技术规范',
    meta: '国家卫生健康委 · WS/T 479—2015',
    url: 'https://www.nhc.gov.cn/zwgkzt/pqt/201507/001fb92117774491aa62de9cf161ac29.shtml',
    format: '网页'
  },
  {
    id: 'child-eye-care',
    title: '0～6岁儿童眼保健及视力检查服务规范',
    meta: '国家卫生健康委 · 2021',
    url: 'https://www.nhc.gov.cn/fys/c100078/202106/eab0d16758a545bb88c2dc84734ae6ee.shtml',
    format: '网页'
  },
  {
    id: 'growth-nutrition',
    title: '儿童青少年生长迟缓食养指南',
    meta: '国家卫生健康委 · 2023 年版',
    url: 'https://www.nhc.gov.cn/wjw/c100378/202301/7faed9993c9b45aea158c5335346f282/files/1732844467736_68919.pdf',
    format: 'PDF'
  }
])

export function getDevelopmentStageGuidance(stageId) {
  return Object.hasOwn(DEVELOPMENT_STAGE_GUIDANCE, stageId)
    ? DEVELOPMENT_STAGE_GUIDANCE[stageId]
    : null
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  Object.values(value).forEach(deepFreeze)
  return value
}
