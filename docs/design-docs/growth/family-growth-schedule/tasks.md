# 实施任务清单

> 由 spec.md 生成
>
> 任务总数: 3
> 核心原则: 先建立 v4 数据与重复算法，再接入简约 UI，最后全链路验收

## 依赖关系总览

```text
Task 1（Schema v4、Store 与重复算法）
  ↓
Task 2（成长日程简约 UI 与 Dashboard 入口）
  ↓
Task 3（同步兼容、文档和全链路验收）
```

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `src/data/store.js` | 修改 | Task 1, 3 | Schema v4、日程 CRUD 与完成记录 |
| `src/sync/snapshot.js` | 修改 | Task 1 | 当前版本升级 |
| `src/utils/growthSchedule.js` | 新建 | Task 1 | 重复展开、排序与状态纯函数 |
| `tests/growth-schedule.test.js` | 新建 | Task 1 | 规则与 Store 测试 |
| `src/components/GrowthSchedule.vue` | 新建 | Task 2 | 今天/接下来与快速表单 |
| `src/components/Dashboard.vue` | 修改 | Task 2 | 入口与弹窗挂载 |
| `src/App.vue` | 修改 | Task 2 | 导入提示 |
| 现有 Schema fixture 测试 | 修改 | Task 3 | v4 同步与存储兼容 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `normalizeData` | Schema v4 | 全部快照链路 | Task 1, 3 |
| `upsertScheduleItem` | 新增 | GrowthSchedule | Task 1, 2 |
| `deleteScheduleItem` | 新增 | GrowthSchedule | Task 1, 2 |
| `setScheduleOccurrenceCompleted` | 新增 | GrowthSchedule | Task 1, 2 |

### 构建系统变更

- 无新增依赖；复用 Node 原生测试与 Vite。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | 后台通知基础设施缺失 | Task 2 | 首版只显示站内状态 |
| 2 | v3 云端 hash 兼容 | Task 3 | 升 v4，原始 hash 后迁移 |
| 3 | 重复任务无限展开 | Task 1 | 仅按今天/未来 30 天窗口展开 |

## 任务列表

### 任务 1: [x] 建立 Schema v4、Store 与重复算法
- 文件: `src/data/store.js`、`src/sync/snapshot.js`、`src/utils/growthSchedule.js`、`tests/growth-schedule.test.js`
- 依赖: 无
- spec 映射: 3、4.1～4.3、7.1
- 验收标准:
  - [x] v1-v3 无损迁移为 v4
  - [x] 一次性/每日/每周展开和完成幂等测试通过
  - [x] Store CRUD 原子且 generation 保护通过
  - [x] Code Review PASS
- 子任务:
  - [x] 1.1: 定义 v4 数据模型与校验
  - [x] 1.2: 实现纯重复算法
  - [x] 1.3: 实现 Store CRUD 与测试

### 任务 2: [x] 实现简约成长日程 UI
- 文件: `src/components/GrowthSchedule.vue`、`src/components/Dashboard.vue`、`src/App.vue`
- 依赖: Task 1
- spec 映射: 3.1、4.2、4.3、7.2
- 验收标准:
  - [x] 今天/接下来、新增/编辑/删除/完成可用
  - [x] 入口在所有成长阶段可见
  - [x] 桌面与移动端构建通过
  - [x] Code Review PASS
- 子任务:
  - [x] 2.1: 创建今天/接下来列表
  - [x] 2.2: 创建快速表单和一键完成
  - [x] 2.3: 接入 Dashboard 与导入提示

### 任务 3: [x] 完成同步兼容与全链路验收
- 文件: 现有同步/空间测试与项目文档
- 依赖: Task 2
- spec 映射: 7～10
- 验收标准:
  - [x] 全量测试、构建、Rust 与格式检查通过
  - [x] v3 云端/本地快照迁移 v4 测试通过
  - [x] 浏览器核心流程通过
  - [x] Code Review PASS
- 子任务:
  - [x] 3.1: 升级 fixture 与兼容测试
  - [x] 3.2: 浏览器验收
  - [x] 3.3: 文档、提交与推送

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 1～3 | Task 1～3 | 精简范围与约束 |
| 4.1～4.3 | Task 1、2 | 数据、算法、Store 与 UI |
| 4.4～6 | Task 3 | 取舍与市场调研 |
| 7～10 | Task 1～3 | 测试、升级和交付 |
