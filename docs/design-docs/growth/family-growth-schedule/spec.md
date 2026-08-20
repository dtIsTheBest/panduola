# Feature: 简约家庭成长日程

**作者**: Codex

**日期**: 2026-08-20

**状态**: Approved

---

## 1. 背景 (Background)
### 1.1 问题描述
- “成长日程”入口目前只提示功能开发中，家庭无法在站内记录体检、疫苗、课程、活动和轻量习惯。
- 通用日历字段多、操作重；首版需要围绕“今天做什么、属于谁、是否完成”提供低学习成本体验。
### 1.2 现状分析
- Dashboard 已有成长日程快捷入口，但未挂载真实组件；选择成长阶段后该入口可能消失。
- 当前业务快照为 Schema v3，包含资源、孩子档案与成长记录，并通过完整快照完成本地持久化、恢复和 Supabase 云同步。
- 项目没有系统通知、Service Worker、Tauri notification 或日期重复库，首版提醒只能是站内状态。
### 1.3 主要使用场景
- 家长查看今天及接下来需要处理的家庭事项。
- 给某个孩子或全家创建一次性/每天/每周日程。
- 一键完成或撤销某次发生实例，不影响后续重复任务。
- 同账号跨设备同步日程和完成状态。

## 2. 目标 (Goals)
- 以最少字段和一步完成操作，提供真正高频、容易坚持使用的家庭成长日程。
### 2.1 非目标 (Non-Goals)
- 不做月历、复杂 RRULE、提前提醒配置、后台通知、积分连续打卡、聊天、餐食、外部日历同步或多账号家庭邀请。

## 3. 需求细化 (Requirements)
### 3.1 功能性需求
- 提供“今天”和“接下来”两个视图，默认打开今天。
- 快速新增字段仅包含标题、日期、可选时间、孩子/全家、类型、重复方式和备注。
- 类型支持体检、疫苗、课程、活动、习惯和其他；重复支持不重复、每天、每周。
- 日程状态显示今天、即将开始、已逾期和已完成；应用打开时站内展示。
- 每个重复实例按发生日期独立完成/撤销；支持编辑和删除日程模板。
- 入口在所有成长阶段下可见；数据参与本地空间、导入导出、恢复副本和云同步。
### 3.2 非功能性需求
- Schema 升至 v4，v1-v3 确定性补空日程集合；v5+ fail-closed。
- 重复实例按查询窗口即时展开，不预生成未来记录；今天/未来计算保持线性。
- 所有写入进入 Store mutation queue，并使用 expectedDataGeneration 防止权威快照覆盖。
- 标题 1-60 字符、备注最多 200 字符、时间使用 HH:mm、日期使用 YYYY-MM-DD。
- 站内日程不宣称应用关闭后仍提醒；移动端保持单列与键盘可访问。

## 4. 设计方案 (Design)
### 4.1 方案概览
- 新增 `scheduleItems` 模板和 `scheduleCompletions` 实例完成记录，将 Schema v3 升至 v4。
- `growthSchedule.js` 负责纯日期、重复展开和状态计算；Store 负责数据不变量；`GrowthSchedule.vue` 负责今天/接下来和快速表单。
- 数据继续随整份账号快照同步，数据库与 Rust 层不改。
### 4.2 组件设计 (Component Design)
#### 4.2.1 核心类/模块设计
- `store.js`：v4 迁移、日程/完成记录 CRUD、引用和 generation 校验。
- `growthSchedule.js`：不依赖 Vue 的日期与重复规则纯函数。
- `GrowthSchedule.vue`：筛选、列表、表单、完成操作和焦点状态。
- `Dashboard.vue`：保证入口始终可见并挂载弹窗。
#### 4.2.2 接口设计
- `store.upsertScheduleItem(item, options)`、`deleteScheduleItem(id, options)`。
- `store.setScheduleOccurrenceCompleted(scheduleId, occurrenceDate, completed, options)`。
- `getScheduleOccurrences(items, completions, fromDate, toDate)` 返回派生实例，不持久化展示状态。
#### 4.2.3 数据模型
- `scheduleItems`: `{ id, childId|null, title, type, startDate, startTime|null, recurrence: none|daily|weekly, note, createdAt, updatedAt }`。
- `scheduleCompletions`: `{ id, scheduleId, occurrenceDate, completedAt }`；`scheduleId+occurrenceDate` 唯一。
- v1-v3 迁移补空数组；删除模板同时删除其完成记录。
#### 4.2.4 并发模型
- 继续使用 Store 串行队列和完整快照原子提交；UI 捕获 spaceKey/dataGeneration，迟到操作不得覆盖权威替换。
#### 4.2.5 错误处理
- 非法日期、时间、引用、重复 ID 和悬空完成记录在保存/导入前拒绝；持久化失败不更新 reactive 状态。
### 4.3 核心逻辑实现
- 一次性任务仅在 startDate 生成实例；每天任务按日期步进；每周任务按 startDate 的星期步进 7 天。
- 今天视图只展开当天；接下来展开明天起 30 天并按日期/时间排序。
- 完成键为 `scheduleId:occurrenceDate`，勾选重复任务只影响该日实例。
### 4.4 方案优劣分析
- 优点是字段少、交互快、重复任务语义清晰并完全复用现有持久化；局限是没有系统通知、月历和复杂重复规则。

## 5. 备选方案 (Alternatives Considered)
- 复杂月历和完整 RRULE 学习/实现成本高；预生成实例会膨胀快照；单个 completed 布尔值无法表达重复任务逐次完成，均不采用。

## 6. 业界调研 (Industry Research)

> **注意**：本章节应在完成自主设计后填写，用于验证方案、确保下限，而非作为设计的起点。

### 6.1 业界方案
- FamilyWall、TimeTree 与 Hearth 的共性是共享日程、成员归属、提醒、重复任务、今日筛选和完成反馈。
### 6.2 对比分析
- 首版提取上述高频核心，暂缓奖励、聊天、餐食和外部同步，避免功能过载。

## 7. 测试计划 (Test Plan)
### 7.1 单元测试
- v1-v3→v4 迁移、字段/引用校验、一次性/每日/每周展开、排序、状态和完成幂等。
### 7.2 集成测试
- Store CRUD、空间/恢复/云同步、导入导出、Dashboard 入口及浏览器完整流程。
### 7.3 性能测试（如适用）
- 30 天窗口展开线性，接近 2 MiB 快照加载 P95 <300ms。

## 8. 可观测性 & 运维 (Observability & Operations)

### 8.1 可观测性
- 不记录标题、备注或孩子名；沿用 Schema/同步错误摘要。

### 8.2 配置参数 (Configuration)
| 参数名 | 类型 | 默认值 | 说明 | 是否支持动态修改 |
|--------|------|--------|------|------------------|
| 无 | - | - | 不新增运行时配置 | - |

### 8.3 运维接口 (Operations Interfaces)
- 继续使用现有导出、恢复和同步中心。

### 8.4 运维注意事项 (Operations Considerations)
- 写入 v4 后旧客户端必须拒绝，不可直接回滚 v3；数据库无需 migration。

## 9. Changelog
| 日期 | 变更内容 | 作者 |
|------|----------|------|
| 2026-08-20 | 完成精简版家庭成长日程需求与设计 | Codex |

## 10. 参考资料 (References)
- [FamilyWall](https://support.familywall.com/en/support/solutions/articles/47001013681-about-familywall)
- [TimeTree](https://support.timetreeapp.com/hc/en-us/articles/900004492623-How-to-use-shared-calendar-app)
- [Hearth](https://hearthdisplay.com/pages/features)
