# Feature: 本地优先账号与云端同步

**作者**: Codex  
**日期**: 2026-07-31  
**状态**: Approved

---

## 1. 背景 (Background)
### 1.1 问题描述
- 当前应用没有账号体系，分类、链接、收藏和访问记录只存在于当前浏览器或当前电脑。
- 家长更换浏览器、清理站点数据或更换设备后，无法自动恢复个人收藏与分类，只能依赖手动导入导出。
- 产品需要提供可选的登录和跨设备同步，但仍应保持打开即用、离线可用，不引入需要自行运维的重型业务后端。
### 1.2 现状分析
- `src/data/store.js` 是分类、链接和成长记录的唯一写入口，以 `schemaVersion + categories + links + growthRecords` 完整快照作为数据模型，并通过串行写队列保证本地一致性。
- Web 环境使用 `localStorage['panduola_data']`；Tauri 环境通过 Rust command 读写 `~/.panduola/data.json`，两端当前互不相通。
- `App.vue` 在挂载时调用 `store.init()`，同时提供覆盖式 JSON 导入和完整快照导出。
- 当前数据没有用户标识、设备标识、同步版本、更新时间或删除墓碑；本地存储也没有按账号隔离。
- 仓库没有登录 SDK、远程 API、服务端、数据库或环境配置层；现有静态 Web 与 Tauri 应用均以本地使用为中心。
### 1.3 主要使用场景
- 未登录家长直接使用应用，数据仅保存在当前设备，不因登录能力引入而受阻。
- 家长选择登录后，将现有本地收藏与分类迁移到个人云端空间。
- 同一账号在另一台电脑或浏览器登录后，可以恢复并继续编辑自己的分类、链接和收藏。
- 网络不可用时继续浏览和编辑本地数据，网络恢复后自动同步。
- 多设备先后修改或同步版本冲突时，系统保留可恢复副本并避免静默覆盖。
- 家长退出或切换账号时，各账号本地数据相互隔离，访客数据也不会串入账号空间。

## 2. 目标 (Goals)
- 保持“无需登录、打开即用”的本地体验，同时为愿意登录的家长提供真实、可靠的跨设备数据同步。
- 使用托管认证与轻量快照存储降低开发和运维成本，避免建设独立业务后端。
- 保持现有组件和 Store 调用契约稳定，使 Web 与 Tauri 能共享同一账号和同步能力。
- 在首次登录、账号切换、离线编辑和版本冲突场景下不静默丢失用户数据。
### 2.1 非目标 (Non-Goals)
- 本期不建设独立 Node/Java/Rust HTTP 后端、管理后台或自建邮件服务。
- 本期不支持家庭成员共享、多人协作、儿童档案或角色权限。
- 本期不将 AI 搜索历史、AI 服务商设置或 API Key 纳入云同步。
- 本期不将分类与链接拆分为复杂关系型业务表，云端以用户快照为主要同步单元。
- 本期不承诺端到端加密；敏感凭据仍不得写入同步快照。
- 本期不提供微信、手机号或多个社交平台登录。

## 3. 需求细化 (Requirements)
### 3.1 功能性需求
- 未登录状态继续使用现有本地分类、链接、收藏、访问统计、导入和导出能力。
- 提供可选的“邮箱 + 6 位验证码”无密码登录、会话恢复、退出登录和账号状态展示。
- 按访客和用户 ID 隔离本地数据；切换账号时加载对应数据集。
- 云端同步范围包含分类、链接、收藏状态、访问次数、成长记录及现有 Schema 版本。
- 首次登录且云端为空时，允许将当前本地数据上传为账号初始数据。
- 本地与云端同时有数据时，不得自动覆盖；应允许保留本机、使用云端或创建可恢复备份后合并。
- 本地修改必须先成功写入本地，再异步批量同步到云端；同步失败不影响继续使用。
- 登录后启动时拉取云端版本，并通过同步 revision 检测多设备冲突。
- 冲突、上传失败或下载失败时展示明确同步状态，并保留最近一次可用本地数据。
- 成功导入 JSON 后，登录用户的数据应进入待同步状态；导出继续生成可独立恢复的完整快照。
- Web 与 Tauri 使用同一账号时能够访问同一份云端数据。
### 3.2 非功能性需求
- 本地数据加载和页面首屏不得依赖网络请求；云端不可用时核心功能仍可使用。
- 普通编辑应立即反馈，云端同步采用短时间防抖批量上传，避免每次点击产生独立远程写入。
- 任意同步或认证失败不得破坏现有本地快照；冲突处理不得静默丢弃任一侧数据。
- 云端数据必须按认证用户隔离，未登录用户不得读取或写入其他用户数据。
- 客户端不得包含可绕过用户级权限的服务端密钥；配置缺失时应自然降级为纯本地模式。
- 兼容当前 Schema v2、宽容旧数据迁移、严格导入校验和现有 Store 异步失败语义。
- 同时支持静态 Web 部署和 Tauri 2；桌面端远程连接必须符合 CSP 与凭据存储要求。
- 同步模块应与页面组件解耦，未来可以替换云服务而不重写 Dashboard、链接库和管理弹窗。
- 不引入自建常驻服务、数据库运维、备份任务或邮件基础设施。

## 4. 设计方案 (Design)
### 4.1 方案概览
- 采用“本地优先 + 独立同步层”的渐进式架构。现有业务 Store 继续作为页面编辑时的即时数据源，账号会话、同步协调、本地介质和 Supabase 访问分别维护独立职责。
- 模块划分为四层：
  - 展示层：现有页面及全局账号/同步状态入口，只展示会话和同步状态，不直接调用 Supabase。
  - 应用编排层：协调应用启动、会话恢复、账号切换、首次迁移和同步生命周期。
  - 业务状态层：保留现有 Store 的分类、链接、收藏、访问统计和本地串行写语义。
  - 基础设施层：分别提供 Web/Tauri 本地持久化能力和 Supabase 认证、云端快照能力。
- 依赖保持单向：页面依赖应用编排与 Store，应用编排依赖账号/同步抽象，业务 Store 只依赖本地持久化边界，同步协调通过快照边界连接 Store 与云端适配器；页面组件和业务 Store 均不直接依赖 Supabase SDK。
- 数据流遵循“本地先提交、云端后同步”：
  1. 应用启动后先加载当前本地数据空间并渲染页面。
  2. 后台恢复登录会话，不阻塞本地首屏。
  3. 登录后读取云端 revision，处理首次上传、云端恢复或冲突。
  4. 普通修改先完成本地持久化，再将当前快照标记为待同步。
  5. 同步模块防抖批量上传；失败只更新同步状态，不回滚本地编辑。
  6. 账号切换时终止旧账号同步代际，再加载新账号对应的本地数据空间。
- 一致性选择最终一致性，不在页面热路径等待远程调用；网络超时、断连和服务不可用均通过本地继续可用、后台重试和显式状态展示处理。
- 云端使用用户级完整快照作为同步单元，以降低开发和运维复杂度；通过 revision 检测快照级冲突，并保留双方可恢复副本，禁止静默覆盖。
- 关键取舍：
  - 相比 Store 直接集成 Supabase，增加了一层协调与适配代码，但避免认证、网络和冲突逻辑污染现有业务 Store。
  - 相比逐分类/逐链接增量同步，完整快照实现更简单且兼容现有 Schema；代价是多设备并发只能进行快照级冲突处理。
  - 相比云端作为唯一数据源，本地优先能够保持离线和低延迟体验；代价是系统接受短时间的最终一致状态。
