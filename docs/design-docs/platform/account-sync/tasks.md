# 实施任务清单

> 由 spec.md 生成  
> 任务总数: 9  
> 核心原则: 先建后迁后集成——先建立跨切面契约和本地数据空间，再接入桌面与云端基础设施，最后完成同步编排、账号 UI 和端到端验证

## 依赖关系总览

```text
Task 1（跨切面基础）
  ├──→ Task 2（账号本地数据空间与 Store 边界）
  │      └──→ Task 3（Tauri 原子存储与安全凭据）
  ├──→ Task 4（Supabase 数据库、RLS 与 CAS）
  └──→ Task 5（Supabase 认证与快照适配器）← Task 3、Task 4
             │
Task 2 ──────┼──→ Task 6（同步协调与跨标签互斥）
Task 5 ──────┘
                    ↓
              Task 7（应用账号门面与启动编排）← Task 3
                    ↓
              Task 8（账号、同步、冲突与恢复 UI）
                    ↓
              Task 9（部署配置与端到端集成验证）
```

## 变更影响概览

### 文件变更清单

| 文件 | 操作 | 涉及任务 | 说明 |
|------|------|---------|------|
| `src/account/config.js` | 新建 | Task 1, 5 | 运行时配置、同步常量、请求超时和配置校验 |
| `src/account/errors.js` | 新建 | Task 1 | AppError 与统一错误码 |
| `src/sync/snapshot.js` | 新建 | Task 1 | 快照校验、大小限制、确定性序列化与哈希 |
| `src/observability/diagnostics.js` | 新建 | Task 1 | 脱敏日志、会话指标和诊断报告 |
| `src/data/dataSpaceRepository.js` | 新建 | Task 2 | Web/Tauri 账号数据空间、恢复副本与旧数据迁移边界 |
| `src/data/store.js` | 修改 | Task 2, 7 | 接入数据空间并新增快照应用、切换和本地提交订阅 |
| `src/account/tauriSessionStorage.js` | 新建 | Task 3 | Supabase Session 的 Stronghold 存储适配 |
| `src-tauri/src/lib.rs` | 修改 | Task 3 | 原子数据空间读写、恢复副本与 Stronghold 启动支持 |
| `src-tauri/Cargo.toml` | 修改 | Task 3 | Stronghold、系统凭据与原子文件依赖 |
| `src-tauri/Cargo.lock` | 修改 | Task 3 | Rust 依赖锁定 |
| `src-tauri/capabilities/default.json` | 修改 | Task 3 | 最小 Stronghold capability |
| `supabase/config.toml` | 新建 | Task 4 | 本地 Supabase 测试配置 |
| `supabase/migrations/202607310001_account_sync.sql` | 新建 | Task 4 | 快照表、RLS、权限与 CAS 函数 |
| `supabase/tests/account_sync.sql` | 新建 | Task 4 | RLS、CAS 与跨用户数据库测试 |
| `src/account/supabaseClient.js` | 新建 | Task 5 | 延迟创建且可注入的 Supabase Client |
| `src/account/authAdapter.js` | 新建 | Task 5 | 邮箱 OTP、Session 恢复和认证事件适配 |
| `src/sync/cloudSnapshotRepository.js` | 新建 | Task 5 | 云端快照读取、创建与 CAS 仓库 |
| `package.json` | 修改 | Task 3, 5, 9 | Stronghold、Supabase 依赖和验证脚本 |
| `package-lock.json` | 修改 | Task 3, 5 | JavaScript 依赖锁定 |
| `src/sync/crossTabLock.js` | 新建 | Task 6 | Web Locks 与 localStorage lease 回退 |
| `src/sync/syncCoordinator.js` | 新建 | Task 6 | 状态机、debounce、重试、CAS 和冲突处理 |
| `src/account/accountSyncFacade.js` | 新建 | Task 7 | 登录、退出、迁移、账号切换和同步生命周期门面 |
| `src/main.js` | 修改 | Task 7 | 初始化账号同步依赖并注入应用 |
| `src/App.vue` | 修改 | Task 7, 8 | 使用应用门面启动并挂载账号交互 UI |
| `src/components/AccountCenter.vue` | 新建 | Task 8 | 登录、同步状态、冲突、恢复副本和诊断入口 |
| `src/components/Header.vue` | 修改 | Task 8 | 展示账号入口与同步状态 |
| `src/style.css` | 修改 | Task 8 | 账号与同步状态的全局响应式样式 |
| `vite.config.js` | 修改 | Task 9 | 环境校验和构建配置 |
| `src-tauri/tauri.conf.json` | 修改 | Task 9 | 精确 Supabase CSP 与构建前置命令 |
| `scripts/generate-tauri-config.mjs` | 新建 | Task 9 | 根据环境生成受限 Tauri 连接配置 |
| `.env.example` | 新建 | Task 9 | 可公开前端配置示例 |
| `docs/deployment/account-sync.md` | 新建 | Task 9 | Supabase、OTP、部署、回滚和故障处理说明 |
| `tests/account-foundations.test.js` | 新建 | Task 1 | 跨切面基础单测 |
| `tests/data-spaces.test.js` | 新建 | Task 2 | 数据空间、迁移与恢复单测 |
| `tests/tauri-storage.test.js` | 新建 | Task 3 | Stronghold Session 与 Tauri 数据桥接测试 |
| `tests/cloud-adapters.test.js` | 新建 | Task 5 | 认证和远端仓库适配单测 |
| `tests/sync-coordinator.test.js` | 新建 | Task 6 | 同步状态机与并发单测 |
| `tests/account-facade.test.js` | 新建 | Task 7 | 账号切换与生命周期单测 |
| `tests/account-sync-integration.test.js` | 新建 | Task 9 | 端到端 Mock 集成与回归场景 |
| `tests/system-hardening.test.js` | 修改 | Task 2, 7, 9 | 保持现有 Store 契约并补充回归验证 |

