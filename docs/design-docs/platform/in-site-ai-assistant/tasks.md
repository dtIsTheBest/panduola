# 实施任务清单

> 由 spec.md 生成
>
> 任务总数: 6
> 核心原则: 先建后迁后删——先建立配额与网关，再接入前端，最后删除旧调用并完成交付

## 依赖关系总览

```text
Task 1（数据库配额）
  ↓
Task 2（Edge Function 网关）
  ↓
Task 3（前端 AI 客户端与依赖装配）
  ↓
Task 4（站内 AI UI 与首页顺序）
  ↓
Task 5（部署文档与全链路验证）
  ↓
Task 6（生产 AI 延迟修复）
```

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `supabase/migrations/202608190002_ai_usage_quota.sql` | 新建 | Task 1 | AI 请求额度表和原子预占 RPC |
| `supabase/tests/ai_usage_quota.sql` | 新建 | Task 1 | 权限、边界、幂等与并发数据库测试 |
| `supabase/functions/_shared/aiAssistantCore.js` | 新建 | Task 2 | 请求校验、身份哈希和响应工具 |
| `supabase/functions/_shared/arkClient.js` | 新建 | Task 2 | 火山方舟适配器 |
| `supabase/functions/ai-growth-assistant/index.ts` | 新建 | Task 2 | Edge Function 编排入口 |
| `supabase/config.toml` | 修改 | Task 2 | 启用 Edge runtime 和匿名入口策略 |
| `tests/ai-function-core.test.js` | 新建 | Task 2 | Edge Function 纯逻辑单元测试 |
| `src/ai/config.js` | 新建 | Task 3 | AI 前端公开配置解析 |
| `src/ai/aiAssistantClient.js` | 新建 | Task 3 | 站内 AI 客户端与错误映射 |
| `src/main.js` | 修改 | Task 3 | 共享 Supabase Provider 并注入 AI 客户端 |
| `tests/ai-assistant-client.test.js` | 新建 | Task 3 | 前端 AI 客户端测试 |
| `src/components/AISearch.vue` | 修改 | Task 4 | 删除 iframe/用户 Key，改为站内问答 UI |
| `src/components/Dashboard.vue` | 修改 | Task 4 | 将 AI 助手移动到内容导航之后 |
| `.env.example` | 新建 | Task 5 | Web 公开配置示例 |
| `docs/deployment/in-site-ai-assistant.md` | 新建 | Task 5 | 方舟、Supabase 与 EdgeOne 部署步骤 |
| `docs/潘多拉-Vibe-Coding-全链路项目分享.md` | 修改 | Task 5 | 更新 AI 中间件和正式能力说明 |
| `supabase/functions/_shared/arkClient.js` | 修改 | Task 6 | 普通问答显式关闭深度思考 |
| `supabase/functions/ai-growth-assistant/index.ts` | 修改 | Task 6 | 注入模型能力配置 |
| `tests/ai-function-core.test.js` | 修改 | Task 6 | 锁定方舟请求参数契约 |
| `docs/troubleshooting-ai-timeout-20260820.md` | 新建 | Task 6 | 生产超时证据、根因与验证记录 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `reserve_ai_request_quota(...)` | 新增 RPC | Edge Function | Task 1, 2 |
| `POST /functions/v1/ai-growth-assistant` | 新增 HTTP API | `AiAssistantClient` | Task 2, 3 |
| `AiAssistantClient.ask()` | 新增前端接口 | `AISearch.vue` | Task 3, 4 |
| `AISearch` 内部服务商设置 | 删除内部实现 | Dashboard 用户交互 | Task 4 |

### 构建系统变更

- `supabase/config.toml`：启用 Edge Function 本地运行并允许函数自行验证可选 Session（Task 2）。
- EdgeOne 新增 `VITE_AI_ENABLED` 与 `VITE_AI_REQUEST_TIMEOUT_MS`（Task 5，仅文档与外部配置）。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | 游客身份可清理或伪造 | Task 2 | 仅作为轻量防滥用；登录账号才是强额度边界 |
| 2 | 模型超时结果不确定 | Task 1, 2 | 配额预占后不退款、不自动重试，优先防止重复费用 |
| 3 | 本地环境可能没有 Deno/Supabase CLI | Task 2, 5 | 抽取 Node 可测纯逻辑；CLI 验证缺失时明确标注 |
| 4 | Tauri CSP 尚未按生产 Supabase origin 生成 | Task 5 | Web 先交付；桌面生产验证保留为发布阻塞项 |
| 5 | 火山方舟模型 ID 会演进 | Task 2, 5 | 仅通过服务端 `ARK_MODEL_ID` 配置，不写入前端 |

## 任务列表