### 4.2 组件设计 (Component Design)
#### 4.2.1 核心类/模块设计
- **应用启动编排模块**：协调本地初始化、会话恢复、账号切换和同步启停；不保存业务数据，也不直接调用 Supabase。
- **账号会话模块**：负责邮箱验证码登录、会话恢复、退出及当前用户状态；不处理分类、链接或同步冲突。
- **业务 Store**：继续拥有分类、链接、收藏、访问统计、成长记录和串行本地写入；保持现有 reactive 数据与公开方法契约，不感知用户邮箱、Token 或 Supabase。
- **本地数据空间模块**：根据访客或用户 ID 选择本地存储命名空间，并分别适配 Web localStorage 与 Tauri 文件；不决定远端同步策略。
- **同步协调模块**：负责待同步、同步中、成功、失败、冲突等状态，以及 revision、批量上传、重试和账号代际隔离；不直接操作页面 DOM。
- **云端认证适配模块**：将 Supabase 邮箱 OTP 与会话对象转换为应用内部账号模型，禁止 Supabase 原始对象扩散到页面。
- **云端快照仓库模块**：读取当前用户快照并按 revision 条件更新；只负责远端数据访问，不决定 UI 冲突选项。
- **账号与同步 UI 模块**：提供登录弹窗、账号菜单、同步状态、首次迁移和冲突选择；仅调用应用编排边界，不直接调用 Supabase SDK。
- **运行时配置模块**：读取 Supabase URL、公开客户端 Key 和功能开关；配置缺失时关闭账号同步并保持纯本地模式，禁止接收服务端特权密钥。
- 数据所有权：
  - 分类、链接、收藏和访问统计归业务 Store。
  - 当前用户与认证会话归账号会话模块。
  - revision、同步状态、重试信息和冲突副本归同步协调模块。
  - Web/Tauri 本地数据归本地数据空间模块持久化。
  - 远端用户快照归云端快照仓库维护。
- 依赖保持单向：账号/同步 UI → 应用编排 → 账号会话、业务 Store、同步协调；业务 Store → 本地数据空间；同步协调 → 业务 Store 快照边界、云端快照仓库；云端适配模块 → 运行时配置。
- 不建立包含账号、业务和同步状态的超级 Store；三类状态分别维护，并由应用启动编排模块协调。
- Supabase SDK 只允许存在于云端认证和快照基础设施模块，Dashboard、链接库、管理弹窗及业务 Store 不得直接依赖。
- 账号切换只能由应用编排模块执行：先终止旧账号同步代际，再切换本地数据空间并启动新账号同步，避免异步结果写入错误账号。
#### 4.2.2 接口设计
- 账号与同步 UI 只调用应用账号门面，不直接依赖认证 SDK、云端仓库或 Token：
  ```ts
  initialize(): Promise<void>
  requestLoginCode(email: string): Promise<void>
  verifyLoginCode(email: string, code: string): Promise<void>
  logout(): Promise<void>
  syncNow(): Promise<SyncResult>
  resolveFirstLogin(strategy: MigrationStrategy): Promise<void>
  resolveConflict(strategy: ConflictStrategy): Promise<void>
  ```
- 应用账号门面提供只读响应式状态：`accountState`、`syncState`、`isSyncAvailable`、`pendingMigration` 和 `pendingConflict`。
- 账号认证接口：
  ```ts
  restoreSession(): Promise<AccountSession | null>
  requestOtp(email: string): Promise<void>
  verifyOtp(email: string, code: string): Promise<AccountSession>
  signOut(): Promise<void>
  subscribe(listener): Unsubscribe
  ```
  内部 `AccountSession` 仅暴露 `userId`、`email` 和 `expiresAt`；Supabase 原始 Session 与 access token 不向页面和业务 Store 暴露。
- 本地数据空间接口：
  ```ts
  load(spaceKey: string): Promise<Snapshot | null>
  save(spaceKey: string, snapshot: Snapshot): Promise<void>
  saveRecoveryCopy(
    spaceKey: string,
    snapshot: Snapshot,
    reason: RecoveryReason
  ): Promise<void>
  ```
  `spaceKey` 只允许 `guest` 或 `user:<userId>`；Web 与 Tauri 分别实现该接口。
- 业务 Store 保留全部现有增删改查方法，只新增应用内部边界：
  ```ts
  activateDataSpace(spaceKey: string): Promise<void>
  applySnapshot(snapshot: Snapshot, source: SnapshotSource): Promise<void>
  subscribeLocalCommits(listener): Unsubscribe
  getSnapshot(): Snapshot
  ```
  数据空间切换和快照应用必须进入现有串行边界；快照通过 Schema 校验并成功本地保存后才能提交 reactive 状态或发出本地提交事件。
- 云端快照仓库接口：
  ```ts
  load(): Promise<RemoteSnapshot | null>
  create(snapshot: Snapshot): Promise<RemoteSnapshot>
  compareAndSwap(
    expectedRevision: number,
    snapshot: Snapshot
  ): Promise<RemoteSnapshot>
  ```
  `compareAndSwap` 是唯一远端更新入口；revision 不匹配时返回 `REVISION_CONFLICT`。仓库依据认证上下文和 RLS 访问当前用户数据，不允许调用方传入任意用户 ID。
- 同步协调器接口：
  ```ts
  start(session: AccountSession): Promise<void>
  stop(): Promise<void>
  markDirty(snapshot: Snapshot): void
  syncNow(): Promise<SyncResult>
  resolveFirstLogin(strategy: MigrationStrategy): Promise<void>
  resolveConflict(strategy: ConflictStrategy): Promise<void>
  subscribe(listener): Unsubscribe
  ```
- 首次迁移策略为 `upload-local`、`use-cloud`、`keep-both`；冲突策略为 `keep-local`、`use-cloud`、`keep-both`。`keep-both` 必须先保存恢复副本，不等同于无条件字段级自动合并。
- 所有异步模块统一使用包含 `code`、`retryable` 和 `cause` 的 `AppError`。首期错误码包括：
  - 配置与认证：`CONFIG_MISSING`、`INVALID_EMAIL`、`INVALID_OTP`、`OTP_RATE_LIMITED`、`SESSION_EXPIRED`。
  - 网络与权限：`OFFLINE`、`REMOTE_UNAVAILABLE`、`UNAUTHORIZED`。
  - 数据与存储：`REVISION_CONFLICT`、`INVALID_REMOTE_DATA`、`LOCAL_STORAGE_FAILED`。
- 后台同步失败主要写入 `syncState`；用户主动登录、立即同步或处理冲突时，错误同时返回给调用方。
- 向后兼容约束：
  - 现有 Store 方法签名、Promise 失败语义、`categories`、`links` 和 `initialized` reactive 状态保持不变。
  - `normalizeData`、严格导入校验、串行写队列和访问批处理继续有效。
  - 所有订阅接口必须返回取消函数，账号切换时注销旧监听器。
  - 配置缺失时 `isSyncAvailable=false`，现有本地功能不得报错或降级。