### 受影响接口

| 接口 | 变更类型 | 调用方 | 涉及任务 |
|------|---------|--------|---------|
| `store.init()` | 内部实现变更、签名不变 | `src/App.vue`、测试 | Task 2, 7 |
| `store.getSnapshot()` | 保持兼容 | 导出、同步协调器 | Task 2, 6 |
| `store.activateDataSpace()` | 新增 | `accountSyncFacade` | Task 2, 7 |
| `store.applySnapshot()` | 新增 | `syncCoordinator` | Task 2, 6 |
| `store.subscribeLocalCommits()` | 新增 | `syncCoordinator` | Task 2, 6 |
| `dataSpaceRepository.load/save()` | 新增 | `store`、`syncCoordinator` | Task 2, 6 |
| `authAdapter.restoreSession/requestOtp/verifyOtp/signOut/subscribe` | 新增 | `accountSyncFacade` | Task 5, 7 |
| `cloudSnapshotRepository.load/create/compareAndSwap` | 新增 | `syncCoordinator` | Task 5, 6 |
| `syncCoordinator.start/stop/markDirty/syncNow/resolve*` | 新增 | `accountSyncFacade` | Task 6, 7 |
| `accountSyncFacade.initialize/requestLoginCode/verifyLoginCode/logout/syncNow/resolve*` | 新增 | `App.vue`、`AccountCenter.vue` | Task 7, 8 |
| `compare_and_swap_user_snapshot()` | 新增数据库 RPC | `cloudSnapshotRepository` | Task 4, 5 |
| Tauri `read_data_space/save_data_space/save_recovery_copy` | 新增 command | `dataSpaceRepository` | Task 2, 3 |

### 构建系统变更

- `package.json` / `package-lock.json`：加入 `@tauri-apps/plugin-stronghold` 与 `@supabase/supabase-js`，增加数据库和集成验证脚本（Task 3、5、9）。
- `src-tauri/Cargo.toml` / `Cargo.lock`：加入 Stronghold 与系统凭据相关依赖（Task 3）。
- `src-tauri/capabilities/default.json`：仅开放账号 Session 所需 Stronghold 操作（Task 3）。
- `vite.config.js` / `scripts/generate-tauri-config.mjs` / `src-tauri/tauri.conf.json`：生成精确 CSP 并保持缺少云配置时可构建（Task 9）。
- `supabase/`：加入本地数据库配置、版本化 migration 和数据库测试（Task 4）。

