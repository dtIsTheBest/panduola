# 实施任务清单

> 由 spec.md 生成
>
> 任务总数: 4
> 核心原则: 先升级并验证 Schema，再贯通持久化与云同步，随后接入 UI，最后完成全链路验收

## 依赖关系总览

```text
Task 1（Schema v3 与 Store 领域契约）
  ↓
Task 2（本地持久化与云同步兼容）
  ↓
Task 3（多孩生长曲线交互）
  ↓
Task 4（文档与全链路验收）
```

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `src/data/store.js` | 修改 | Task 1 | Schema v3、孩子模型、迁移、Store CRUD 与归属校验 |
| `src/sync/snapshot.js` | 修改 | Task 1 | 当前快照版本升级与版本边界 |
| `tests/growth-multi-child.test.js` | 新建 | Task 1 | 多孩迁移、校验和 Store 隔离测试 |
| `tests/system-hardening.test.js` | 修改 | Task 1 | 历史导入与未来版本兼容测试 |
| `tests/account-foundations.test.js` | 修改 | Task 1, 2 | v3 canonical/hash/大小边界测试 |
| `src/data/dataSpaceRepository.js` | 修改 | Task 1, 2 | 本地版本门禁前移，随后补齐历史迁移测试 |
| `src/sync/cloudSnapshotRepository.js` | 修改 | Task 2 | 云端 v2→v3 迁移和原始 hash 校验 |
| `tests/data-spaces.test.js` | 修改 | Task 2 | Web 数据空间与恢复副本保留多孩数据 |
| `tests/cloud-adapters.test.js` | 修改 | Task 2 | 云端历史/当前/未来版本契约 |
| `tests/tauri-storage.test.js` | 修改 | Task 2 | Tauri v2→v3 与恢复副本测试 |
| `tests/sync-coordinator.test.js` | 修改 | Task 2 | v3 整快照同步与冲突测试 |
| `tests/account-facade.test.js` | 修改 | Task 2 | 账号门面 v3 fixture 与恢复测试 |
| `src/components/GrowthTracker.vue` | 修改 | Task 3 | 孩子选择、新增、改名与记录隔离 UI |
| `src/App.vue` | 修改 | Task 3 | 导入覆盖提示包含孩子和成长记录 |
| `docs/design-docs/platform/account-sync/spec.md` | 修改 | Task 4 | 记录 v3 快照兼容性 |
| `docs/design-docs/frontend/visual-refresh/spec.md` | 修改 | Task 4 | 更新生长曲线多孩能力说明 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `normalizeData(rawData)` | 行为升级 | 数据空间、云仓库、导入、Store | Task 1, 2 |
| `validateImportData(rawData)` | 行为升级 | `App.vue` | Task 1, 3 |
| `store.getSnapshot(...)` | 兼容扩展 | Store 全部写操作、同步层 | Task 1 |
| `store.addGrowthChild(child, options)` | 新增 | `GrowthTracker.vue` | Task 1, 3 |
| `store.renameGrowthChild(childId, name, updatedAt, options)` | 新增 | `GrowthTracker.vue` | Task 1, 3 |
| `store.upsertGrowthRecord(record, options)` | 契约增强 | `GrowthTracker.vue` | Task 1, 3 |
| `store.deleteGrowthRecord(recordId, childId, options)` | 签名增强 | `GrowthTracker.vue` | Task 1, 3 |

### 构建系统变更

- 无依赖或构建配置变更；新增 Node 原生测试文件自动由 `node --test` 发现。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | 旧客户端无法理解 v3 | Task 1, 2 | 明确拒绝未来版本，禁止静默降级覆盖 |
| 2 | 云端 v2 payload hash 基于原始结构 | Task 2 | 先验证原始 payload hash，再标准化为 v3 |
| 3 | 当前选择不需跨会话保存 | Task 3 | 组件会话内保留，失效时回到第一个孩子 |
| 4 | 本期不允许删除孩子 | Task 1, 3 | Store 不提供 delete child API，避免隐式级联 |
| 5 | 孩子名称需易识别 | Task 1, 3 | trim 后 1～20 Unicode 字符且家庭内唯一 |

