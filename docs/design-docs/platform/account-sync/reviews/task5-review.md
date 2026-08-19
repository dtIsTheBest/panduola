# Task 5 Code Review Report: 本地优先账号与云端同步

> **Review Date**: 2026-07-31（2026-08-18 增量复审）
> **Task**: Task 5 — 实现 Supabase 认证与云端快照适配器
> **Scope**: panduola，7 个文件
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/account/config.js` — 增加统一 Supabase 请求期限。
2. `src/account/supabaseClient.js` — 实现延迟、可注入且带完整响应 deadline 的客户端。
3. `src/account/authAdapter.js` — 实现 OTP、Session、退出和认证订阅适配。
4. `src/sync/cloudSnapshotRepository.js` — 实现当前用户快照 load/create/CAS。
5. `package.json` — 增加 Supabase JavaScript v2 SDK。
6. `package-lock.json` — 锁定 SDK 及其依赖。
7. `tests/cloud-adapters.test.js` — Phase 3 补充适配器测试。

### 关联文档

- Spec: `spec.md` §3.1、§3.2、§4.1、§4.2.1、§4.2.2、§4.2.5、§4.3、§6.2、§7.1、§7.2
- Tasks: `tasks.md` Task 5（4 个子任务、7 个验收标准）

### 关键设计决策

1. Supabase Client 仅在首次需要云能力时动态加载和创建。
2. 页面可见 Session 仅包含 userId、email、expiresAt。
3. 云端仓库不接受 userId，依赖认证上下文和 RLS。
4. 原始远端 Schema、规范化结果、2 MiB 和 SHA-256 均必须通过后才能返回。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

**F-4** (P2) — 写入成功后重复回传与处理完整快照
- **位置**: `src/sync/cloudSnapshotRepository.js`
- **问题**: create 回传完整 payload，create/CAS 随后再次规范化、序列化和哈希。
- **证据**: 最大 2 MiB 快照会产生不必要的下载和第二轮大对象处理。

### 2.2 健壮性类 (Robustness)

**F-2** (P1) — 远程调用缺少完整 deadline
- **位置**: `src/account/authAdapter.js`、`src/sync/cloudSnapshotRepository.js`
- **问题**: 半开连接或慢响应体可能让认证或同步 Promise 长期 pending。
- **证据**: 所有 Supabase 调用直接 await，未设置 AbortSignal 或请求期限。

**F-3** (P1) — 认证 listener 异常可能触发双重状态转换
- **位置**: `src/account/authAdapter.js`
- **问题**: listener 与 Session 转换位于同一 try/catch，listener 抛错后会被再次调用。
- **证据**: Supabase INITIAL_SESSION 还会在 subscriber callback 抛错时再次分发 null Session。

### 2.3 工程规范类 (Standards)

无。

### 2.4 契约破坏类 (Contract)

**F-1** (P0) — 未来 Schema 可被规范化器静默降级
- **位置**: `src/sync/cloudSnapshotRepository.js`
- **问题**: 原始 payload 在 Schema 校验前进入 `normalizeSnapshot`。
- **证据**: `normalizeData()` 会把 Schema v99 改写为当前 v2，随后通过元数据比较。

### 2.5 需求/设计符合度类 (Spec Compliance)

无。

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P0 | 未来 Schema 静默降级 | 在任何规范化前校验原始 Schema，并校验数据库元数据一致性 | 执行遗漏 |
| F-2 | P1 | 远程调用没有 deadline | 注入带 AbortController 的 fetch，并为仓库操作透传总 deadline | 设计考虑不足 |
| F-3 | P1 | listener 双重调用 | 分离 Session 转换与 listener 调用 | 执行遗漏 |
| F-4 | P2 | 重复回传、规范化和哈希 | 写操作仅返回元数据，复用已验证快照与 hash | 性能考虑不足 |

## 4. Round 2–4: Re-review

- **Round 2**：F-1、F-4 关闭；F-2 发现响应体读取不在期限内；F-3 发现 listener 异常仍会回流 SDK。
- **Round 3**：为 PostgREST/RPC 增加操作级 AbortSignal，并在 fetch deadline 内读取完整响应体；使用隔离的 `notify` 调用 listener。F-2、F-3 关闭。
- **F-5** (P0)：Round 3 的 Response 重建向 204/205/304 传入空 ArrayBuffer，违反 null-body status 约束并会破坏退出登录。
- **Round 4**：识别 null body、HEAD、204/205/304 后使用 `null` 重建 Response；F-5 关闭。
- **无新增 P0/P1**。
- **结论: PASS**。

### 4.1 Round 5: 权限映射测试增量复审

- **Review scope**：`tests/cloud-adapters.test.js` 新增 RLS 权限错误映射测试。
- **correctness-reviewer**：PASS，测试确实进入 `load()` 的权限错误映射分支，并验证 `UNAUTHORIZED`
  与不可重试契约。
- **quality-reviewer**：PASS，复用现有 fake client 和断言风格，未发现可读性、可维护性或性能问题。
- **Findings**：无。
- **结论**：PASS。

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | contract | P0 | keep/fixed | Spec §4.2.5 要求未来 Schema 停止同步，原实现在规范化前未校验 |
| F-2 | robustness | P1 | keep/fixed | Spec §3.2 与 §4.2.5 要求网络超时可恢复，原请求无期限 |
| F-3 | robustness | P1 | keep/fixed | Spec §4.2.2 要求订阅可安全注销，单事件不得产生双重状态提交 |
| F-4 | performance | P2 | keep/fixed | 2 MiB 上限下完整 payload 回传与二次哈希均可避免 |
| F-5 | robustness | P0 | keep/fixed | Fetch 标准禁止 204/205/304 响应携带 body，登出常见 204 |

## 6. 总体结论: PASS

全部成立问题已修复，两位 reviewer 在 Round 4 均返回 PASS。

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无。

### P2（建议改进）

无。

## 8. Follow-up Items

无。

## 9. Review Summary

- **Review 轮次**: 5 轮（其中 Round 5 为新增测试增量复审）
- **P0 修复**: 2 项
- **P1 修复**: 2 项
- **P2 keep**: 1 项，已一并修复
- **Follow-up**: 0 项
- **最终结论**: PASS

## 10. Phase 3 测试结果

- `node --test tests/cloud-adapters.test.js`：13/13 PASS。
- `npm test`：58/58 PASS。
- `npm run build`：PASS。
- `node --check tests/cloud-adapters.test.js`：PASS。
- 格式检查：PASS（本次无 Java/XML 变更）。