#### 4.2.3 数据模型
- 业务快照继续使用现有 Schema v2，不混入认证、设备或同步元数据：
  ```ts
  interface Snapshot {
    schemaVersion: 2
    categories: Category[]
    links: Link[]
    growthRecords: GrowthRecord[]
  }
  ```
  现有导入导出格式保持兼容；账号 ID、设备 ID、远端 revision 和登录凭据不得进入业务快照。
- 每个本地账号空间使用独立封装：
  ```ts
  interface LocalSpaceEnvelope {
    localFormatVersion: 1
    ownerKey: 'guest' | `user:${string}`
    snapshot: Snapshot
    sync: {
      remoteRevision: number | null
      dirty: boolean
      lastSyncedHash: string | null
      lastSyncedAt: string | null
    }
    updatedAt: string
  }
  ```
  `schemaVersion` 管理业务数据迁移，`localFormatVersion` 管理本地封装格式迁移，两者独立演进。
- 安装级设备元数据独立保存：
  ```ts
  interface DeviceMetadata {
    deviceId: string
    createdAt: string
  }
  ```
  `deviceId` 是随机 UUID，仅用于标识更新来源，不采集硬件指纹。
- 本地存储布局：
  - Web：`panduola_space:guest`、`panduola_space:user:<uuid>` 和 `panduola_device`。
  - Tauri：`~/.panduola/spaces/guest.json`、`~/.panduola/spaces/user-<uuid>.json`、`~/.panduola/device.json` 和 `~/.panduola/recoveries/`。
  - 用户 ID 必须先通过 UUID 校验再用于键名或文件名，避免路径穿越和非法键。
  - 旧版 `panduola_data` 首次启动时复制到游客空间；仅在新格式成功持久化后切换读取来源，并至少保留一个版本周期作为回退副本。
- Supabase 首期仅建立 `user_snapshots` 表，每个用户一行完整快照：

  | 字段 | 类型与约束 | 说明 |
  |------|------------|------|
  | `user_id` | `uuid primary key references auth.users(id) on delete cascade` | 快照所有者 |
  | `schema_version` | `integer not null` | 业务快照版本 |
  | `payload` | `jsonb not null` | 完整业务快照 |
  | `payload_hash` | `text not null` | 规范化快照哈希 |
  | `revision` | `bigint not null default 1 check (revision > 0)` | 乐观并发版本 |
  | `updated_at` | `timestamptz not null default now()` | 最近更新时间 |
  | `updated_by_device` | `uuid not null` | 最近更新设备 |
  | `created_at` | `timestamptz not null default now()` | 创建时间 |

  首期不建立分类表、链接表、用户资料表或云端历史版本表。
- 启用 Row Level Security。查询、插入和更新均要求 `auth.uid() = user_id`；客户端不能为其他用户读写数据，首期不开放客户端删除云端快照。
- 云端记录映射为：
  ```ts
  interface RemoteSnapshot {
    snapshot: Snapshot
    revision: number
    payloadHash: string
    updatedAt: string
    updatedByDevice: string
  }
  ```
  更新必须携带预期 revision，成功时原子递增；具体 compare-and-swap 流程在并发模型中定义。
- 恢复副本首期仅保存在本地，每个数据空间最多保留最近 5 份：
  ```ts
  interface RecoveryCopy {
    id: string
    reason: 'first-login' | 'revision-conflict' | 'manual-import'
    createdAt: string
    source: 'local' | 'cloud'
    remoteRevision: number | null
    snapshot: Snapshot
  }
  ```
  `keep-both` 必须先成功写入恢复副本，再替换当前快照；超出上限时删除最旧副本。
- 单个规范化业务快照限制为 2 MiB。远端快照在应用前必须通过大小限制、Schema 校验和现有规范化流程；不合法数据不得进入 Store。
- `payload_hash` 基于规范化、确定性序列化后的业务快照计算，用于跳过无变化上传，不能代替 revision 并发控制。
- 登录 Session 和 token 由独立凭据存储管理，不写入业务快照、本地空间封装、恢复副本或导出文件，也不上传到 `user_snapshots`。
- 首期冲突以完整快照为单位处理，不自动执行链接级或字段级合并；恢复副本仅存在于处理冲突的本地设备。
#### 4.2.4 并发模型
- 并发控制分为三层：业务 Store 的实例内串行写队列、每账号同步互斥锁，以及 Web 端跨标签同步锁。云端 revision 是跨设备并发的最终一致性边界。
- 所有本地业务修改继续进入现有串行写队列。一次修改只有在本地数据空间成功持久化后才更新 reactive 状态并发出本地提交事件；失败时保持修改前状态。
- 每个账号同一时间最多运行一个同步任务。同步运行期间的新本地提交只设置 `dirty=true` 并记录最新快照；当前同步结束后，如果仍为 dirty，协调器合并触发为额外一轮同步，不为每次修改并发创建请求。
- 普通本地提交使用约 1.5 秒 debounce 触发后台同步；用户点击“立即同步”、网络恢复或窗口重新获得焦点时跳过 debounce。访问次数的现有批处理完成本地提交后才触发同步。
- 云端更新必须通过原子 compare-and-swap：
  1. 客户端携带本地记录的 `expectedRevision` 和新快照。
  2. 数据库仅在当前 revision 与预期值一致时更新 payload，并原子执行 `revision = revision + 1`。
  3. 更新成功后返回新 revision、服务端时间和 payload hash。
  4. 没有匹配记录时返回 `REVISION_CONFLICT`；协调器读取最新远端快照并进入冲突状态，不自动覆盖任一版本。
  该操作由 Supabase 数据库函数或等价的单语句条件更新实现；函数依据 `auth.uid()` 确定用户，不能接收可伪造的目标用户 ID。
- 同步状态机：

  | 状态 | 含义 | 允许的主要转换 |
  |------|------|----------------|
  | `disabled` | 未配置云同步 | 配置有效后进入 `signed-out` |
  | `signed-out` | 未登录 | 恢复或完成登录后进入 `initializing` |
  | `initializing` | 恢复会话、选择数据空间或检查首次迁移 | 进入 `idle`、`dirty`、`conflict` 或 `error` |
  | `idle` | 本地与已知远端一致 | 本地提交后进入 `dirty` |
  | `dirty` | 存在未上传的本地修改 | 触发同步后进入 `syncing` |
  | `syncing` | 正在读取或提交远端快照 | 成功进入 `idle`/`dirty`，网络失败进入 `offline`，版本不一致进入 `conflict` |
  | `offline` | 网络不可用且本地可继续使用 | 网络恢复后进入 `dirty` 或 `syncing` |
  | `conflict` | 本地与远端均存在不可静默覆盖的修改 | 用户处理后进入 `dirty`、`syncing` 或 `idle` |
  | `error` | 非网络类同步错误 | 修复、重试或重新登录后进入相应状态 |

- 首次迁移选择或 revision 冲突未处理时设置同步门闩，暂停自动上传。用户仍可继续本地编辑；新提交保持 dirty，解决冲突时必须基于当时最新的本地快照，而不是弹窗出现时的过期副本。
- 账号切换、登录和退出使用互斥的切换屏障：
  1. 停止旧协调器、定时器和订阅。
  2. 增加单调递增的账号 generation。
  3. 等待业务 Store 当前本地写队列完成。
  4. 激活目标数据空间并完成本地加载。
  5. 为新账号启动认证监听和同步协调器。
  所有认证和同步异步结果在提交状态前必须同时校验 `userId` 与 generation；旧账号或旧会话的迟到响应直接丢弃。