## 任务列表

### 任务 1: [x] 建立 Schema v3 与多孩 Store 契约
- 文件: `src/data/store.js`（修改）、`src/sync/snapshot.js`（修改）、`src/data/dataSpaceRepository.js`（修改，计划前移）、`tests/growth-multi-child.test.js`（新建）、`tests/system-hardening.test.js`（修改）、`tests/account-foundations.test.js`（修改）
- 依赖: 无
- spec 映射: 3.1、3.2、4.1、4.2.1～4.2.5、4.3、7.1、7.3
- 说明: 升级快照结构，确定性迁移旧记录，建立孩子 CRUD、记录归属与原子快照不变量。
- context:
  - `src/data/store.js:490-581` — 成长记录与根快照标准化
  - `src/data/store.js:655-710` — 完整快照提交与 reactive 状态
  - `src/data/store.js:1054-1078` — 现有成长记录 CRUD
  - `src/sync/snapshot.js:1-45` — 版本断言与确定性序列化
  - `src/components/GrowthTracker.vue:232-362` — Store 新接口的上游调用方
- 验收标准:
  - [x] `node --test tests/growth-multi-child.test.js tests/system-hardening.test.js tests/account-foundations.test.js` 通过
  - [x] v2 含成长记录快照两次标准化结果深相等，默认孩子 ID 固定且记录全部归属该孩子
  - [x] v3 对空/重复/超长孩子、悬空记录引用、21 个孩子和 v4 快照返回明确错误
  - [x] 两个孩子可保存同日记录，错误 childId 编辑/删除不修改快照
  - [x] Code Review PASS
- 子任务:
  - [x] 1.1: 定义 Schema v3 孩子与记录模型
  - [x] 1.2: 实现 v1/v2 确定性迁移与 v3 严格校验
  - [x] 1.3: 实现孩子 CRUD 与带归属的记录 CRUD
  - [x] 1.4: 补充核心单元与性能边界测试

### 任务 2: [x] 贯通本地持久化与云同步兼容
- 文件: `src/data/dataSpaceRepository.js`（修改）、`src/sync/cloudSnapshotRepository.js`（修改）、`tests/account-foundations.test.js`（修改）、`tests/data-spaces.test.js`（修改）、`tests/cloud-adapters.test.js`（修改）、`tests/tauri-storage.test.js`（修改）、`tests/sync-coordinator.test.js`（修改）、`tests/account-facade.test.js`（修改）
- 依赖: Task 1
- spec 映射: 3.1、3.2、4.1、4.2.1、4.2.3～4.2.5、4.3、7.2、8.4
- 说明: 允许历史 v2 快照在本地和云端进入 v3 迁移，同时继续拒绝未来版本并保持原始云 payload hash 校验。
- context:
  - `src/data/dataSpaceRepository.js:206-219` — 本地原始版本门禁
  - `src/sync/cloudSnapshotRepository.js:116-170` — 云端元数据、版本、hash 与标准化顺序
  - `src/sync/snapshot.js:assertSupportedSnapshot()` — Task 1 版本契约
  - `src/main.js:43-56` — 标准化函数注入同步链路
- 验收标准:
  - [x] `node --test tests/data-spaces.test.js tests/cloud-adapters.test.js tests/tauri-storage.test.js tests/sync-coordinator.test.js tests/account-facade.test.js` 通过
  - [x] Web/Tauri v2 快照加载为 v3 且原 legacy 源保留
  - [x] 云端 v2 行验证原 hash 后迁移为 v3，v3 上传/CAS 保留孩子归属，v4 拒绝
  - [x] 恢复副本、账号空间切换和同步冲突不会丢失 `growthChildren` 或 `childId`
  - [x] Code Review PASS
- 子任务:
  - [x] 2.1: 调整本地快照版本门禁
  - [x] 2.2: 调整云端历史快照校验与迁移顺序
  - [x] 2.3: 升级同步与存储测试 fixture
  - [x] 2.4: 补充跨空间、恢复和未来版本测试