## 风险与假设

| # | 描述 | 影响任务 | 假设/处理 |
|---|------|---------|----------|
| 1 | 当前仓库存在已完成视觉改版的未提交修改 | 全部 | 只在明确列出的文件内增量修改，不覆盖或回退现有改动 |
| 2 | 项目使用 JavaScript 而非 TypeScript | Task 1–8 | 使用小模块、JSDoc 和运行时校验表达接口，避免引入全量 TS 迁移 |
| 3 | 本地尚未提供真实 Supabase 项目凭据 | Task 4、9 | 先使用本地 Supabase/Mock 完成自动测试；真实 staging 验证作为有凭据时的发布门禁 |
| 4 | Tauri Stronghold 本身需要安全解锁材料 | Task 3 | 由原生层生成随机设备密钥并存入系统凭据存储；不可用时禁用桌面云同步，不回退明文文件 |
| 5 | 生产 Supabase 项目域名在构建时才确定 | Task 9 | 使用构建脚本从 `VITE_SUPABASE_URL` 生成精确 `connect-src`，缺少配置时不开放外部连接 |
| 6 | Web Locks API 并非所有 WebView/浏览器可用 | Task 6 | 使用带过期时间和 owner token 的 localStorage lease 回退，CAS 仍为最终一致性边界 |
| 7 | 完整快照没有链接级自动合并 | Task 6、8 | 严格实现三种显式处理策略和恢复副本，不引入未经设计的字段级合并 |
| 8 | `localStorage` 的 2 MiB 数据和日志共享浏览器配额 | Task 1、2 | 写入前做字节限制；恢复副本失败时中止覆盖并提供导出，不静默删除 |
| 9 | 开发服务器当前可能保持运行 | 全部 | 不主动终止；构建和测试使用独立进程，必要时复用现有 5173 服务做浏览器验证 |

## 任务列表

### 任务 1: [x] 建立账号同步跨切面基础
- 文件: `src/account/config.js`（新建）、`src/account/errors.js`（新建）、`src/sync/snapshot.js`（新建）、`src/observability/diagnostics.js`（新建）、`tests/account-foundations.test.js`（新建）
- 依赖: 无
- spec 映射: 4.2.2、4.2.3、4.2.5、4.3、7.1、8.1、8.2
- 说明: 定义后续模块共同依赖的配置、错误、已规范化快照的大小/哈希、脱敏日志和会话指标，先固定跨切面契约；业务 Schema 校验仍复用 Store 的既有公开函数。
- context:
  - `src/data/store.js:normalizeData()` — 快照规范化的现有来源
  - `src/data/store.js:validateImportData()` — 严格业务快照校验边界
  - `src/data/store.js:getSnapshot()` — 后续哈希和同步的上游数据
  - `src/App.vue:exportData()` — 必须继续输出纯业务快照的下游
  - `tests/system-hardening.test.js` — 现有 Schema 与失败语义基线
- 验收标准:
  - [x] `npm test` 通过且无现有用例回归
  - [x] `npm run build` 通过且无新 warning
  - [x] 单测验证确定性 hash、数组顺序差异、2 MiB 边界和未来 Schema 拒绝
  - [x] 单测验证日志不输出 OTP、token、完整邮箱或业务 payload
  - [x] Code Review PASS
- 子任务:
  - [x] 1.1: 定义配置读取、默认常量和缺失配置降级
  - [x] 1.2: 定义 AppError、错误码和重试属性
  - [x] 1.3: 实现已规范化快照的字节统计、确定性序列化和 SHA-256
  - [x] 1.4: 实现有界脱敏诊断日志、会话指标和诊断导出
  - [x] 1.5: 补充并执行基础单元测试

