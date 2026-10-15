# Feature: 私有育儿手记

**作者**: Codex
**日期**: 2026-10-15
**状态**: Approved

---

## 1. 背景 (Background)

### 1.1 问题描述

- 当前资源库只能收录带 HTTP(S) 地址的外部资源，“描述”字段只适合简短摘要，无法独立记录家庭育儿经验。
- 用户希望把实践心得、阶段性观察和可复用方法沉淀在站内，并配上家庭图片与可点击参考链接。
- 图片不能写入现有账号快照：快照存在严格大小上限，内嵌图片会破坏同步稳定性。

### 1.2 现状分析

- `src/App.vue` 负责资源库页面、搜索、导入导出与资源编辑入口。
- `src/components/LinkList.vue` 和 `LinkModal.vue` 只处理 URL 资源。
- `src/data/store.js` 的账号快照承载资源、孩子、生长记录和日程，当前 Schema 为 5。
- `src/account/supabaseClient.js` 提供延迟初始化且复用登录 Session 的 Supabase Client。
- `src/community/photoProcessor.js` 已实现 JPEG/PNG/WebP 校验、缩放、去元数据和 WebP 输出。
- `src/community/communityRepository.js` 与 `family-photos` 私有 Bucket 已验证账号隔离、签名 URL 和上传清理模式。

### 1.3 主要使用场景

- 家长记录一次喂养、睡眠、情绪或亲子沟通经验，之后通过关键词检索。
- 手记中附上少量过程照片，并在多设备登录后继续查看。
- 手记正文引用官方文章或其他 HTTP(S) 页面，展示为安全可点击链接。
- 用户编辑或删除自己的手记，其他账号不能读取、修改或枚举其内容与图片。

## 2. 目标 (Goals)

- 在资源库内提供轻量、易用的“育儿手记”，支持文字、基础超链接和图片。
- 手记与图片按登录账号严格隔离，可靠持久化且不进入现有账号快照。
- 保持资源收录、生长记录、账号同步和社区双墙行为不变。

### 2.1 非目标 (Non-Goals)

- 不实现多人协作、公开分享、评论或点赞。
- 不实现复杂富文本、表格、代码块、附件和图片内嵌排版。
- 不支持未登录用户创建临时手记；未登录时显示明确登录入口。
- 本期不把手记内容放入现有 JSON 导入导出文件，避免混合数据库与 Storage 的不完整备份。

## 3. 需求细化 (Requirements)

### 3.1 功能性需求

- 资源库提供“收藏资源 / 育儿手记”切换，默认仍展示收藏资源。
- 登录用户可以创建、查看、搜索、编辑和删除自己的手记。
- 手记包含标题、正文、创建时间、更新时间和最多 4 张图片。
- 标题最多 80 个 Unicode 字符，正文最多 5000 个 Unicode 字符；每个账号最多 100 篇手记。
- 编辑器支持普通文本、自动识别 HTTP(S) 地址，以及 `[显示文字](https://example.com)` 基础链接语法。
- 展示层不使用原始 HTML；所有链接仅允许 HTTP(S)，新窗口打开并隔离 `opener`。
- 图片支持 JPEG、PNG、WebP 输入，复用现有图片处理器转为移除元数据的 WebP；单图处理后不超过 5 MiB、最长边不超过 1920 px。
- 图片存储于私有 Bucket，通过短时签名 URL 展示；切换账号或退出登录时立即清空列表和 URL 引用。
- 保存手记时先持久化文字，再逐张上传图片；部分图片失败时保留已保存文字并给出可理解的结果提示。
- 删除手记时删除对应 Storage 对象和数据库记录；失败时保持可重试状态，不向其他账号泄露对象路径。

### 3.2 非功能性需求

- 数据隔离：数据库启用 RLS，所有读写以 `auth.uid()` 为唯一归属依据；Storage 路径首段必须为用户 ID。
- 兼容性：不提升现有账号快照 Schema，不修改旧快照 hash 和迁移逻辑。
- 性能：列表单次最多读取 100 篇手记，图片签名使用批量请求，首屏图片懒加载。
- 安全：拒绝危险协议、HTML 注入、非法 UUID、超长正文、伪造 MIME 与越权删除。
- 可恢复性：网络失败映射为稳定错误；文字保存和图片上传分别反馈，避免图片失败导致正文丢失。
- 可维护性：仓库层负责校验、Supabase 与 Storage 调用；Vue 组件只处理交互和展示状态。

## 4. 设计方案 (Design)

### 4.1 方案概览

- 新增独立 `parenting-notes` 私有数据域：Postgres 保存手记与图片元数据，Storage 保存 WebP 文件。
- 在资源库页面增加轻量分段切换；资源模式沿用原逻辑，手记模式挂载独立列表和编辑弹窗。
- 复用现有 Supabase Client、登录 Session、图片处理器和主题变量，不耦合账号快照。
- 数据流：编辑器校验文字 → Repository 保存手记 → 处理并上传图片 → 刷新私有列表 → 批量签名展示。

### 4.2 组件设计 (Component Design)

#### 4.2.1 核心类/模块设计

- `parentingNotesRepository.js`：输入校验、账号校验、CRUD、图片上传/删除、DTO 映射和错误归一化。
- `noteContent.js`：把纯文本与基础 Markdown 链接解析为安全 token，不输出 HTML。
- `ParentingNotes.vue`：私有列表、搜索、空状态、删除确认、登录引导和错误反馈。
- `ParentingNoteEditor.vue`：标题/正文编辑、链接提示、图片预览、数量与长度限制、保存进度。
- `App.vue`：资源/手记模式切换与仓库注入，不承载手记业务逻辑。