### 任务 1: [x] 建立 AI 每日额度与幂等数据库契约
- 文件: `supabase/migrations/202608190002_ai_usage_quota.sql`（新建）、`supabase/tests/ai_usage_quota.sql`（新建）
- 依赖: 无
- spec 映射: 3.1、3.2、4.2.3、4.2.4、7.2、8.4
- 说明: 建立只保存哈希主体和请求 ID 的额度表，通过安全 RPC 在短事务内原子预占额度。
- context:
  - `supabase/migrations/202607310001_account_sync.sql` — 现有 RLS、权限和函数风格
  - `supabase/tests/account_sync.sql` — pgTAP 测试模式
  - `spec.md:4.2.3` — 数据模型和权限契约
- 验收标准:
  - [x] migration 可重复应用到空测试库
  - [x] `anon`/`authenticated` 无法直接读写表或执行 RPC
  - [x] limit 边界、重复 requestId、跨主体冲突和并发不超限测试通过
  - [x] SQL 不包含问题、回答、邮箱、IP 或 userId 字段
  - [x] Code Review PASS
- 子任务:
  - [x] 1.1: 创建额度表、约束和索引
  - [x] 1.2: 实现 advisory lock + requestId 幂等 RPC
  - [x] 1.3: 补充 pgTAP 权限、边界和并发测试

### 任务 2: [x] 实现 Supabase Edge Function AI 网关
- 文件: `supabase/functions/_shared/aiAssistantCore.js`（新建）、`supabase/functions/_shared/arkClient.js`（新建）、`supabase/functions/ai-growth-assistant/index.ts`（新建）、`supabase/config.toml`（修改）、`tests/ai-function-core.test.js`（新建）
- 依赖: Task 1
- spec 映射: 3.1、3.2、4.2.1、4.2.2、4.2.5、4.3、6、7.1、7.2、8
- 说明: 建立可选认证、游客匿名标识、配额预占、方舟调用、CORS 和脱敏日志的服务端网关。
- context:
  - `src/account/supabaseClient.js:createSupabaseClientProvider()` — 当前 Supabase 客户端与 Session 行为
  - `supabase/config.toml` — 本地 Supabase 配置
  - `reserve_ai_request_quota(...)` — Task 1 新增配额接口
  - 火山方舟 `/api/v3/chat/completions` — 下游模型接口
- 验收标准:
  - [x] Node 单测覆盖正常、非法输入、Origin、身份哈希、上游错误和响应裁剪
  - [x] 代码只接受字段白名单且不记录 question/answer/token/邮箱/IP
  - [x] 所有网络调用有 deadline，模型调用不自动重试
  - [x] 配额拒绝时不调用火山方舟
  - [x] 缺失 Secret 时返回 `AI_NOT_CONFIGURED`
  - [x] Code Review PASS
- 子任务:
  - [x] 2.1: 实现纯请求/响应与主体哈希工具
  - [x] 2.2: 实现火山方舟适配器
  - [x] 2.3: 实现 Edge Function 编排、CORS、认证和配额调用
  - [x] 2.4: 配置本地 Edge runtime 并补充单测

### 任务 3: [x] 建立前端 AI 客户端与共享依赖装配
- 文件: `src/ai/config.js`（新建）、`src/ai/aiAssistantClient.js`（新建）、`src/main.js`（修改）、`tests/ai-assistant-client.test.js`（新建）
- 依赖: Task 2
- spec 映射: 3.1、3.2、4.2.1、4.2.2、4.2.5、4.3、7.1、8.2
- 说明: 通过应用层客户端隐藏 Session 和 HTTP 细节，并与账号同步共享 Supabase Client Provider。
- context:
  - `src/main.js:createSyncServices()` — 现有组合根和 provider 生命周期
  - `src/account/supabaseClient.js` — 可复用客户端 Provider
  - `src/account/errors.js` — 项目错误对象风格
  - `POST /functions/v1/ai-growth-assistant` — Task 2 新增接口
- 验收标准:
  - [x] AI client 单测覆盖游客、登录、正常、400/401/409/429/5xx、超时和取消
  - [x] 请求体只包含 question/requestId/guestId
  - [x] Session token 不暴露给 Vue 组件
  - [x] AI 关闭或配置缺失时不创建远程请求
  - [x] `npm test` 与 `npm run build` 通过
  - [x] Code Review PASS
- 子任务:
  - [x] 3.1: 实现公开 AI 配置解析
  - [x] 3.2: 实现站内客户端、guestId 和错误映射
  - [x] 3.3: 提升共享 Provider 并注入 AI 客户端
  - [x] 3.4: 补充客户端自动测试

### 任务 4: [x] 改造站内 AI 交互并调整首页顺序
- 文件: `src/components/AISearch.vue`（修改）、`src/components/Dashboard.vue`（修改）
- 依赖: Task 3
- spec 映射: 2、3.1、3.2、4.2.1、4.2.5、4.3、7.2
- 说明: 删除豆包 iframe和用户 Key 设置，接入站内客户端，并将 AI 助手放到内容 Tab 之后。
- context:
  - `src/components/AISearch.vue` — 当前 UI、iframe、OpenAI 直连和本机历史
  - `src/components/Dashboard.vue` — 首页内容排序和 Tab 布局
  - `AiAssistantClient.ask()` — Task 3 新增接口