### 任务 2: [x] 引入账号本地数据空间并扩展 Store 边界
- 文件: `src/data/dataSpaceRepository.js`（新建）、`src/data/store.js`（修改）、`tests/data-spaces.test.js`（新建）、`tests/system-hardening.test.js`（修改）
- 依赖: Task 1
- spec 映射: 3.1、3.2、4.1、4.2.1、4.2.2、4.2.3、4.2.5、4.3、7.1、7.2
- 说明: 将当前单键/单文件持久化封装为游客与账号数据空间，迁移旧数据，并在不改变现有业务方法签名的前提下增加同步所需 Store 边界。
- context:
  - `src/data/store.js:loadData()/saveData()` — 直接替换为数据空间仓库
  - `src/data/store.js:enqueueMutation()` — 数据空间切换和快照应用必须复用的串行边界
  - `src/data/store.js:replaceData()` — 导入覆盖和提交事件的上游
  - `src/data/store.js:flushVisitPersistence()` — 访问批处理的本地提交来源
  - `src/App.vue:onMounted()/exportData()/importData()` — 现有初始化与导入导出调用方
- 验收标准:
  - [x] `npm test` 与 `npm run build` 通过
  - [x] 既有 Store 公开方法签名和 Promise 失败语义保持不变
  - [x] 测试验证 `panduola_data` 只在新游客空间写入成功后完成迁移
  - [x] 测试验证游客、两个 UUID 用户空间互不覆盖
  - [x] 测试验证恢复副本最多五份且写入失败时不覆盖当前快照
  - [x] 测试验证每次成功本地提交只发出一次提交事件
  - [x] Code Review PASS
- 子任务:
  - [x] 2.1: 实现 ownerKey 校验、本地封装、设备元数据和 Web 存储
  - [x] 2.2: 实现旧键迁移、恢复副本轮转和损坏数据隔离
  - [x] 2.3: Store 接入当前数据空间并保持游客默认行为
  - [x] 2.4: 新增 `activateDataSpace`、`applySnapshot`、`subscribeLocalCommits`
  - [x] 2.5: 覆盖导入、访问批处理、失败回滚和数据空间测试

### 任务 3: [x] 实现 Tauri 原子数据空间与安全 Session 存储
- 文件: `src/account/tauriSessionStorage.js`（新建）、`src/account/errors.js`（修改）、`src/data/dataSpaceRepository.js`（修改）、`src-tauri/src/lib.rs`（修改）、`src-tauri/Cargo.toml`（修改）、`src-tauri/Cargo.lock`（修改）、`src-tauri/capabilities/default.json`（修改）、`package.json`（修改）、`package-lock.json`（修改）
- 计划偏差说明: 为让 Task 2 的跨平台仓储实际消费新 Tauri commands，并为安全凭据失败提供稳定错误码，补充修改 `dataSpaceRepository.js` 与 `errors.js`。
- 依赖: Task 2
- spec 映射: 3.2、4.1、4.2.1、4.2.3、4.2.5、6.2、7.2、8.2
- 说明: 为桌面端实现受校验的数据空间路径、临时文件原子替换、恢复副本和 Stronghold Session 存储；失败时仅禁用云同步。
- context:
  - `src-tauri/src/lib.rs:read_data_file()/save_data_file()` — 需要兼容并迁移的旧命令
  - `src-tauri/src/lib.rs:get_data_path()` — 现有 `~/.panduola/data.json` 路径来源
  - `src/data/dataSpaceRepository.js` — 新 Tauri commands 的上游调用方
  - `src-tauri/capabilities/default.json` — WebView 到原生命令的权限边界
  - `src-tauri/tauri.conf.json` — 后续 CSP 构建的下游配置
- 验收标准:
  - [x] `cargo fmt --check`、`cargo check` 和 Rust 测试通过
  - [x] `npm test` 与 `npm run build` 通过
  - [x] Rust 测试验证非法 ownerKey 不能生成任意路径
  - [x] Rust 测试验证写入使用同目录临时文件和原子替换
  - [x] 普通 JSON 数据文件与诊断输出中不存在 access/refresh token
  - [x] Stronghold 或系统凭据不可用时返回明确错误且不删除业务数据
  - [x] Code Review PASS
- 子任务:
  - [x] 3.1: 增加受校验的数据空间、设备和恢复副本 commands
  - [x] 3.2: 实现原子文件写入和旧 `data.json` 兼容迁移
  - [x] 3.3: 增加 Stronghold 与系统凭据引导并限制 capability
  - [x] 3.4: 实现 Supabase 可注入的 Tauri Session storage adapter
  - [x] 3.5: 补充 Rust 与 JavaScript 桥接测试