- 退出登录不以云端同步成功为前提。系统先确保当前本地账号空间已经持久化，再停止远端访问并切换到游客空间；未同步数据和 revision 元数据保留在该用户空间，供下次登录继续同步。
- 临时网络错误采用带随机抖动的指数退避，建议间隔上限依次为 2、5、15、30 秒；达到上限后保持 30 秒周期，同时允许用户立即重试。浏览器 `online` 事件、应用恢复和窗口重新获得焦点时立即触发一次受互斥锁保护的同步。
- Web 端使用账号级跨标签锁保证同一浏览器内只有一个标签执行该账号的云端同步；优先使用 Web Locks API，不可用时使用带过期时间的 localStorage lease。数据空间变化通过 `BroadcastChannel`，并以 storage 事件作为兼容回退通知其他标签。
- 收到跨标签数据变化时，无本地未提交修改的标签可重新加载；存在 dirty 修改的标签不得静默覆盖，应进入冲突保护流程。跨标签锁只减少重复请求，云端 revision 仍是最终并发控制。
- Tauri 首期按单进程窗口模型运行，使用实例内同步互斥锁；接口不依赖该假设，以便未来多窗口时补充进程级锁。
#### 4.2.5 错误处理
- 总体原则是“同步失败不影响本地使用，本地保存失败阻止状态提交和云端上传”。未经成功持久化的业务修改不得进入 reactive 状态，也不得被同步协调器观察为可上传快照。
- 失败模式与处理：

  | 失败场景 | 系统行为 | 用户反馈 |
  |----------|----------|----------|
  | Supabase 未配置 | 同步状态保持 `disabled`，不初始化 SDK | 账号入口提示云同步未配置，本地功能正常 |
  | 邮箱或验证码无效/过期 | 不自动重试，不创建会话 | 表单内显示可修正错误 |
  | 验证码发送限流 | 依据服务端提示进入冷却期 | 显示可再次发送的时间 |
  | 网络中断、超时或临时 5xx | 保留 dirty 数据并退避重试 | 显示“已保存到本地，等待同步” |
  | Session 过期 | 尝试刷新一次；失败后停止同步、保存账号空间并切换游客空间 | 提示重新登录 |
  | RLS 或权限异常 | 停止自动重试，保留本地数据 | 显示账号权限异常 |
  | revision 冲突 | 读取最新远端快照并进入 `conflict`，不自动重写 | 提供保留本地、使用云端、保留两份 |
  | 远端数据损坏 | 拒绝应用和覆盖本地数据 | 提示云端数据异常，允许导出本地数据 |
  | 远端 Schema 高于客户端 | 停止该账号同步 | 提示升级客户端 |
  | 快照超过 2 MiB | 阻止上传，继续本地持久化并保持 dirty | 提示清理数据或导出备份 |
  | 本地存储失败 | 回滚本次内存状态，不触发同步 | 持续显示存储异常并提供导出入口 |
  | 恢复副本写入失败 | 中止 `keep-both` 和任何后续覆盖 | 提示释放空间后重试 |
  | 本地数据损坏 | 隔离原始数据后尝试恢复副本或旧版数据 | 明确告知恢复结果，不静默清空 |

- 错误统一使用 `AppError`，包含 `code`、`retryable`、`cause`，并可携带面向 UI 的 `userMessageKey` 与 `retryAfter`。`cause` 只用于内部诊断，不直接渲染。
- 自动重试仅适用于网络超时、临时服务异常和限流；认证失败、权限错误、数据格式错误、本地存储失败和 revision 冲突不得盲目重试。
- 在既有错误码基础上新增：
  - 认证：`OTP_EXPIRED`。
  - 数据版本：`UNSUPPORTED_SCHEMA`、`SNAPSHOT_TOO_LARGE`。
  - 数据完整性：`REMOTE_DATA_CORRUPTED`、`LOCAL_DATA_CORRUPTED`、`RECOVERY_WRITE_FAILED`。
- Web 端本地持久化使用完整键值替换。Tauri 文件持久化使用“同目录临时文件写入、同步落盘、原子重命名”流程，避免进程异常留下半份 JSON。
- 发现本地数据无法解析或校验失败时，必须先将原始内容写入 quarantine/recovery；随后按“最近有效恢复副本、旧版回退数据、空白默认数据”的顺序尝试恢复。只有前一步隔离成功后才允许使用空白数据。
- 云端快照只有通过 2 MiB 大小限制、Schema 校验和现有规范化流程后才能进入 Store；失败时保持当前本地状态和 revision 元数据不变。
- 后台同步错误主要写入 `syncState`；登录、手动同步和冲突处理等用户主动操作还必须向调用页面返回错误。
- 日志和错误上下文不得记录 OTP、access token、refresh token、完整邮箱或完整业务快照。邮箱如需定位只记录脱敏值，数据仅记录 hash、schemaVersion、revision、字节数和设备 ID。
- 任意认证、同步、恢复或迁移失败都不得删除游客空间、其他账号空间、恢复副本或旧版回退数据。
### 4.3 核心逻辑实现
- 应用启动流程：
  1. 加载运行时配置和安装级设备 ID。
  2. 从独立凭据存储恢复 Session。
  3. 无有效 Session 时激活游客空间；有有效 Session 时激活 `user:<userId>` 空间。
  4. 本地页面可用后再启动后台云端检查，网络异常不得阻塞本地启动。
  5. 初始化全程携带账号 generation，避免 Session 恢复与用户主动登录或退出产生竞态。
- 邮箱验证码登录流程：
  1. 规范化并校验邮箱，调用认证适配器请求六位验证码。
  2. 验证成功并获得 Session 后才允许切换数据空间。
  3. 激活用户空间并执行首次登录判定。
  4. 完成迁移或冲突选择后开启自动上传。
  5. 任一步失败都继续停留在原数据空间，不提前清空或替换页面数据。
- 首次登录决策：

  | 本地账号空间 | 云端快照 | 处理方式 |
  |--------------|----------|----------|
  | 不存在 | 不存在 | 从游客空间复制到账号空间并创建云端快照；游客数据保留 |
  | 不存在 | 存在 | 游客无有效修改时使用云端；否则进入首次迁移选择 |
  | 存在 | 不存在 | 使用本地账号空间创建云端快照 |
  | 存在 | 存在 | 根据已知 revision、hash 和 dirty 状态执行常规同步；缺少同步来源信息时进入迁移选择 |

  首次迁移的 `keep-both` 固定为：当前本地数据作为账号活动数据，云端版本先保存为本地恢复副本，再以当前远端 revision 尝试上传本地版本。恢复副本可以在账号设置中恢复或导出。
- 常规同步开始前等待本地写队列稳定，并捕获不可变上下文：
  ```ts
  interface SyncAttempt {
    generation: number
    userId: string
    snapshot: Snapshot
    localHash: string
    knownRemoteRevision: number | null
    dirty: boolean
  }
  ```
- 读取远端后的同步判定：

  | 本地状态 | 云端状态 | 动作 |
  |----------|----------|------|
  | clean | revision 未变化 | 保持 `idle` |
  | clean | revision 已增加 | 下载并应用云端版本 |
  | dirty | revision 未变化 | 使用 CAS 上传本地版本 |
  | dirty | revision 已增加 | 进入 `conflict` |
  | 任意 | 规范化内容 hash 相同 | 接受并保存远端 revision，不重复上传 |
  | 从未同步 | 云端不存在 | 创建云端快照 |
  | 曾经同步 | 云端异常消失 | 进入错误状态，不自动重建记录 |