- 验收标准:
  - [x] 页面中不再存在豆包 iframe、OpenAI Key 输入或服务商选择
  - [x] AI 助手 DOM 顺序位于内容 Tab/tabpanel 之后
  - [x] 加载、回答、错误、额度和免责声明可被键盘及 aria-live 感知
  - [x] 375px 与桌面端无横向溢出
  - [x] `npm test` 与 `npm run build` 通过
  - [x] Code Review PASS
- 子任务:
  - [x] 4.1: 将 AISearch 收敛为纯站内问答 UI
  - [x] 4.2: 增加额度、错误和不可用状态
  - [x] 4.3: 调整 Dashboard 内容顺序
  - [x] 4.4: 完成键盘与响应式验证

### 任务 5: [x] 完成部署文档与全链路交付验证
- 文件: `.env.example`（新建）、`docs/deployment/in-site-ai-assistant.md`（新建）、`docs/潘多拉-Vibe-Coding-全链路项目分享.md`（修改）
- 依赖: Task 4
- spec 映射: 3.2、4.4、5、6、7、8、9、10
- 说明: 固化方舟、Supabase Secrets、数据库、函数、EdgeOne 环境变量、验证和回滚顺序。
- context:
  - `spec.md:8` — 可观测性、配置和发布顺序
  - `package.json`、`vite.config.js` — Web 构建入口
  - `src-tauri/tauri.conf.json` — 桌面端 CSP 发布阻塞项
  - `docs/潘多拉-Vibe-Coding-全链路项目分享.md` — 项目对外介绍
- 验收标准:
  - [x] 文档不包含真实 API Key、JWT、数据库密码或 SMTP 密码
  - [x] 文档覆盖 migration、Secrets、函数、前端、验证和回滚顺序
  - [x] `npm test`、`npm run build`、Rust 检查和格式检查通过
  - [x] 浏览器完成入口顺序、错误、输入边界与移动端冒烟；真实游客、登录、额度链路因尚未配置方舟凭据而明确记录为部署阻塞
  - [x] Code Review PASS
- 子任务:
  - [x] 5.1: 增加公开环境变量示例
  - [x] 5.2: 编写部署、验证、监控和回滚文档
  - [x] 5.3: 更新项目介绍中的 AI 平台说明
  - [x] 5.4: 执行全量质量门禁和浏览器验收

### 任务 6: [x] 修复生产 AI 正常问题超时
- 文件: `supabase/functions/_shared/arkClient.js`（修改）、`supabase/functions/ai-growth-assistant/index.ts`（修改）、`tests/ai-function-core.test.js`（修改）、`docs/troubleshooting-ai-timeout-20260820.md`（新建）
- 依赖: Task 5
- spec 映射: 3.2、4.2.5、4.3、7.1、7.2、8.4
- 说明: 根据生产 HTTP 504 与同问题耗时证据，以显式模型能力配置关闭深度思考，并用 20 秒 Provider deadline 与 300 tokens 输出上限完成生产 A/B。
- context:
  - `docs/troubleshooting-ai-timeout-20260820.md` — 生产证据链与根因
  - `supabase/functions/_shared/arkClient.js` — 方舟 Chat 请求与 deadline
  - 火山方舟 Chat API `thinking.type=disabled` — 官方低延迟参数
- 验收标准:
  - [x] 仅在显式配置时发送 `thinking: { type: "disabled" }`，未知模式降级为 `AI_NOT_CONFIGURED`
  - [x] 单测覆盖配置开启、默认省略和未知值，且不泄露 API Key
  - [x] `npm test` 与 `npm run build` 通过
  - [x] 生产同问题 3 次直调和浏览器问答在 20 秒 Provider deadline 下成功
  - [x] Code Review PASS
- 子任务:
  - [x] 6.1: 增加显式方舟思考模式配置
  - [x] 6.2: 补充请求契约测试
  - [x] 6.3: 完成评审、部署和生产复测

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 1～3 | Task 1～6 | 问题、目标与需求由完整交付覆盖 |
| 4.1 | Task 1～4 | 薄前端、服务端网关和配额链路 |
| 4.2.1 | Task 2～4 | 网关、适配器、客户端和 UI 模块 |
| 4.2.2 | Task 1～3 | RPC、HTTP 和前端接口 |
| 4.2.3 | Task 1 | 配额数据模型 |
| 4.2.4 | Task 1～3 | 并发、幂等和取消 |
| 4.2.5 | Task 2～4、6 | 跨层错误处理与生产超时修复 |
| 4.3 | Task 1～4、6 | 核心调用路径与模型低延迟参数 |
| 4.4～6 | Task 5 | 取舍、备选与业界调研交付说明 |
| 7 | Task 1～6 | 单元、数据库、集成和浏览器测试 |
| 8 | Task 2、5、6 | 日志、指标、配置和运维 |
| 9～10 | Task 5 | 变更记录和参考资料 |