### 任务 4: [x] 建立 Supabase 快照表、RLS 与 CAS 数据库函数
- 文件: `supabase/config.toml`（新建）、`supabase/migrations/202607310001_account_sync.sql`（新建）、`supabase/tests/account_sync.sql`（新建）
- 依赖: Task 1
- spec 映射: 4.1、4.2.2、4.2.3、4.2.4、4.2.5、6.1、6.2、7.2、8.2、8.3
- 说明: 以版本化 migration 创建每用户一行快照、严格 RLS 和 SECURITY INVOKER CAS 函数，不引入独立服务或管理接口。
- context:
  - `docs/design-docs/platform/account-sync/spec.md:4.2.3` — 表字段和约束来源
  - `docs/design-docs/platform/account-sync/spec.md:4.2.4` — revision CAS 语义
  - `src/sync/snapshot.js` — payload 校验与 hash 的客户端上游
  - `src/sync/cloudSnapshotRepository.js` — Task 5 将消费的 RPC 契约
- 验收标准:
  - [x] `supabase db reset` 可从空库完整应用 migration
  - [x] 数据库测试验证匿名、用户 A、用户 B 的 SELECT/INSERT/UPDATE 隔离
  - [x] 数据库测试验证 authenticated 客户端没有 DELETE 权限
  - [x] 两个相同 expected revision 的并发/顺序 CAS 仅第一个成功
  - [x] RPC 不接收 user_id，且函数为 SECURITY INVOKER
  - [x] Code Review PASS
- 子任务:
  - [x] 4.1: 创建 `user_snapshots` 表、字段约束和外键
  - [x] 4.2: 启用并定义 SELECT、INSERT、UPDATE RLS 策略
  - [x] 4.3: 实现认证上下文内的原子 CAS 函数和执行权限
  - [x] 4.4: 编写 RLS、权限、创建竞态和 revision 测试

### 任务 5: [x] 实现 Supabase 认证与云端快照适配器
- 文件: `src/account/config.js`（修改）、`src/account/supabaseClient.js`（新建）、`src/account/authAdapter.js`（新建）、`src/sync/cloudSnapshotRepository.js`（新建）、`package.json`（修改）、`package-lock.json`（修改）、`tests/cloud-adapters.test.js`（新建）
- 计划偏差说明: Code Review 要求为所有 Supabase 网络调用增加统一 deadline，因此补充修改集中同步配置 `config.js`。
- 依赖: Task 1、Task 3、Task 4
- spec 映射: 3.1、3.2、4.1、4.2.1、4.2.2、4.2.5、4.3、6.2、7.1、7.2
- 说明: 将 Supabase SDK 限制在基础设施层，通过可注入 client 实现 OTP、Session 和远端快照仓库，并映射为应用内部对象与错误。
- context:
  - `src/account/config.js` — Client 创建和禁用状态来源
  - `src/account/tauriSessionStorage.js` — Tauri Session storage 注入点
  - `supabase/migrations/202607310001_account_sync.sql:compare_and_swap_user_snapshot()` — RPC 下游
  - `src/sync/snapshot.js` — 远端 payload 读取后的校验下游
  - `src/account/accountSyncFacade.js` — Task 7 的认证调用方
- 验收标准:
  - [x] `npm test` 与 `npm run build` 通过
  - [x] 配置缺失时不创建 Supabase Client 并返回 `CONFIG_MISSING`
  - [x] OTP 请求使用 email，验证码校验使用六位 token 与 `type: email`
  - [x] 页面可见 AccountSession 不包含原始 token
  - [x] 仓库 API 不接受任意 userId，CAS 冲突映射为 `REVISION_CONFLICT`
  - [x] 远端 payload 未通过大小、Schema 或 hash 校验时不得返回可应用快照
  - [x] Code Review PASS
- 子任务:
  - [x] 5.1: 添加 Supabase SDK 并实现延迟、可注入 Client
  - [x] 5.2: 实现 OTP、Session 恢复、退出和事件订阅适配
  - [x] 5.3: 实现远端快照 load/create/CAS 与错误映射
  - [x] 5.4: 使用 fake client 覆盖认证、权限、冲突和数据损坏测试

