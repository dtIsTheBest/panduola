# 实施任务清单

> 由 spec.md 生成
> 任务总数: 5
> 核心原则: 先建后迁后删——先建立数据库与私有存储边界，再实现前端适配器，随后替换首页挂载，最后完成部署验证；AI 代码始终保留。

## 依赖关系总览

```text
Task 1（数据库、RPC 与私有 Storage） ─┐
                                      ├──> Task 3（双墙 UI 与首页替换）
Task 2（Repository 与图片处理） ──────┘
                                               ↓
                                      Task 4（部署与全链路验收）
```

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `supabase/migrations/202610100003_community_walls.sql` | 新建 | Task 1 | 评论/照片表、RPC、RLS、Bucket 与 Storage Policy |
| `supabase/tests/community_walls.sql` | 新建 | Task 1 | 匿名、跨用户、数量边界与 Storage 权限 pgTAP |
| `supabase/config.toml` | 修改 | Task 1 | 本地启用 Storage 和私有照片 Bucket |
| `src/community/communityRepository.js` | 新建 | Task 2 | 评论 RPC、照片 Storage/元数据、签名 URL 和错误映射 |
| `src/community/photoProcessor.js` | 新建 | Task 2 | 图片校验、缩放、WebP 重编码与 EXIF/GPS 移除 |
| `src/main.js` | 修改 | Task 2 | 复用共享 clientProvider 并注入 Community Repository |
| `tests/community-repository.test.js` | 新建 | Task 2 | Repository 契约、错误、补偿和账号边界 |
| `tests/photo-processor.test.js` | 新建 | Task 2 | 文件、尺寸、编码和输出边界 |
| `src/community/commentNickname.js` | 新建 | Task 5 | 邮箱脱敏默认昵称和按账号偏好存取 |
| `src/data/store.js`、`src/sync/snapshot.js` | 修改 | Task 5 | Schema 5 与 v4 显式业务迁移 |
| `src/sync/cloudSnapshotRepository.js`、`src/sync/syncCoordinator.js` | 修改 | Task 5 | 旧云端快照识别、安全自动 CAS 与人工降级 |
| `src/components/CommentWall.vue`、`CommunityHub.vue`、`AccountCenter.vue` | 修改 | Task 5 | 紧凑昵称编辑与升级提示 |
| `tests/comment-nickname.test.js`、同步相关测试 | 新建/修改 | Task 5 | 昵称偏好与 Schema 升级回归测试 |
| `src/components/CommunityHub.vue` | 新建 | Task 3 | 双墙布局、账号状态和登录事件 |
| `src/components/CommentWall.vue` | 新建 | Task 3 | 公开评论浏览、发布、刷新和本人删除 |
| `src/components/FamilyPhotoWall.vue` | 新建 | Task 3 | 私有照片选择、预览、上传、展示和删除 |
| `src/components/Dashboard.vue` | 修改 | Task 3 | 用 CommunityHub 替换 AIExperience 挂载但保留 AI 文件 |
| `src/App.vue` | 修改 | Task 3 | 接入 account-request 并复用账号中心 |
| `.env.example` | 修改 | Task 4 | 增加社区功能开关示例 |
| `docs/deployment/community-walls.md` | 新建 | Task 4 | migration、Storage、验证、回滚和故障处理 |
| `docs/design-docs/platform/community-walls/reviews/` | 新建 | Task 1～4 | 每个任务的代码审查报告 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `list_community_comments(limit)` | 新增 RPC | CommunityRepository | Task 1、2 |
| `create_community_comment(nickname, content)` | 新增 RPC | CommunityRepository | Task 1、2 |
| `delete_community_comment(id)` | 新增 RPC | CommunityRepository | Task 1、2 |
| `list_own_family_photos(limit)` | 新增 RPC | CommunityRepository | Task 1、2 |
| `reserve/finalize/cancel_own_family_photo(...)` | 新增 RPC | CommunityRepository | Task 1、2 |
| `delete_own_family_photo(id)` | 新增 RPC | CommunityRepository | Task 1、2 |
| `CommunityRepository` | 新增注入接口 | CommunityHub 子组件 | Task 2、3 |
| `Dashboard.account-request` | 新增透传事件 | App.vue | Task 3 |
| `AIExperience` Dashboard 挂载 | 停止渲染，代码保留 | Dashboard.vue | Task 3 |
| Snapshot Schema 5 | 版本升级 | Store / Cloud Repository / Coordinator | Task 5 |
| Comment nickname preference | 新增本地接口 | CommentWall | Task 5 |