- 上传成功后，只有当前本地 hash 仍与该次上传的 hash 相同时才能清除 dirty；同步期间发生新提交时保留 dirty，并在当前任务结束后启动合并后的下一轮。
- 如果远端提交成功但本地 revision 元数据尚未保存时应用崩溃，下次同步通过相同 payload hash 接受远端新 revision，恢复为 clean，不制造虚假冲突。
- 云端下载流程：
  1. 校验响应大小、Schema、payload hash 和字段约束。
  2. 再次校验 Session、userId 与 generation。
  3. 通过 Store 串行边界应用快照。
  4. 本地数据空间成功持久化后更新 reactive 状态。
  5. 最后保存 remote revision、hash 和同步时间。
  任一步失败都保留应用前的本地快照和同步元数据。
- 冲突处理：
  - `keep-local`：保存云端恢复副本，再以最新云端 revision 执行 CAS。
  - `use-cloud`：保存本地恢复副本，再通过 Store 应用云端版本。
  - `keep-both`：保存云端恢复副本，本地保持活动状态并尝试上传。
  - 用户处理期间若云端 revision 再次变化，则重新进入冲突状态。
  - 恢复副本未成功写入时，所有会覆盖任一版本的操作必须中止。
- 退出登录流程：
  1. 等待本地写队列完成。
  2. 停止同步、重试定时器和跨标签监听。
  3. 增加 generation，使迟到响应失效。
  4. 清理登录 Session。
  5. 激活游客空间。
  dirty 数据保留在用户空间，下次登录后继续同步。
- 快照哈希在现有规范化逻辑之后计算。确定性 JSON 序列化固定对象键顺序，但保留分类和链接数组顺序；对 UTF-8 字节计算 SHA-256。hash 仅用于幂等与跳过无变化上传，不能替代 revision 并发控制。
### 4.4 方案优劣分析
- 主要优势：
  - 保持本地优先体验，收藏、分类和访问记录不依赖网络，启动和操作延迟与现有版本接近。
  - 后端足够轻量，仅使用 Supabase Auth 和每用户一行快照，不维护独立服务、业务接口或复杂关系模型。
  - 对现有代码侵入较小，业务 Store API 和导入导出格式基本不变，认证与同步通过独立适配层接入。
  - 云同步可选启用；缺少配置时仍是功能完整的本地亲子导航网站。
  - 前端可独立静态部署，Supabase 项目作为可替换的云能力；完整导出能力降低服务锁定风险。
  - 同步按本地提交触发，不依赖实时订阅或常驻连接，初期成本和运维复杂度可控。
  - 本地、认证和云端故障边界清楚；云端异常不阻塞本地编辑，账号数据空间相互隔离。
  - 首期同步分类、链接、收藏状态、访问次数和成长记录，不扩大到 AI 密钥、对话记录或应用凭据。
- 明确限制：
  - 完整快照的网络和序列化成本随数据量增长，因此首期限制为 2 MiB。
  - 冲突以整份快照处理，不能自动合并两台设备分别新增的不同链接。
  - 不适合家庭成员共享、多人协作或实时共同编辑。
  - 云端首期没有历史版本；恢复副本只存在于实际处理冲突的本地设备。
  - 首台设备首次登录依赖网络完成 OTP 验证；已有有效会话的设备可以离线使用本地数据。
  - Web 跨标签锁只能降低冲突概率，不能提供协作文档式实时合并。
  - 快照不是端到端加密，Supabase 项目管理员理论上能够访问其内容。
  - 邮箱登录体验依赖验证码送达质量、发件域名信誉和限流配置。
  - Tauri 需要安全凭据存储，并在 CSP 中配置限定到 Supabase 项目的 `connect-src`。
  - 采用最终一致性，设备间不会瞬时更新；正常传播延迟约为本地 debounce 加网络请求时间。
- 出现以下任一条件时，应评估升级为规范化云端模型或独立后端：
  - 单用户快照接近 2 MiB。
  - 需要家庭共享、多人协作或细粒度权限。
  - 需要链接级历史版本、自动合并或云端回收站。
  - 需要服务端搜索、推荐、统计或管理后台。
  - 快照冲突频率已明显影响用户体验。
  - 需要端到端加密或组织级合规控制。
- 升级时保留 `CloudSnapshotRepository` 作为应用层边界，由新的云端实现替换 Supabase 快照适配器，避免重新改造页面和业务 Store。

## 5. 备选方案 (Alternatives Considered)
- 方案对比：

  | 方案 | 本地体验 | 实现/运维成本 | 多设备同步 | 冲突能力 | 当前结论 |
  |------|----------|---------------|------------|----------|----------|
  | 纯本地 + 手动导入导出 | 最好 | 最低 | 差 | 依赖人工 | 不满足自动同步目标 |
  | Supabase 单用户快照 | 好 | 较低 | 好 | 整份快照处理 | 当前选择 |
  | Supabase 规范化业务表 | 好 | 中高 | 好 | 可细化到链接 | 当前阶段过重 |
  | 自建后端 + 数据库 | 取决于实现 | 最高 | 好 | 完全可控 | 不符合轻量目标 |
  | WebDAV/网盘文件同步 | 好 | 中等 | 一般 | 文件级冲突 | 跨平台与授权体验不稳定 |
  | 客户端端到端加密快照 | 好 | 较高 | 好 | 整份快照处理 | 暂无明确合规需求 |

- 未选择纯本地方案：实现最简单、最私密且无服务成本，但用户必须手工导出、传输和导入文件，不能满足登录后跨设备自动同步。现有导入导出能力继续保留，作为离线备份和退出云服务的通道。
- 未选择 Supabase 规范化业务表：它能够实现增量同步、链接级冲突和服务端查询，但需要重新设计业务主键、外键、排序、删除语义及本地操作日志，令本地 Store 和云端表形成双重业务模型；RLS、迁移和测试成本也明显增加，当前单用户数据规模不足以抵消复杂度。
- 未选择独立后端：自建 Node、Java、Go 或 Rust 服务能够完全控制认证、同步和数据模型，但会增加服务部署、数据库维护、接口版本、安全更新、监控和备份，不符合“不想要重后端”的目标。
- 未选择 WebDAV 或网盘文件同步：不同供应商的 OAuth、文件锁、版本能力和跨域限制差异较大，Web 与 Tauri 也需要不同适配，用户配置体验比邮箱登录更复杂。未来可以把它实现为另一个 `CloudSnapshotRepository`，而不是首期主路径。
- 暂缓端到端加密：客户端加密会增加密钥生成、跨设备传递、恢复和遗失处理；用户遗失密钥后服务端无法协助恢复。首期通过最小同步范围、RLS 和完整导出控制风险，出现明确隐私或合规需求后再引入加密版本。
- 最终选择“本地优先 + Supabase Auth + 单用户完整快照 + revision CAS”，作为用户体验、开发成本和未来可替换性之间的平衡。

## 6. 业界调研 (Industry Research)

> **注意**：本章节应在完成自主设计后填写，用于验证方案、确保下限，而非作为设计的起点。

