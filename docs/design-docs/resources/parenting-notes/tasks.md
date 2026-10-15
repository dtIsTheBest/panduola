# 实施任务清单

> 由 spec.md 生成
> 任务总数: 3
> 核心原则: 先建私有数据域与安全契约，再接入 UI，最后完成部署验证

## 依赖关系总览

Task 1（私有数据域与仓库）
  ↓
Task 2（手记 UI 与资源库集成）
  ↓
Task 3（部署文档与全量验证）

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `supabase/migrations/202610150001_parenting_notes.sql` | 新建 | Task 1 | 私有表、Bucket、RLS 与 Storage Policy |
| `supabase/tests/parenting_notes.sql` | 新建 | Task 1 | 数据隔离和对象策略测试 |
| `src/notes/parentingNotesRepository.js` | 新建 | Task 1 | 手记与图片持久化 |
| `src/notes/noteContent.js` | 新建 | Task 1 | 安全链接解析 |
| `tests/parenting-notes.test.js` | 新建 | Task 1 | 内容与仓库单元测试 |
| `src/main.js` | 修改 | Task 1 | Repository 注入 |
| `src/components/ParentingNotes.vue` | 新建 | Task 2 | 手记列表与交互 |
| `src/components/ParentingNoteEditor.vue` | 新建 | Task 2 | 编辑器与图片选择 |
| `src/App.vue` | 修改 | Task 2 | 资源/手记切换与账号入口 |
| `.env.example` | 修改 | Task 3 | 功能开关 |
| `docs/deployment/parenting-notes.md` | 新建 | Task 3 | 发布、验证与回滚 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `createParentingNotesRepository()` | 新增 | `main.js`、`ParentingNotes.vue` | Task 1, 2 |
| `parseNoteContent()` | 新增 | `ParentingNotes.vue` | Task 1, 2 |
| `App.handleViewChange()` | 行为扩展 | `Header.vue`/资源库操作 | Task 2 |

### 构建系统变更

- 无新增依赖；沿用 Vue、Supabase SDK、Lucide 和现有图片处理器。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | Postgres 与 Storage 无跨服务事务 | Task 1 | 文字优先保存，图片失败单独反馈并允许编辑重试 |
| 2 | 手记仅限登录账号 | Task 2 | 未登录展示登录引导，不创建本地临时手记 |
| 3 | 备份不含图片二进制 | Task 3 | 文档明确手记由云端独立持久化，不混入 JSON 备份 |

## 任务列表

### 任务 1: [x] 建立私有手记数据域与安全仓库
- 文件: `supabase/migrations/202610150001_parenting_notes.sql`（新建）、`supabase/tests/parenting_notes.sql`（新建）、`src/notes/parentingNotesRepository.js`（新建）、`src/notes/noteContent.js`（新建）、`tests/parenting-notes.test.js`（新建）、`src/main.js`（修改）
- 依赖: 无
- spec 映射: 3.1、3.2、4.1、4.2、4.3
- 说明: 建立账号私有数据库与对象存储边界，实现校验、CRUD、签名 URL 和安全链接 token。
- context:
  - `src/community/communityRepository.js:createCommunityRepository()` — 仓库错误、账号和签名 URL 模式
  - `src/community/photoProcessor.js:processPhoto()` — 已处理图片契约
  - `src/main.js` — Supabase Client Provider 与依赖注入
  - `supabase/migrations/202610100003_community_walls.sql` — RLS 与 Storage Policy 基线
- 验收标准:
  - [x] `npm test` 通过且无新失败
  - [x] `npm run build` 通过
  - [x] Repository 测试覆盖未登录、非法输入、批量签名、图片部分失败和删除顺序
  - [x] pgTAP 覆盖双账号不可见与 Bucket 非公开
- 子任务:
  - [x] 1.1: 完成数据模型与安全边界设计
  - [x] 1.2: 实现 migration 与 pgTAP
  - [x] 1.3: 实现安全链接解析与 Repository
  - [x] 1.4: 完成单元测试与注入

### 任务 2: [x] 实现育儿手记界面并接入资源库
- 文件: `src/components/ParentingNotes.vue`（新建）、`src/components/ParentingNoteEditor.vue`（新建）、`src/App.vue`（修改）
- 依赖: Task 1
- spec 映射: 3.1、4.2.1、4.2.4、4.2.5、4.3
- 说明: 提供资源/手记切换、私有列表、搜索、编辑、图片预览、链接展示与账号切换清理。
- context:
  - `src/App.vue` — 资源库页面入口和账号中心
  - `src/components/FamilyPhotoWall.vue` — 图片选择、处理与 Object URL 生命周期
  - `src/components/LinkList.vue` — 资源列表视觉基线
  - `src/notes/parentingNotesRepository.js` — Task 1 产出的持久化接口
- 验收标准:
  - [x] `npm run build` 通过且无 Vue 编译错误
  - [x] 登录、空状态、创建、编辑、删除和图片失败均有可见反馈
  - [x] 裸 URL 与 Markdown 链接可点击且无 `v-html`
  - [x] 900px 以下布局可用，账号切换后旧签名 URL 不再显示
- 子任务:
  - [x] 2.1: 实现手记编辑器
  - [x] 2.2: 实现列表、搜索与安全链接渲染
  - [x] 2.3: 接入资源库模式切换和账号入口

### 任务 3: [~] 完成发布说明、全量验证与上线
- 文件: `.env.example`（修改）、`docs/deployment/parenting-notes.md`（新建）
- 依赖: Task 2
- spec 映射: 7、8
- 说明: 记录 migration、配置、生产冒烟、止写和无损回滚步骤，执行完整门禁并发布。
- context:
  - `.env.example` — 生产构建变量
  - `docs/deployment/community-walls.md` — 部署文档风格与验证基线
  - `package.json` — 项目测试和构建命令
- 验收标准:
  - [x] `npm test` 全量通过
  - [x] `npm run build`、`git diff --check` 和格式检查通过
  - [x] linked Supabase migration 与 SQL 测试通过
  - [ ] 推送后线上资源哈希更新并完成匿名/登录冒烟
- 子任务:
  - [x] 3.1: 补充环境变量和部署文档
  - [x] 3.2: 执行本地与 Supabase 验证
  - [~] 3.3: 提交、推送并验证生产发布

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 3.1 | Task 1, 2 | 数据能力与用户交互 |
| 3.2 | Task 1, 3 | 安全、性能、兼容与运维 |
| 4.1 | Task 1, 2 | 私有数据域与前端集成 |
| 4.2 | Task 1, 2 | Repository、组件与模型 |
| 4.3 | Task 1, 2 | 链接、图片和列表核心逻辑 |
| 4.4 | Task 3 | 方案限制与发布边界 |
| 5 | Task 1 | 避免 Base64、快照与照片墙复用 |
| 7 | Task 1, 3 | 单元、集成和全量验证 |
| 8 | Task 3 | 配置、部署和回滚 |