### 构建系统变更

- 不新增 npm 运行时依赖，不修改 Vite 构建方式。
- `supabase/config.toml` 本地启用 Storage；Realtime 继续关闭。
- EdgeOne 继续从 `main` 自动构建 Vite；发布前必须先完成 Supabase migration。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | 评论公开但没有管理员审核后台 | Task 1、3、4 | 限制长度和登录发布；紧急时撤销创建 RPC grant |
| 2 | Storage 与业务元数据无法强事务 | Task 1、2、4 | pending/ready 状态、对象存在性校验、1 小时 TTL 与列表读取自动恢复 |
| 3 | 儿童照片包含 EXIF/GPS 和人脸 | Task 2、3 | 浏览器重新编码，私有 Bucket，禁止公开 URL和敏感日志 |
| 4 | 账号切换期间异步请求可能迟到 | Task 2、3 | owner ID + generation 校验，退出立即清空照片 |
| 5 | 当前无内容审核、病毒扫描与图片审核 | Task 1～4 | MIME/尺寸/路径双重校验；高级审核明确为非目标 |
| 6 | Supabase Storage 本地/生产配置可能不同 | Task 1、4 | migration、config 和部署文档同时交付，生产做双账号隔离冒烟 |
| 7 | 工作区有两份无关 Vibe Coding 文档改动 | 全部 | 不读取为需求、不覆盖、不暂存、不提交 |
| 8 | Schema 4 之后新增规范化规则导致旧云端快照被拒绝 | Task 5 | 升级为 Schema 5；等价内容自动 CAS，分歧内容人工确认 |
| 9 | 默认昵称泄露完整邮箱或跨账号串用 | Task 5 | 邮箱脱敏、20 字限制、userId 分区存储、异常降级 |

## 任务列表

### 任务 1: [x] 建立评论与私有照片的服务端安全边界
- 文件: `supabase/migrations/202610100003_community_walls.sql`、`supabase/tests/community_walls.sql`（新建），`supabase/config.toml`（修改）
- 依赖: 无
- spec 映射: 3.1、3.2、4.1、4.2.2、4.2.3、4.2.4、4.2.5、8.4
- 说明: 建立隐藏评论身份字段的 RPC、本人照片元数据 RPC、强制 RLS、私有 Bucket 和用户目录 Storage Policy。
- context:
  - `supabase/migrations/202607310001_account_sync.sql` — 现有强制 RLS、授权和函数规范
  - `supabase/migrations/202608190002_ai_usage_quota.sql` — advisory lock 与 RPC 风格
  - `supabase/tests/account_sync.sql` — 跨用户 pgTAP 身份模拟
  - `src/community/communityRepository.js` — Task 2 下游消费者，依赖本任务 RPC 契约
- 验收标准:
  - [x] 保留数据执行 `supabase migration up --local`，且 `supabase test db` 返回 0（未执行破坏性 `db reset`）
  - [x] anon/authenticated 无法直接读取评论表，RPC 结果不包含 user_id/email
  - [x] 只有登录用户可创建评论且仅作者可删除
  - [x] 照片元数据只允许本人 RPC 访问，每用户第 25 张被拒绝
  - [x] Bucket 为 private、仅 WebP、5 MiB，跨用户 Storage SELECT/INSERT/DELETE 均失败
  - [x] Code Review PASS
- 子任务:
  - [x] 1.1: 创建评论/照片表、约束和索引
  - [x] 1.2: 实现公开评论与本人照片 RPC
  - [x] 1.3: 创建私有 Bucket 和 storage.objects Policy
  - [x] 1.4: 增加 pgTAP 权限、边界和跨用户测试

### 任务 2: [x] 实现 Community Repository 与安全图片处理
- 文件: `src/community/communityRepository.js`、`src/community/photoProcessor.js`、`tests/community-repository.test.js`、`tests/photo-processor.test.js`（新建），`src/main.js`（修改）
- 依赖: 无（接口契约遵循 Task 1，代码可并行）
- spec 映射: 3.1、3.2、4.1、4.2.1、4.2.2、4.2.4、4.2.5、4.3
- 说明: 以可测试适配器封装评论 RPC、照片元数据、私有 Storage、批量签名 URL、补偿逻辑和稳定错误；实现无依赖图片重编码。
- context:
  - `src/main.js` — 组合根和唯一 clientProvider
  - `src/ai/aiAssistantClient.js` — 稳定错误、deadline、单飞和依赖注入风格
  - `src/account/supabaseClient.js` — Supabase client 生命周期和 Session 行为
  - `supabase/migrations/202610100003_community_walls.sql` — Task 1 RPC 与 Storage 契约
  - `src/components/CommentWall.vue`、`FamilyPhotoWall.vue` — Task 3 下游调用方