### 6.1 业界方案
- Supabase 原生支持邮箱六位 OTP，但邮件模板必须使用 `{{ .Token }}`；若使用 `{{ .ConfirmationURL }}`，发送的是 Magic Link。官方默认限制同一用户 60 秒内只能请求一次，OTP 默认一小时过期并支持项目级配置。
- Supabase 的标准多租户隔离方式是在 PostgreSQL 开启 RLS，并通过 `auth.uid() = user_id` 限制行所有权。插入使用 `with check`；更新需要 `using`、`with check`，并且还需要匹配的查询策略。
- Supabase 支持通过远程 API 调用数据库函数；官方建议函数默认使用 `SECURITY INVOKER`，以调用者权限执行。它适合实现内部读取 `auth.uid()`、不接收目标用户 ID 的 CAS 更新函数。
- PostgreSQL 在并发更新等待结束后会重新判断更新命令的 `WHERE` 条件，因此 `WHERE revision = expected_revision` 能够作为原子的乐观锁边界。
- CouchDB 使用上一版本 `_rev` 更新完整文档；旧 revision 写入会得到冲突响应，由应用重新读取、合并或让用户选择。该模型与本方案的快照 revision 和显式冲突处理相近，但 CouchDB 还维护 revision tree。
- Firestore 提供离线缓存与恢复联网后的自动同步，但多个客户端修改同一文档时采用 last-write-wins。本系统不采用该行为，避免家长收藏在没有提示的情况下被覆盖。
- Web Locks API 支持同源窗口和 Worker 对命名资源申请独占锁，适合协调唯一同步标签；但其标准状态仍为 W3C Working Draft，因此不能作为唯一正确性边界。
- Tauri 官方提供基于 IOTA Stronghold 的安全存储插件，并建议通过 CSP 仅允许可信的连接目标，能够支持桌面端凭据隔离和 Supabase 域名白名单。
### 6.2 对比分析
- 本方案采用与 CouchDB 相似的 revision 前置条件，但不实现 revision tree、自动复制协议或云端冲突分支；首期只维护一个云端版本和最多五个本地恢复副本。
- 相比 Firestore 的 last-write-wins，本方案增加 CAS 和显式冲突处理，以更低的自动化程度换取不静默丢失用户数据。
- Supabase Auth、RLS 和数据库函数能够直接覆盖认证、行级隔离和原子更新需求，不需要新增独立业务后端。
- 根据调研对设计增加以下约束：
  - OTP 邮件模板必须使用 `{{ .Token }}`；验证码有效期配置为 10 分钟，重发冷却保持 60 秒。
  - RLS 策略全部限定 `TO authenticated`，分别定义 SELECT、INSERT 和 UPDATE；首期不授予 DELETE。
  - CAS 数据库函数使用 `SECURITY INVOKER`，函数内部调用 `auth.uid()`，客户端不传 `user_id`。
  - 前端只能包含 Supabase publishable/anon key，严禁包含 service-role key。
  - Web Locks 只作为跨标签请求协调优化；不支持时回退到带租约的 localStorage 锁，云端 revision 始终是最终并发边界。
  - Tauri Session 存入 Stronghold，不写入普通 JSON；Stronghold 无法初始化时禁用桌面端云同步，本地功能继续工作。
  - Tauri CSP 的 `connect-src` 精确配置为当前 Supabase 项目域名，不使用宽泛通配符。
  - 测试必须覆盖 RLS 越权、并发 CAS、创建快照竞态、Session 过期和旧 generation 响应回写。
- 已知风险：
  - 邮件模板未切换为 Token 时，产品会错误发送 Magic Link。
  - 缺少 SELECT 策略时，Supabase UPDATE 可能表现为无法更新而非直观权限错误。
  - 使用 `SECURITY DEFINER` 或把 service-role key 放入前端会绕过预期权限边界。
  - Web Locks 并非所有运行环境都可依赖，且租约回退必须处理标签崩溃和过期接管。
  - Stronghold 的初始化和解锁策略必须在桌面打包测试中验证，不能退化为明文 token 文件。

## 7. 测试计划 (Test Plan)
### 7.1 单元测试
- 覆盖 Snapshot、LocalSpaceEnvelope、RemoteSnapshot 的校验与迁移。
- 覆盖旧 `panduola_data` 向游客空间迁移；新格式写入失败时旧数据必须保留。
- 覆盖 `guest`、`user:<uuid>` 数据空间键校验和非法 UUID 拒绝。
- 验证确定性序列化与 SHA-256：对象键顺序变化不改变 hash，分类或链接数组顺序变化必须改变 hash。
- 覆盖 2 MiB 边界、非法 Schema、未来 Schema 和损坏 JSON。
- 覆盖同步决策矩阵的每个分支，以及内容相同但 revision 不同的幂等恢复。
- 覆盖上传期间再次修改时 dirty 不被错误清除。
- 覆盖 generation 不匹配的认证和同步响应被丢弃。
- 使用 fake timers 覆盖 debounce、同步互斥、追加同步、指数退避和取消。
- 覆盖 OTP、网络、权限、存储、数据损坏与冲突错误映射。
- 覆盖恢复副本写入、最多五份及最旧副本淘汰。
- 覆盖首次迁移和冲突处理的 `keep-local`、`use-cloud`、`keep-both` 语义。
- 覆盖 AppError 的 `retryable`、`retryAfter` 和用户提示映射。
### 7.2 集成测试
- 测试分为两层：
  - Mock Supabase 覆盖快速、确定性的应用同步流程。
  - 独立 Supabase 测试项目验证真实 Auth、RLS、数据库函数和并发事务。
- 核心场景：
  1. 未配置 Supabase 时，现有本地功能和全部既有回归测试通过。
  2. OTP 登录成功、验证码错误、过期、限流和 Session 恢复。
  3. 首次登录的四种本地账号空间与云端快照组合。
  4. 离线连续编辑，恢复联网后只上传最新快照。
  5. 两个客户端基于同一 revision 并发提交，仅一个成功。
  6. 云端提交成功、本地 revision 尚未保存即崩溃后的幂等恢复。
  7. `keep-local`、`use-cloud`、`keep-both` 三种冲突处理。
  8. 冲突处理期间远端再次变化，重新进入 conflict。
  9. dirty 状态退出登录并再次登录后继续同步。
  10. 账号切换后旧请求返回，不得污染新账号。
  11. 两个 Web 标签同时同步，以及 leader 异常退出后的锁接管。
  12. 匿名用户、用户 A 和用户 B 的 RLS 越权测试。
  13. 客户端没有 DELETE 权限，无法删除云端快照。
  14. 本地文件损坏、恢复副本恢复和旧版数据回退。
  15. Tauri Stronghold 初始化、Session 保存/删除，以及普通数据文件中不存在 token。
  16. Tauri CSP 允许目标 Supabase 域名，拒绝非白名单连接。
  17. Web 与 Tauri 的导入导出格式继续互通。