### 任务 6: [x] 实现同步状态机、冲突处理与跨标签互斥
- 文件: `src/sync/crossTabLock.js`（新建）、`src/sync/syncCoordinator.js`（新建）、`src/data/dataSpaceRepository.js`（修改）、`src/data/store.js`（修改）、`tests/sync-coordinator.test.js`（新建）
- 计划偏差说明: 为使 dirty、revision、hash 和最近同步时间在重启后仍可恢复，向本地仓库与 Store 补充最小同步元数据读写边界；按用户最新的数据持久化目标，当前 Schema v2 中的成长记录与其他业务数据一并同步。
- 依赖: Task 2、Task 5
- spec 映射: 3.1、3.2、4.1、4.2.1、4.2.2、4.2.4、4.2.5、4.3、7.1、7.2、7.3
- 说明: 实现本地先提交、账号级单飞同步、debounce、退避、revision 决策矩阵、恢复副本和三种显式冲突策略。
- context:
  - `src/data/store.js:subscribeLocalCommits()/applySnapshot()/getSnapshot()` — 本地提交上游与下载应用下游
  - `src/data/dataSpaceRepository.js` — revision 元数据和恢复副本存储
  - `src/sync/cloudSnapshotRepository.js` — 云端 load/create/CAS 下游
  - `src/account/config.js` — debounce、重试和租约常量
  - `src/account/accountSyncFacade.js` — Task 7 的生命周期调用方
- 验收标准:
  - [x] `npm test` 与 `npm run build` 通过
  - [x] fake timers 验证连续 100 次提交不会产生 100 个并发上传
  - [x] 同一账号云请求并发数始终不超过 1
  - [x] 测试覆盖 clean/dirty 与远端相同/前进/缺失的完整决策矩阵
  - [x] 上传期间发生新修改时 dirty 保留并追加同步
  - [x] 冲突策略在恢复副本写入失败时均不得覆盖当前数据
  - [x] Web Locks 缺失时 lease 可在过期后由其他 owner 接管
  - [x] Code Review PASS
- 子任务:
  - [x] 6.1: 实现 Web Locks 与 lease 回退的账号级互斥
  - [x] 6.2: 实现同步状态机、单飞、debounce 和重试生命周期
  - [x] 6.3: 实现远端读取、幂等 hash、create 与 CAS 决策
  - [x] 6.4: 实现首次迁移门闩和三种冲突解决策略
  - [x] 6.5: 覆盖离线、崩溃恢复、竞态和 stale generation 测试

### 任务 7: [x] 接入应用账号门面与启动/切换生命周期
- 文件: `src/account/accountSyncFacade.js`（新建）、`src/data/store.js`（修改）、`src/data/dataSpaceRepository.js`（修改）、`src/main.js`（修改）、`src/App.vue`（修改）、`src-tauri/src/lib.rs`（修改）、`tests/account-facade.test.js`（新建）、`tests/system-hardening.test.js`（修改）
- 计划偏差说明: 为保证首次账号空间初始化在 Web 跨标签和 Tauri 多实例下均不覆盖已存数据，补充本地仓库 `createIfAbsent` 与桌面端原子新建 command。
- 依赖: Task 3、Task 6
- spec 映射: 3.1、3.2、4.1、4.2.1、4.2.2、4.2.4、4.3、7.1、7.2
- 说明: 用单一应用门面编排游客启动、Session 恢复、登录、首次迁移、退出和账号 generation，并把 Store 成功提交连接到同步协调器。
- context:
  - `src/main.js:createApp()` — 应用依赖初始化入口
  - `src/App.vue:onMounted()` — 现有 `store.init()` 调用方
  - `src/data/store.js:enqueueMutation()` — 账号切换屏障
  - `src/account/authAdapter.js` — 登录和 Session 事件上游
  - `src/sync/syncCoordinator.js:start()/stop()/resolve*()` — 同步生命周期下游
  - `src/components/AccountCenter.vue` — Task 8 的 UI 调用方