- 验收标准:
  - [x] 评论 DTO 不含 userId/email，文本和昵称 Unicode 边界测试通过
  - [x] 未登录照片请求在网络前拒绝，签名 URL 仅为短时私有地址
  - [x] 上传使用随机本人目录、`upsert=false`，明确失败取消预留，不确定结果交由服务端列表恢复
  - [x] 图片处理拒绝非法 MIME/超 10 MiB，输出长边 ≤1920、WebP ≤5 MiB
  - [x] `node --test tests/community-repository.test.js tests/photo-processor.test.js` 返回 0
  - [x] `npm run build` 返回 0
  - [x] Code Review PASS
- 子任务:
  - [x] 2.1: 定义 Repository DTO、错误码和输入校验
  - [x] 2.2: 实现评论与照片 RPC/Storage 适配
  - [x] 2.3: 实现图片缩放、重编码和元数据移除
  - [x] 2.4: 在组合根注入 Repository 并补充单元测试

### 任务 3: [x] 实现双墙 UI 并替换首页 AI 挂载
- 文件: `src/components/CommunityHub.vue`、`src/components/CommentWall.vue`、`src/components/FamilyPhotoWall.vue`（新建），`src/components/Dashboard.vue`、`src/App.vue`（修改）
- 依赖: Task 1、Task 2
- spec 映射: 2、2.1、3.1、3.2、4.1、4.2.1、4.2.2、4.2.4、4.2.5、4.3、4.4
- 说明: 建立公开评论和账号私有照片双栏体验，复用账号中心登录路径，替换 Dashboard AI 挂载但不删除 AI 代码。
- context:
  - `src/components/Dashboard.vue` — AI 唯一首页挂载与事件上游
  - `src/App.vue:openAccountCenter()` — 登录 CTA 下游和焦点恢复
  - `src/account/accountSyncFacade.js:accountState` — 只读账号状态
  - `src/community/communityRepository.js` — Task 2 数据接口
  - `src/composables/useDialogFocus.js` — 删除确认和焦点闭环参考
- 验收标准:
  - [x] 游客可浏览评论，发布按钮引导登录；登录用户可发布并仅删除自己的评论
  - [x] 照片墙未登录不发请求，登录后只展示本人照片，退出/切账号立即清空
  - [x] 上传预览、说明、进度、失败重试和删除确认均可键盘操作
  - [x] Dashboard 不再渲染 AIExperience，AI 文件、main 注入和 Edge Function 均仍存在
  - [x] 评论和照片任一失败不影响另一模块及 Dashboard 其他功能
  - [x] 1200 × 800 与 390 × 844 无横向溢出，焦点和 aria-live 正常
  - [x] `npm test` 与 `npm run build` 返回 0
  - [x] Code Review PASS
- 子任务:
  - [x] 3.1: 实现 CommunityHub 与账号状态适配
  - [x] 3.2: 实现评论建议墙
  - [x] 3.3: 实现私有亲子照片墙
  - [x] 3.4: 替换 Dashboard 挂载并接通账号中心
  - [x] 3.5: 执行桌面/手机、键盘和账号切换浏览器验收

### 任务 4: [~] 完成部署、回滚与生产隔离验证
- 文件: `.env.example`（修改）、`docs/deployment/community-walls.md`、`docs/design-docs/platform/community-walls/reviews/task4-review.md`（新建）
- 依赖: Task 1、Task 2、Task 3
- spec 映射: 5、6、7、8、9、10
- 说明: 固化基础设施先行的发布顺序、生产匿名/双账号验证、孤儿对象处理和无损回滚方式。
- context:
  - `spec.md:8` — 配置、发布、回滚与故障处理
  - `docs/deployment/account-sync.md` — 现有 Supabase 发布文档风格
  - `supabase/migrations/202610100003_community_walls.sql` — 生产 migration
  - `src/components/CommunityHub.vue` — 生产浏览器验证入口
