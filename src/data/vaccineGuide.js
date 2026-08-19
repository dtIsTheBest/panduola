export const VACCINE_GUIDE_UPDATED_AT = '2026-08-17'

export const VACCINE_SCHEDULE = [
  {
    id: 'birth',
    age: '出生时',
    vaccines: ['乙肝疫苗第 1 剂', '卡介苗 1 剂'],
    note: '乙肝第 1 剂应在出生后 24 小时内完成；母亲 HBsAg 阳性或不详时需遵医嘱尽早处理。'
  },
  {
    id: '1m',
    age: '1 月龄',
    vaccines: ['乙肝疫苗第 2 剂']
  },
  {
    id: '2m',
    age: '2 月龄',
    vaccines: ['脊灰灭活疫苗第 1 剂', '百白破疫苗第 1 剂'],
    note: '2026 年版百白破程序从 2 月龄开始。'
  },
  {
    id: '3m',
    age: '3 月龄',
    vaccines: ['脊灰灭活疫苗第 2 剂']
  },
  {
    id: '4m',
    age: '4 月龄',
    vaccines: ['脊灰减毒活疫苗第 1 剂', '百白破疫苗第 2 剂']
  },
  {
    id: '6m',
    age: '6 月龄',
    vaccines: ['乙肝疫苗第 3 剂', '百白破疫苗第 3 剂', 'A 群流脑疫苗第 1 剂']
  },
  {
    id: '8m',
    age: '8 月龄',
    vaccines: ['麻腮风疫苗第 1 剂', '乙脑减毒活疫苗第 1 剂，或乙脑灭活疫苗第 1、2 剂'],
    note: '乙脑灭活疫苗前两剂间隔 7—10 天；减毒和灭活程序二选一。'
  },
  {
    id: '9m',
    age: '9 月龄',
    vaccines: ['A 群流脑疫苗第 2 剂']
  },
  {
    id: '18m',
    age: '18 月龄',
    vaccines: ['百白破疫苗第 4 剂', '麻腮风疫苗第 2 剂', '甲肝减毒活疫苗 1 剂，或甲肝灭活疫苗第 1 剂'],
    note: '甲肝减毒和灭活程序二选一。'
  },
  {
    id: '2y',
    age: '2 周岁',
    vaccines: ['乙脑减毒活疫苗第 2 剂，或乙脑灭活疫苗第 3 剂', '甲肝灭活疫苗第 2 剂（采用灭活程序者）']
  },
  {
    id: '3y',
    age: '3 周岁',
    vaccines: ['A 群 C 群流脑疫苗第 1 剂']
  },
  {
    id: '4y',
    age: '4 周岁',
    vaccines: ['脊灰减毒活疫苗第 2 剂']
  },
  {
    id: '6y',
    age: '6 周岁',
    vaccines: ['百白破疫苗第 5 剂', 'A 群 C 群流脑疫苗第 2 剂', '乙脑灭活疫苗第 4 剂（采用灭活程序者）'],
    note: '2026 年版在 6 周岁增加百白破第 5 剂；白破疫苗主要用于 7—11 周岁补种。'
  },
  {
    id: '13y',
    age: '13 周岁女孩',
    vaccines: ['双价 HPV 疫苗第 1、2 剂'],
    note: '两剂间隔 6 个月。2011 年 11 月 10 日及以后出生、未完成程序的女孩，应在 18 周岁前尽早补齐。'
  }
]

export const VACCINE_STAGE_GUIDANCE = {
  'age0-1': {
    title: '婴儿期重点：出生至 9 月龄基础免疫',
    description: '优先核对乙肝、卡介苗、脊灰、百白破、流脑、麻腮风和乙脑等基础剂次。',
    scheduleIds: ['birth', '1m', '2m', '3m', '4m', '6m', '8m', '9m']
  },
  'age1-3': {
    title: '幼儿期重点：18 月龄、2 岁和 3 岁节点',
    description: '重点核对百白破、麻腮风、甲肝、乙脑和 A 群 C 群流脑疫苗。',
    scheduleIds: ['18m', '2y', '3y']
  },
  'age3-6': {
    title: '学龄前重点：3 岁、4 岁和 6 岁加强剂',
    description: '入园入学前建议核对流脑、脊灰和 6 岁百白破加强剂。',
    scheduleIds: ['3y', '4y', '6y']
  },
  'age6-9': {
    title: '小学低年级重点：完成 6 岁剂次并查漏补种',
    description: '核对百白破第 5 剂、A 群 C 群流脑第 2 剂及乙脑灭活第 4 剂。',
    scheduleIds: ['6y']
  },
  'age9-12': {
    title: '小学高年级重点：核对接种证与漏种剂次',
    description: '这一阶段通常没有新增的国家常规剂次，未完成的免疫规划剂次应尽早补种。',
    scheduleIds: []
  },
  'age12-15': {
    title: '初中阶段重点：13 岁女孩 HPV 疫苗',
    description: '国家免疫规划双价 HPV 疫苗共 2 剂，间隔 6 个月。',
    scheduleIds: ['13y']
  },
  'age15-18': {
    title: '高中阶段重点：HPV 与既往漏种剂次',
    description: '符合出生日期条件且未完成 HPV 程序的女孩，应在 18 周岁前尽早补齐。',
    scheduleIds: ['13y']
  },
  'age18-22': {
    title: '大学阶段：转向成人预防接种评估',
    description: '儿童国家免疫规划不再设置常规剂次，可结合既往接种史、健康状态和暴露风险咨询门诊。',
    scheduleIds: []
  },
  'age22+': {
    title: '成年阶段：按健康状态和风险评估接种',
    description: '建议携带既往接种记录，由接种门诊评估流感、肺炎球菌、带状疱疹等成人疫苗需求。',
    scheduleIds: []
  }
}

export const VACCINE_GUIDE_SOURCES = [
  {
    title: '国家免疫规划疫苗儿童免疫程序及说明（2026年版）',
    organization: '中国疾病预防控制中心',
    url: 'https://www.chinacdc.cn/jkyj/mygh02/yfjzfw/mycx/202607/P020260706520776746753.pdf'
  },
  {
    title: '关于将 HPV 疫苗纳入国家免疫规划有关工作事宜的通知',
    organization: '国家疾病预防控制局',
    url: 'https://www.ndcpa.gov.cn/jbkzzx/c100014/common/content/content_1983714327087452160.html'
  },
  {
    title: '预防接种工作规范（2023年版）',
    organization: '国家疾病预防控制局',
    url: 'https://www.chinacdc.cn/jkyj/mygh02/jswj_mygh/myfw_mygh/202505/U020250528538419216264.pdf'
  }
]