- 验收标准:
  - [x] `npm test` 与 `npm run build` 通过
  - [x] 无配置时启动路径与当前游客模式行为一致
  - [x] Session 恢复失败或离线时不阻塞本地首屏
  - [x] 登录失败保持原数据空间，登录成功后才切换
  - [x] 退出登录先完成本地持久化、停止旧监听并切回游客空间
  - [x] 旧 generation 的认证或同步响应不能修改当前账号状态
  - [x] 导入成功后登录账号进入 dirty，导出仍只含业务 Snapshot
  - [x] Code Review PASS
- 子任务:
  - [x] 7.1: 建立响应式账号门面和依赖装配
  - [x] 7.2: 实现初始化、Session 恢复与账号空间选择
  - [x] 7.3: 实现 OTP 登录、首次迁移、退出和 generation 屏障
  - [x] 7.4: 将 Store 提交、导入和应用生命周期接入同步
  - [x] 7.5: 补充账号切换和现有功能回归测试

### 任务 8: [x] 增加账号、同步、冲突与恢复交互
- 文件: `src/components/AccountCenter.vue`（新建）、`src/components/Header.vue`（修改）、`src/App.vue`（修改）、`src/account/accountSyncFacade.js`（修改）
- 计划偏差说明: 恢复副本和诊断导出仍通过应用门面暴露最小接口，避免 UI 直接依赖 Store；账号样式收口在 `AccountCenter.vue` 与 `Header.vue` 的 scoped CSS，未扩大全局样式影响面。
- 依赖: Task 7
- spec 映射: 3.1、3.2、4.2.1、4.2.2、4.2.5、4.3、7.2、8.1、8.3
- 说明: 在现有清新亲子视觉体系中增加紧凑账号入口、OTP 登录、同步状态、首次迁移、冲突解决、恢复副本和诊断导出，不改变导航与业务操作。
- context:
  - `src/components/Header.vue:.header-actions` — 账号入口挂载位置
  - `src/App.vue` — 全局弹层和账号门面状态来源
  - `src/account/accountSyncFacade.js` — 所有用户操作下游
  - `src/style.css` — 全局颜色、按钮、弹层和响应式变量
  - `src/components/CategoryModal.vue` / `LinkModal.vue` — 现有弹层可访问性和视觉模式
- 验收标准:
  - [x] `npm test` 与 `npm run build` 通过
  - [x] 桌面和 375px 宽度均可完成 OTP 登录、退出和手动同步
  - [x] 用户可区分已同步、dirty、同步中、离线、冲突和错误状态
  - [x] 冲突对话框提供保留本地、使用云端、保留两份且说明后果
  - [x] 恢复副本可以查看、导出和恢复，诊断报告不包含业务数据或 token
  - [x] 所有弹层支持 Escape、焦点恢复和明确 aria 标签
  - [x] 未配置 Supabase 时账号入口不影响现有导航与本地操作
  - [x] Code Review PASS
- 子任务:
  - [x] 8.1: 实现账号入口、同步状态和最近同步时间
  - [x] 8.2: 实现邮箱与六位验证码登录流程及重发倒计时
  - [x] 8.3: 实现首次迁移和冲突策略交互
  - [x] 8.4: 实现恢复副本、业务导出和诊断导出入口
  - [x] 8.5: 完成响应式、键盘和视觉状态验证

### 任务 9: [ ] 完成部署配置、全链路验证与交付文档
- 文件: `vite.config.js`（修改）、`src-tauri/tauri.conf.json`（修改）、`scripts/generate-tauri-config.mjs`（新建）、`.env.example`（新建）、`package.json`（修改）、`docs/deployment/account-sync.md`（新建）、`tests/account-sync-integration.test.js`（新建）、`tests/system-hardening.test.js`（修改）
- 依赖: Task 8
- spec 映射: 3.1、3.2、4.3、6.2、7.2、7.3、8.1、8.2、8.3、8.4
- 说明: 固化精确 CSP、环境示例、部署/回滚说明和跨模块集成测试，并在 Web、Tauri 与 Supabase 测试环境完成发布门禁。
- context:
  - `vite.config.js` — 当前 Web 构建与 Tauri external 配置
  - `src-tauri/tauri.conf.json:build/security` — 构建前命令和 CSP
  - `package.json:scripts` — 统一验证命令入口
  - `src/account/accountSyncFacade.js` — 集成测试主入口
  - `supabase/tests/account_sync.sql` — 数据库安全门禁
  - `tests/system-hardening.test.js` — 既有本地功能回归基线