- 验收标准:
  - [x] 部署文档覆盖 migration、Bucket、Policy、前端、验证、止写和回滚顺序
  - [x] 文档不包含真实 JWT、邮箱、照片、API Key、数据库密码或签名 URL
  - [x] `npm test`、`npm run build`、Supabase pgTAP 与 lint 返回 0
  - [x] 生产匿名评论可读、登录入口正常且移动端无横向溢出
  - [ ] 生产登录评论可写且跨账号删除失败
  - [ ] 生产账号 A/B 照片互不可见、退出后旧签名图片不再由页面引用
  - [x] 回滚前端后数据库和 Storage 数据仍保留
  - [x] Code Review PASS
- 子任务:
  - [x] 4.1: 增加公开配置和部署文档
  - [x] 4.2: 执行全量质量门禁与安全扫描
  - [~] 4.3: 部署 Supabase migration/Storage 并执行生产双账号冒烟
  - [x] 4.4: 发布 EdgeOne 前端并验证回滚路径

### 任务 5: [~] 修复云快照升级并优化评论默认昵称
- 文件: `src/data/store.js`、`src/sync/snapshot.js`、`src/sync/cloudSnapshotRepository.js`、`src/sync/syncCoordinator.js`、`src/components/AccountCenter.vue`、`src/components/CommentWall.vue`、`src/components/CommunityHub.vue`、`src/community/commentNickname.js`、`tests/comment-nickname.test.js`、`tests/account-foundations.test.js`、`tests/cloud-adapters.test.js`、`tests/sync-coordinator.test.js`、相关版本断言测试
- 依赖: Task 2、Task 3
- spec 映射: 1.3、3.1、3.2、4.2.1、4.2.4、4.2.5、7.1、8.4
- 说明: 以 Schema 5 显式承接旧 v4 官方链接迁移；安全等价时自动升级云端，不等价时保留人工选择。评论默认使用邮箱脱敏昵称，编辑入口收起并按账号记忆。
- 验收标准:
  - [x] 旧 v4 合法云端快照可读取并迁移，不再触发“当前 Schema 的云端快照未规范化”
  - [x] 自动 CAS 仅在本机与规范化云端语义一致且 revision/hash 匹配时发生
  - [x] 本机与云端内容不同、CAS 竞争或当前 v5 非规范化时仍 fail-safe
  - [x] 评论默认昵称不暴露完整邮箱、不超过 20 字，修改后按账号复用
  - [x] 昵称输入默认收起，用户可修改或恢复邮箱脱敏默认值
  - [x] 全量测试、构建、格式和 Code Review PASS
  - [x] 推送 main 且 EdgeOne 新资源包生效
  - [ ] 生产登录账号确认同步恢复且评论发布无需重复输入昵称
- 子任务:
  - [x] 5.1: 升级 Snapshot Schema 5 并实现安全云端迁移
  - [x] 5.2: 实现默认脱敏昵称和本地账号偏好
  - [x] 5.3: 调整评论墙与账号升级提示
  - [x] 5.4: 补充迁移、昵称和失败路径测试
  - [~] 5.5: 评审、发布并执行生产回归

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 1～3 | Task 1～4 | 背景、目标、公开评论、私有照片和非功能约束完整覆盖 |
| 4.1 | Task 1～3 | 落实 UI、Repository、PostgreSQL RPC 与 Storage 单向架构 |
| 4.2.1 | Task 2、3 | Repository、图片处理和三个 Vue 组件职责 |
| 4.2.2 | Task 1、2、3 | RPC、Repository DTO、错误码和组件事件 |
| 4.2.3 | Task 1 | 评论、照片元数据、索引、Bucket 和路径约束 |
| 4.2.4 | Task 1～3 | advisory lock、单飞、generation 和补偿一致性 |
| 4.2.5 | Task 1～3 | 输入、权限、网络、Storage 和补偿错误处理 |
| 4.3 | Task 1～3 | 评论、签名 URL、图片处理、上传与删除核心路径 |
| 4.4～6 | Task 4 | 取舍、风险、官方 Storage/RLS 实践与对比 |
| 7 | Task 1～4 | pgTAP、Repository、图片处理、浏览器和性能边界 |
| 8 | Task 1、2、4 | 日志、配置、运维、发布、回滚和孤儿处理 |
| 9～10 | Task 4 | Changelog 与官方参考资料交付 |