### 7.3 性能测试（如适用）
- 使用约 100 KiB、1 MiB 和 2 MiB 三档规范化快照测试。
- 2 MiB 本地数据空间加载 P95 不超过 300 ms。
- 单次规范化与 SHA-256 计算 P95 不超过 100 ms。
- 常规本地业务操作不等待网络响应；同一账号并发云请求数始终不超过 1。
- 高频访问次数更新继续合并批量保存，不产生逐次上传。
- 连续编辑 100 次只触发 debounce 合并后的少量同步任务。
- 断网一小时不丢失 dirty 状态，不无限创建计时器或请求。
- 重复登录退出、账号切换和冲突重试后，无残留订阅和重复监听。
- 记录 Web 与 Tauri 的额外内存峰值基线，避免随着同步次数持续增长。
- 完成标准：
  - 现有测试和新增单元、集成测试全部通过。
  - Web 生产构建通过。
  - Tauri 编译和桌面端安全测试通过。
  - RLS 越权和 CAS 并发测试必须在真实测试项目验证，不能只依赖 Mock。

## 8. 可观测性 & 运维 (Observability & Operations)

### 8.1 可观测性
- 首期不接入重型监控或用户行为分析平台，以页面同步状态、本地诊断日志和 Supabase 平台监控为主。
- 用户可见状态：
  - 账号区域持续展示当前账号或游客身份，以及 `idle`、`dirty`、`syncing`、`offline`、`conflict`、`error` 等同步状态。
  - 展示最近成功同步时间，并在可操作状态提供手动重试、冲突处理或数据恢复入口。
  - 不允许仅在控制台记录影响数据安全的错误而不通知用户。
- 本地结构化日志覆盖：
  - 应用初始化、数据空间迁移与切换。
  - Session 恢复、登录成功或失败、退出登录。
  - 首次迁移的开始、用户选择和结果。
  - 同步状态转换、上传、下载、CAS 冲突和重试。
  - generation 过期响应丢弃。
  - 本地存储、恢复副本和损坏数据恢复。
  - 跨标签锁获取、释放及租约接管。
- 日志采用统一结构：
  ```ts
  interface DiagnosticLog {
    timestamp: string
    level: 'debug' | 'info' | 'warn' | 'error'
    event: string
    runtime: 'web' | 'tauri'
    appVersion: string
    syncAttemptId?: string
    errorCode?: string
    durationMs?: number
    payloadBytes?: number
    localRevision?: number | null
    remoteRevision?: number | null
  }
  ```
- 日志隐私与保留：
  - 不记录 OTP、access token、refresh token、完整邮箱、完整 userId、链接内容或完整业务快照。
  - hash 和 deviceId 只显示短前缀，邮箱仅允许脱敏形式。
  - 本地最多保留 200 条或最近 7 天，任一上限达到后淘汰最旧记录。
  - 默认不向远端上传日志。
- 账号设置提供“导出诊断信息”，包含应用版本、运行环境、同步状态、最近同步时间、Schema、revision、dirty 状态、数据大小、恢复副本数量、最近错误码和耗时，以及 CSP 和 Supabase 配置完整性。诊断报告不得包含业务数据和登录凭据。
- 客户端维护会话级轻量指标：
  - `sync_attempt_total`、`sync_success_total`、`sync_failure_total`、`sync_conflict_total`。
  - `sync_duration_ms`、`sync_payload_bytes`、`dirty_age_seconds`。
  - `auth_failure_total`、`local_storage_failure_total`、`recovery_copy_total`。
  首期仅用于本地诊断；未来通过可选 `TelemetryAdapter` 接入集中监控，并要求明确配置和隐私说明。
- 使用 Supabase 控制台、邮件服务商和前端托管平台监控 OTP 发送失败、退信、认证限流、数据库函数错误、RLS 拒绝、数据库容量和站点可用性。
- 若未来启用集中指标，建议告警阈值：
  - 15 分钟同步失败率超过 5%。
  - 同步耗时 P95 超过 5 秒。
  - 冲突率持续超过 5%。
  - dirty 状态超过 24 小时仍未成功同步。
  - 快照表或项目资源达到当前套餐限制的 70%。
  告警只包含项目、环境、错误码和聚合数量，不包含用户快照或凭据。

### 8.2 配置参数 (Configuration)
| 参数名 | 类型 | 默认值 | 说明 | 是否支持动态修改 |
|--------|------|--------|------|------------------|
| `VITE_SUPABASE_URL` | string | 空 | Supabase 项目 HTTPS 地址 | 否（重新构建） |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | string | 空 | 前端可公开的 publishable/anon key | 否（重新构建） |
| `VITE_SYNC_ENABLED` | bool | true | 云同步功能开关 | 否（重新构建） |
| `VITE_TELEMETRY_ENABLED` | bool | false | 预留远端诊断开关，首期关闭 | 否（重新构建） |
| `VITE_TELEMETRY_ENDPOINT` | string | 空 | 预留诊断接收地址 | 否（重新构建） |

- URL 或 publishable key 缺失时，云同步自动进入 `disabled`，本地功能保持正常。
- 生产环境 URL 必须使用 HTTPS；Tauri `connect-src` 只允许配置中的 Supabase 项目域名。
- 前端环境严禁包含 service-role key、数据库密码和 SMTP 密码。
- development、staging、production 使用不同 Supabase 项目。
- 配置校验失败只禁用云同步，不阻止应用启动。
- 应用内部常量：

  | 参数 | 默认值 |
  |------|--------|
  | 同步 debounce | 1500 ms |
  | 最大快照 | 2,097,152 bytes |
  | 最大重试间隔 | 30,000 ms |
  | 恢复副本上限 | 5 |
  | 本地诊断日志上限 | 200 条 |
  | 本地诊断保留时间 | 7 天 |
  | Web 跨标签租约 | 15 秒 |
  | 租约心跳 | 5 秒 |
  | OTP 重发倒计时 | 60 秒 |

  这些参数集中定义在同步配置模块，首期不开放给普通用户修改。
- Supabase 项目配置：
  - Email OTP 模板使用 `{{ .Token }}`，有效期 600 秒，请求间隔 60 秒。
  - `user_snapshots` 启用 RLS，仅为 authenticated 角色授予 SELECT、INSERT、UPDATE。
  - CAS 函数使用 `SECURITY INVOKER`，不授予客户端 DELETE 或 service-role 权限。
  - SMTP 凭据只保存在 Supabase 项目设置。
  - 表、函数和策略通过版本化 SQL migration 管理。
- Tauri 配置：
  - CSP `connect-src` 由 Supabase URL 生成或显式配置为同一精确域名。
  - Stronghold 只授予 Session 存取所需的最小 capability。
  - Stronghold 解锁材料由原生层设备密钥或系统凭据存储提供，不写入前端环境变量、源码或普通配置文件。
  - Stronghold 或 CSP 配置失败时禁用桌面云同步，并显示明确诊断信息。

### 8.3 运维接口 (Operations Interfaces)
- 首期不新增独立运维 HTTP 服务、管理后台或 Edge Function。
- 用户侧运维入口统一放在账号设置：
  - 查看账号、同步状态、最近同步时间、当前 revision 和数据大小。
  - 立即同步、重新登录和退出登录。
  - 处理首次迁移与 revision 冲突。
  - 查看、恢复或导出本地恢复副本。
  - 导出业务数据和脱敏诊断报告。
- 云端唯一自定义调用接口为 `compare_and_swap_user_snapshot` 数据库函数。函数从认证上下文获取用户 ID，并返回更新后的 revision、hash、服务端时间和设备 ID；revision 不匹配时返回明确冲突结果。
- 数据库运维通过 Supabase CLI 和版本化 migration 完成：
  ```
  supabase start
  supabase db reset
  supabase migration up
  supabase db push
  ```