- 验收标准:
  - [ ] `npm test` 与 `npm run build` 全部通过且无新 warning
  - [ ] `cargo fmt --check`、`cargo check` 和 Rust 测试通过
  - [ ] 有 Supabase CLI 时 `supabase db reset` 与数据库测试通过
  - [ ] 未配置云同步的生产构建不包含 service-role、数据库或 SMTP 密钥
  - [ ] 配置 Supabase URL 后生成的 CSP 只包含该精确 origin
  - [ ] 浏览器验证游客、本地 CRUD、导入导出、账号入口和禁用态无回归
  - [ ] staging 凭据可用时验证 OTP、两客户端 CAS、离线恢复和冲突三策略
  - [ ] 部署文档包含 OTP 模板、RLS、环境变量、发布顺序、回滚和故障处理
  - [ ] Code Review PASS
- 子任务:
  - [ ] 9.1: 增加环境示例、配置校验和精确 Tauri CSP 生成
  - [ ] 9.2: 补充 Mock 全链路、跨账号、离线和崩溃恢复集成测试
  - [ ] 9.3: 执行 Web、Tauri、数据库和浏览器验证
  - [ ] 9.4: 编写部署、邮件、备份、回滚与故障处理文档
  - [ ] 9.5: 检查构建产物和日志中不存在敏感密钥或用户数据

## Spec 覆盖映射

| Spec 章节 | 任务 | 说明 |
|-----------|------|------|
| 1 背景 | Task 2、7、8 | 从现有单机 Store 演进为可选账号同步并保持游客体验 |
| 2 目标/非目标 | Task 4–9 | 托管认证、轻量快照、无独立后端且不扩展到协作或 AI 数据 |
| 3.1 功能性需求 | Task 2、5–9 | 登录、隔离、同步、迁移、冲突、导入导出和双端支持 |
| 3.2 非功能性需求 | Task 1–9 | 本地优先、安全、兼容、性能、故障隔离与可替换边界 |
| 4.1 方案概览 | Task 2、5、6、7 | 展示、编排、业务状态与基础设施分层 |
| 4.2.1 核心模块 | Task 1–8 | 按模块职责逐步实现 |
| 4.2.2 接口设计 | Task 1、2、5、6、7 | Store、认证、仓库、协调器和门面契约 |
| 4.2.3 数据模型 | Task 1、2、4 | 业务快照、本地封装、恢复副本和云端单表 |
| 4.2.4 并发模型 | Task 4、6、7 | CAS、同步单飞、跨标签锁与 generation |
| 4.2.5 错误处理 | Task 1、2、5、6、8 | 统一错误、重试、恢复和用户反馈 |
| 4.3 核心逻辑 | Task 5、6、7、8 | 登录、首次迁移、常规同步、冲突和退出 |
| 4.4 方案优劣 | Task 4、6、9 | 保持快照边界、容量限制和可升级适配层 |
| 5 备选方案 | Task 4、5、6 | 落实单快照而非规范化表、独立后端或 LWW |
| 6 业界调研 | Task 3、4、5、6、9 | OTP、RLS、SECURITY INVOKER、Web Locks、Stronghold 和 CSP |
| 7 测试计划 | 每个任务、Task 9 | 分层单测、数据库测试、集成、性能和稳定性门禁 |
| 8.1 可观测性 | Task 1、8、9 | 用户状态、脱敏日志、指标和诊断导出 |
| 8.2 配置参数 | Task 1、3、4、9 | 前端、Supabase、同步常量与 Tauri 配置 |
| 8.3 运维接口 | Task 4、8、9 | CAS RPC、账号设置和 Supabase CLI |
| 8.4 运维注意事项 | Task 9 | 发布、升级、回滚、备份、安全和故障处理 |