#### 4.2.2 接口设计

- `listOwnNotes()`：返回当前账号手记及带签名 URL 的图片 DTO。
- `createNote({ title, content, images })`：创建文字后上传已处理图片，返回最新 DTO 与失败图片数。
- `updateNote(noteId, { title, content, keptImageIds, newImages })`：更新文字、删除移除图片并上传新增图片。
- `deleteNote(noteId)`：删除对象与本人手记。
- 错误码覆盖未配置、未登录、非法输入、数量上限、网络和 Storage 失败。

#### 4.2.3 数据模型

- `parenting_notes`：`id`、`user_id`、`title`、`content`、`created_at`、`updated_at`。
- `parenting_note_images`：`id`、`note_id`、`user_id`、`object_path`、`mime_type`、`width`、`height`、`byte_size`、`sort_order`、`created_at`。
- `parenting-note-images`：private Bucket，路径为 `<user-id>/<note-id>/<image-id>.webp`。
- 表启用 RLS；外键删除手记时级联删除元数据，Storage 对象由应用按已授权路径删除。

#### 4.2.4 并发模型

- 组件通过请求序号和用户 generation 忽略切换账号后的迟到响应。
- 保存、删除操作单飞；同一手记重复提交时禁用按钮。
- 数据库以行级归属和主键约束处理多标签页并发，最后一次成功更新生效。

#### 4.2.5 错误处理

- 文字创建/更新失败时不上传新图片。
- 图片部分失败时保留文字和已成功图片，返回失败数量供 UI 提示和重试。
- 删除图片采用 Storage-first；对象不存在视为幂等成功，再删除元数据。
- 非法远端 DTO 统一映射为可重试网络错误，不直接渲染。

### 4.3 核心逻辑实现

- 内容解析按段落扫描 Markdown 链接与裸 HTTP(S) 地址，生成 `text` / `link` token；Vue 使用文本插值和 `<a>` 渲染。
- 图片选择后立即调用现有 `processPhoto()`，仅在处理成功后进入待上传列表；Object URL 在移除、关闭和卸载时释放。
- 列表查询按 `updated_at desc` 返回，图片按 `sort_order` 排序，并在一次 Storage 请求中批量生成签名 URL。
- 删除手记前从受 RLS 保护的图片元数据获取路径，完成 Storage 删除后删除手记行。

### 4.4 方案优劣分析

- 优点：不碰快照 Schema；图片不占同步额度；RLS 和私有 Bucket 隔离清晰；复用已验证的图片处理能力。
- 局限：手记需要登录和联网；文字与 Storage 不能跨服务强事务，采用“文字优先、图片可重试”的可恢复语义。

## 5. 备选方案 (Alternatives Considered)

- 把图片转 Base64 写入账号快照：会快速超过 2 MiB 上限并放大冲突，否决。
- 把手记伪装成资源描述：仍要求 URL，检索和编辑体验差，否决。
- 复用亲子照片墙元数据表：职责与生命周期不同，会让删除、排序和数量限制互相影响，否决。

## 6. 业界调研 (Industry Research)

- 轻量笔记产品普遍采用纯文本/受限 Markdown 与附件分离存储，避免直接接受任意 HTML。
- 图片附件通常使用对象存储和短时签名 URL，数据库只保存归属与展示元数据。
- 本方案保留这些成熟做法，但按家庭工具场景缩减到标题、正文、链接和少量图片。

## 7. 测试计划 (Test Plan)

### 7.1 单元测试

- 链接解析、危险协议拒绝、Unicode 长度边界、远端 DTO 映射、图片数量与账号校验。

### 7.2 集成测试

- Repository 列表、创建、更新、部分图片失败、删除顺序、签名 URL 与账号切换。
- Supabase pgTAP 验证 RLS、Bucket、Storage Policy 和账号间不可见。

### 7.3 性能测试（如适用）

- 100 篇手记和 400 条图片元数据的映射与链接解析保持线性；不新增独立性能门禁。

## 8. 可观测性 & 运维 (Observability & Operations)

### 8.1 可观测性

- UI 展示稳定错误文案，不记录标题、正文、对象路径或签名 URL。
- 通过 Supabase Dashboard 观察表错误、Storage 4xx/5xx 与容量变化。

### 8.2 配置参数

| 参数名 | 类型 | 默认值 | 说明 | 是否支持动态修改 |
|--------|------|--------|------|------------------|
| `VITE_PARENTING_NOTES_ENABLED` | bool | `true` | 手记前端功能开关 | 否（需重建） |

### 8.3 运维接口

- 通过 Supabase migration 发布表、RLS、Bucket 和 Policy；无额外管理 API。

### 8.4 运维注意事项

- 发布顺序：migration → 环境变量 → 前端。
- 回滚前端时保留表、Bucket 和对象，避免用户数据丢失。
- 紧急止写可撤销 authenticated 对表的写权限，读权限仍由 RLS 控制。

## 9. Changelog

| 日期 | 变更内容 | 作者 |
|------|----------|------|
| 2026-10-15 | 创建私有育儿手记设计 | Codex |

## 10. 参考资料

- `docs/design-docs/platform/community-walls/spec.md`
- `docs/design-docs/platform/account-sync/spec.md`
