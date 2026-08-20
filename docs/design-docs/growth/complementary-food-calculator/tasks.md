# 实施任务清单

> 由 spec.md 生成  
> 任务总数: 2  
> 核心原则: 先建立可独立测试的指南与计算契约，再接入 Vue 弹框和 Dashboard 入口

## 依赖关系总览

```text
Task 1（指南数据、纯计算与单元测试）
  ↓
Task 2（弹框交互、Dashboard 集成与浏览器验收）
```

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `src/data/complementaryFoodGuide.js` | 新建 | Task 1 | 年龄分段、食物组、来源、计算函数 |
| `tests/complementary-food.test.js` | 新建 | Task 1 | 月龄、搭配与安全提示单元测试 |
| `src/components/FoodCalculator.vue` | 新建 | Task 2 | 辅食搭配计算器弹框 |
| `src/components/Dashboard.vue` | 修改 | Task 2 | 挂载组件并路由 food 动作 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `getFeedingStage(ageMonths)` | 新增 | `FoodCalculator.vue`、单元测试 | Task 1, 2 |
| `evaluateFoodDiversity(selectedGroupIds)` | 新增 | `FoodCalculator.vue`、单元测试 | Task 1, 2 |
| `getSafetyTips(ageMonths, isTryingNewFood)` | 新增 | `FoodCalculator.vue`、单元测试 | Task 1, 2 |
| `Dashboard.handleAction('food')` | 行为扩展 | Dashboard 工具卡 | Task 2 |

### 构建系统变更

- 无：Vite 和 Node Test 会自动发现被导入模块及 `tests/*.test.js`。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | Store 没有出生日期，无法自动计算月龄 | Task 2 | 手动输入 0—36 月龄，不从年龄阶段猜测 |
| 2 | 通用建议可能被误认为医学处方 | Task 1, 2 | 不计算克数/营养素，始终展示适用边界与就医提示 |
| 3 | 0—1 岁阶段当前没有 food 工具 | Task 2 | 作为补充工具加入，不替换母乳/配方奶喂养指南 |
| 4 | 官方指南将 7 类覆盖用于“一天”评估 | Task 1, 2 | UI 明确写“今日搭配”，不把单餐要求误写为每日要求 |

## 任务列表

### 任务 1: [x] 建立辅食指南与搭配计算核心

- 文件: `src/data/complementaryFoodGuide.js`（新建）、`tests/complementary-food.test.js`（新建）
- 依赖: 无
- spec 映射: 3.1、3.2、4.1、4.2、4.3、6、7.1
- 说明: 将可更新的权威指南数据与确定性计算封装为无 Vue 依赖的纯模块，并覆盖所有边界。
- context:
  - `src/data/vaccineGuide.js` — 现有静态指南与来源数据组织方式
  - `src/components/Dashboard.vue:handleAction()` — 后续 UI 调用入口
  - `tests/growth-schedule.test.js` — 现有纯函数测试风格
- 验收标准:
  - [x] `node --test tests/complementary-food.test.js` 全部通过
  - [x] 0、5、6、8、9、11、12、23、24、36 月龄边界均有断言
  - [x] 非法月龄和未知食物组会抛出 `TypeError`
  - [x] 食物组去重、4 类阈值、谷薯/蔬果/富铁动物性食物覆盖均有断言
  - [x] Code Review PASS
- 子任务:
  - [x] 1.1: 定义年龄阶段、7 类食物组、来源与固定安全提示
  - [x] 1.2: 实现阶段匹配、搭配检查和安全提示纯函数
  - [x] 1.3: 编写并执行边界单元测试

### 任务 2: [x] 开发弹框并接入所有辅食入口

- 文件: `src/components/FoodCalculator.vue`（新建）、`src/components/Dashboard.vue`（修改）
- 依赖: Task 1
- spec 映射: 3.1、3.2、4.1、4.2、4.3、4.4、7.2、7.3、8
- 说明: 提供简洁、响应式、可访问的月龄指南和今日搭配检查，并替换现有开发中提示。
- context:
  - `src/data/complementaryFoodGuide.js` — Task 1 产出的计算契约
  - `src/components/Dashboard.vue:handleAction()` — 上游工具卡点击路由
  - `src/components/VaccineGuide.vue` — 静态指南弹框、来源与安全外链范式
  - `src/components/GrowthSchedule.vue` — 简洁计算型弹框与移动端布局范式
  - `src/composables/useDialogFocus.js` — 焦点约束与恢复
  - `src/data/store.js:growthChildren` — 孩子名称只读来源
- 验收标准:
  - [x] `npm run build` 成功且无新 warning
  - [x] `npm test` 全量测试通过
  - [x] 默认视图、0—1 岁和 1—3 岁视图的辅食入口均打开计算器
  - [x] 375px 与桌面尺寸均无横向溢出，内容区独立滚动
  - [x] Escape、遮罩、关闭按钮和 Tab 焦点行为通过浏览器验证
  - [x] 月龄、孩子、7 类食物组和新食物开关变化会即时更新结果
  - [x] Code Review PASS
- 子任务:
  - [x] 2.1: 实现弹框结构、状态计算、来源与免责声明
  - [x] 2.2: 完成桌面和移动端视觉与可访问性
  - [x] 2.3: 接入 Dashboard 默认和年龄阶段工具入口
  - [x] 2.4: 执行全量构建、测试与真实浏览器验收

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 3.1 | Task 1, 2 | 纯计算契约与完整交互 |
| 3.2 | Task 1, 2 | 离线、性能、可访问性、兼容性 |
| 4.1 | Task 1, 2 | 单向依赖模块划分 |
| 4.2 | Task 1, 2 | 模块、接口、瞬时数据和错误处理 |
| 4.3 | Task 1, 2 | 分段匹配与即时搭配检查 |
| 4.4 | Task 2 | 低输入成本和健康边界呈现 |
| 5 | Task 1, 2 | 不引入食谱库、克数处方或持久化 |
| 6 | Task 1 | 固化权威指南的可维护数据来源 |
| 7 | Task 1, 2 | 单元、集成和浏览器验证 |
| 8 | Task 2 | 无新增运维依赖，验证静态上线与回滚 |