### 任务 3: [x] 实现多孩生长曲线交互
- 文件: `src/components/GrowthTracker.vue`（修改）、`src/App.vue`（修改）
- 依赖: Task 2
- spec 映射: 3.1、3.2、4.1、4.2.1、4.2.2、4.2.4、4.2.5、4.3、7.2
- 说明: 在生长曲线弹窗中提供孩子选择、新增和改名，并把全部展示与记录操作收敛到当前孩子。
- context:
  - `src/components/GrowthTracker.vue:1-188` — 当前摘要、图表、表单和历史布局
  - `src/components/GrowthTracker.vue:218-362` — 当前状态与 CRUD 调用
  - `src/data/store.js` — Task 1/2 产出的孩子与记录接口
  - `src/App.vue:256-297` — 完整快照导入导出文案
- 验收标准:
  - [x] `npm run build` 通过且无 Vue 编译错误
  - [x] 浏览器可新增、改名、切换孩子，不提供删除孩子入口
  - [x] 不同孩子可保存同日记录，摘要、图表和历史互不串数据
  - [x] 切换孩子会重置编辑/错误/表单，键盘可完成孩子操作
  - [x] 375px 响应式样式经构建与 CSS 检查，无固定宽度溢出
  - [x] Code Review PASS
- 子任务:
  - [x] 3.1: 增加孩子选择与管理区
  - [x] 3.2: 将展示、判重与 CRUD 绑定当前孩子
  - [x] 3.3: 实现切换状态清理和错误提示
  - [x] 3.4: 更新导入提示与响应式样式

### 任务 4: [x] 完成文档与全链路验收
- 文件: `docs/design-docs/platform/account-sync/spec.md`（修改）、`docs/design-docs/frontend/visual-refresh/spec.md`（修改）、Task 1～3 测试文件（按需补充）
- 依赖: Task 3
- spec 映射: 4.4、5～10
- 说明: 固化 Schema v3 运维边界，执行全量测试、构建、格式、浏览器和生产发布前检查。
- context:
  - `spec.md:7` — 测试计划
  - `spec.md:8` — 升级、回滚与故障处理
  - `package.json` — Node/Vite 质量门禁
  - `src-tauri` — 通用 JSON 存储兼容边界
- 验收标准:
  - [x] `npm test`、`npm run build`、Rust 检查和格式检查通过
  - [x] 接近 2 MiB 的 v3 快照加载 P95 不超过 300ms
  - [x] 浏览器桌面全流程通过；运行时固定 1280px，375px 由响应式 CSS 与构建检查覆盖
  - [x] 文档明确 v3 升级、旧客户端拒绝和回滚限制
  - [x] `git diff --check` 与敏感信息扫描通过
  - [x] Code Review PASS
- 子任务:
  - [x] 4.1: 更新账号同步和视觉能力说明
  - [x] 4.2: 执行全量自动化与性能门禁
  - [x] 4.3: 执行浏览器可访问性和响应式验收
  - [x] 4.4: 完成最终评审、提交与推送

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 1～3 | Task 1～4 | 问题、目标、功能与兼容约束由完整交付覆盖 |
| 4.1 | Task 1～3 | Schema、Store、同步和 UI 单向依赖 |
| 4.2.1 | Task 1～3 | 核心模块职责与边界 |
| 4.2.2 | Task 1、3 | Store public API 与 UI 调用 |
| 4.2.3 | Task 1、2 | Schema v3、迁移和云端 JSONB |
| 4.2.4 | Task 1～3 | Store 串行写、原子快照和 UI 切换状态 |
| 4.2.5 | Task 1～3 | 校验、损坏隔离、恢复和 UI 错误 |
| 4.3 | Task 1～3 | 迁移、CRUD、同步与当前孩子过滤路径 |
| 4.4～6 | Task 4 | 取舍、备选和业界核对结果归档 |
| 7 | Task 1～4 | 单元、集成、性能和浏览器测试 |
| 8 | Task 2、4 | 版本、升级、回滚和故障处理 |
| 9～10 | Task 4 | 变更记录与参考资料 |