- 本地和 CI 使用 `db reset` 验证 migration、RLS 和数据库测试；生产发布只执行已评审 migration。
- 平台侧使用 Supabase Dashboard 查看认证、数据库日志、容量和邮件配置；前端托管平台负责构建版本、环境变量、可用性和回滚。
- 首期客户端不提供删除云端快照、跨用户查询或管理员操作。删除账号需要先导出用户数据，再通过受控管理流程删除 Auth 用户，由外键级联删除快照。

### 8.4 运维注意事项 (Operations Considerations)
- 发布顺序：
  1. 在 staging 应用并验证数据库 migration、RLS 和 CAS 测试。
  2. 生产数据库只应用向后兼容的新增表、函数和策略。
  3. 配置 OTP 模板、SMTP、过期时间和限流。
  4. 构建 Web/Tauri，注入项目 URL 与 publishable key，并生成精确 CSP。
  5. 完成游客模式、OTP、首次迁移、离线编辑、两设备冲突和退出登录冒烟测试。
  6. 再逐步开放 `VITE_SYNC_ENABLED` 的生产构建。
- 升级兼容：
  - 数据库 migration 在至少一个客户端发布周期内保持旧客户端可读写，不直接删除或重命名现有字段。
  - 业务 Snapshot v2 与现有导入导出格式保持不变；本地封装通过 `localFormatVersion` 独立迁移。
  - 新客户端遇到旧数据时执行幂等迁移，旧客户端遇到更高业务 Schema 时必须拒绝写入。
- 回滚：
  - 前端可回滚到上一个构建产物；已创建的快照表和新增字段保留，不在紧急回滚中执行破坏性数据库降级。
  - 云同步故障时发布 `VITE_SYNC_ENABLED=false` 的构建，或关闭入口；用户仍可使用各自本地数据空间。
  - 在确认云端内容合法前，禁止用空白数据批量修复；优先使用本地数据、恢复副本和平台备份。
- 数据与备份：
  - 用户可随时导出业务快照。
  - 根据 Supabase 套餐启用平台备份，并定期验证快照表恢复流程。
  - 删除 Auth 用户前必须确认导出或保留策略；删除后由外键级联移除其唯一云端快照。
  - 本地恢复副本按每空间五份轮转，不视为跨设备备份。
- 资源影响：
  - 每用户一行 JSONB，主要资源消耗与用户数、平均快照大小和同步频率近似线性相关。
  - 2 MiB 上限同时约束客户端内存、序列化、网络流量和数据库行大小。
  - 首期不建立 payload 内部索引、不启用实时订阅，减少数据库和网络开销。
- 安全运维：
  - publishable key 泄露时优先审计 RLS；service-role key、数据库密码或 SMTP 密码泄露时必须立即轮换。
  - 所有 migration 必须经过跨用户 RLS 测试，禁止在前端或 CI 日志输出密钥。
  - CSP、Stronghold capability 和 Supabase URL 变更必须随 Web/Tauri 构建共同验证。
- 故障处理：
  - Auth 或邮件故障：保留游客和已登录账号的本地使用能力，暂停新的 OTP 登录。
  - Supabase 数据库故障：保持 dirty 并退避重试，禁止自动清空或覆盖。
  - 同步错误率异常：先禁用自动同步入口，再检查数据库函数、RLS、Schema 和最近 migration。
  - 远端数据损坏：隔离该账号同步，导出本地数据并从可信副本恢复。
  - 大量冲突：停止自动重试，检查客户端版本分布、revision 元数据和跨标签锁。
  - 桌面凭据存储异常：清理失效 Session 后重新登录，不删除用户业务数据空间。

## 9. Changelog
| 日期 | 变更项 | 最终状态 |
|------|--------|----------|
| 2026-07-31 | **方案概览** | 确认采用本地优先、独立同步层和 Supabase 适配器；业务 Store 保持本地即时数据源，云端按完整快照最终一致同步 |
| 2026-07-31 | **核心模块设计** | 账号会话、业务 Store、本地数据空间、同步协调、云端适配、账号 UI 与运行时配置分离；Supabase SDK 限定在基础设施层 |
| 2026-07-31 | **接口设计** | 确认账号门面、认证、本地数据空间、业务 Store、同步协调和云端快照仓库的最小契约，并统一错误码与向后兼容边界 |
| 2026-07-31 | **数据模型** | 业务 Snapshot v2 保持不变；新增账号隔离的本地封装、设备元数据、单行云端快照表和本地恢复副本，采用 revision 与确定性哈希支持同步 |
| 2026-07-31 | **并发模型** | 采用本地串行写、账号级同步互斥、Web 跨标签锁和云端 revision CAS；账号 generation 隔离迟到响应，离线修改和退出登录不阻塞本地使用 |
| 2026-07-31 | **错误处理** | 同步错误不影响本地使用，本地持久化失败则回滚修改；明确认证、网络、权限、冲突、Schema、容量和数据损坏的重试与恢复边界 |
| 2026-07-31 | **核心逻辑** | 确认启动、OTP 登录、首次迁移、同步决策、CAS 上传、云端下载、冲突处理、退出登录和确定性哈希的完整执行路径 |
| 2026-07-31 | **方案优劣** | 确认轻量快照同步在本地体验、成本和渐进接入上的优势，并明确整份冲突、容量、云端历史、协作与端到端加密限制 |
| 2026-07-31 | **备选方案** | 对比纯本地、单快照、规范化表、自建后端、网盘文件与端到端加密方案，确认当前采用 Supabase 单用户快照 |
| 2026-07-31 | **业界调研** | 使用 Supabase、PostgreSQL、CouchDB、Firestore、W3C 与 Tauri 官方资料验证设计；补充 OTP、RLS、CAS、跨标签回退、Stronghold 和 CSP 约束 |
| 2026-07-31 | **测试计划** | 确认单元、Mock 集成、真实 Supabase 安全与并发、Web/Tauri 兼容、性能和稳定性测试范围及完成标准 |
| 2026-07-31 | **可观测性** | 采用用户可见同步状态、本地脱敏诊断日志与报告、会话级指标和 Supabase 平台监控；默认不上传业务或诊断数据 |
| 2026-07-31 | **配置参数** | 区分前端部署配置、应用内部常量、Supabase 项目设置与 Tauri 安全配置；缺少或错误配置时仅禁用云同步 |
| 2026-07-31 | **运维接口** | 不新增独立管理服务；通过账号设置、单一 CAS 数据库函数、Supabase CLI/Dashboard 和托管平台完成用户及平台运维 |
| 2026-07-31 | **运维注意事项** | 明确 staging 优先发布、向后兼容 migration、非破坏回滚、备份、安全轮换、资源边界与常见故障处置流程 |
| 2026-08-18 | **同步数据范围** | 根据用户数据持久化目标，将当前 Schema v2 已有的成长记录纳入账号快照与跨设备同步 |

## 10. 参考资料 (References)
- [Supabase Passwordless Email Logins](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/17/transaction-iso.html)
- [Apache CouchDB Replication and Conflict Model](https://docs.couchdb.org/en/stable/replication/conflicts.html)
- [Cloud Firestore Offline Data](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [W3C Web Locks API](https://www.w3.org/TR/web-locks/)
- [Tauri Stronghold Plugin](https://v2.tauri.app/plugin/stronghold/)
- [Tauri Content Security Policy](https://v2.tauri.app/security/csp/)
