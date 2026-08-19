# Task 1 Code Review Report: 本地优先账号与云端同步

> **Review Date**: 2026-07-31  
> **Task**: Task 1 — 建立账号同步跨切面基础  
> **Scope**: panduola，4 个代码文件，+550/-0 行  
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/account/config.js` — 云同步配置、默认常量和安全降级。
2. `src/account/errors.js` — 统一错误码与 AppError。
3. `src/sync/snapshot.js` — 快照版本、确定性序列化、大小检查与 SHA-256。
4. `src/observability/diagnostics.js` — 脱敏诊断日志、会话指标与诊断报告。

### 关联文档

- Spec: `spec.md` §4.2.2、§4.2.3、§4.2.5、§4.3、§7.1、§8.1、§8.2。
- Tasks: `tasks.md` Task 1（5 个子任务、5 个验收标准）。

### 关键设计决策

1. 配置缺失或无效时只禁用云同步，本地功能继续使用。
2. 快照 hash 基于保持数组顺序、固定对象键顺序的 UTF-8 JSON。
3. 诊断数据使用字段白名单、事件白名单和有界本地保留，默认不上传。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

**F-7** (P2) — 快照准备重复执行 UTF-8 编码
- **位置**: `src/sync/snapshot.js:110`
- **问题**: 大小统计和 SHA-256 分别编码同一个最高 2 MiB 字符串。
- **证据**: 原实现分别在 `assertSnapshotSize` 和 `hashCanonicalSnapshot` 创建 `TextEncoder` 输出。

### 2.2 健壮性类 (Robustness)

**F-2** (P1) — SHA-256 拒绝未转换为 AppError
- **位置**: `src/sync/snapshot.js:103`
- **问题**: `subtle.digest()` 拒绝时直接传播普通 Error/DOMException。
- **证据**: 注入 rejecting subtle 后异常没有 `code`、`retryable` 和统一 cause。

**F-4** (P1) — 无效 maxEntries 可使日志失去上限
- **位置**: `src/observability/diagnostics.js:145`
- **问题**: `slice(-0)` 和 `slice(NaN)` 都不会产生预期的有界结果。
- **证据**: `maxEntries: 0` 连续记录后原实现仍保留全部记录。

**F-6** (P2) — 非有限 maxBytes 可绕过大小限制
- **位置**: `src/sync/snapshot.js:79`
- **问题**: `NaN` 或 `Infinity` 会令 `byteLength > maxBytes` 永远为 false。
- **证据**: 原实现没有验证 maxBytes 为正安全整数。

### 2.3 工程规范类 (Standards)

**F-3** (P1) — AppError cause 是可枚举属性
- **位置**: `src/account/errors.js:31`
- **问题**: 对错误对象执行展开或枚举时可能携带底层响应和敏感上下文。
- **证据**: 原实现通过普通赋值创建 `cause`，`Object.keys(error)` 会包含它。

### 2.4 契约破坏类 (Contract)

无。

### 2.5 需求/设计符合度类 (Spec Compliance)

**F-1** (P1) — 非 publishable key 被判为同步可用
- **位置**: `src/account/config.js:64`
- **问题**: 任意非空、未命中特权特征的字符串都会使 `isSyncAvailable=true`。
- **证据**: HTTPS URL 配合 `postgres-password` 可通过原配置判断，不符合只允许 publishable/anon key 的约束。

**F-5** (P1 candidate, drop) — Task 1 专项测试尚未创建
- **位置**: `tests/account-foundations.test.js`
- **问题**: reviewer 检查时专项测试文件尚不存在。
- **证据**: Task 1.5 明确仍为 pending；代码生成工作流要求测试在 review PASS 后的 Phase 3 生成，因此不是 Phase 1 实现遗漏。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | key 校验过宽 | 只接受 `sb_publishable_` 长格式或 role=anon legacy JWT，优先拒绝特权 key | 执行遗漏 |
| F-2 | P1 | digest 普通异常外泄 | 捕获拒绝并包装为带不可枚举 cause 的 AppError | 执行遗漏 |
| F-3 | P1 | cause 可枚举 | 使用 `Object.defineProperty` 创建不可枚举 cause | 设计考虑不足 |
| F-4 | P1 | 日志上限失效 | 校验非负安全整数并显式处理零上限 | 执行遗漏 |
| F-6 | P2 | maxBytes 可绕过 | 要求 maxBytes 为正安全整数 | 执行遗漏 |
| F-7 | P2 | 重复 UTF-8 编码 | `prepareSnapshot` 编码一次并复用于大小和 digest | 规范未遵守 |

---

## 4. Round 2: Re-review

- **F-1**：publishable、legacy anon、service-role、secret 和任意字符串路径验证通过。
- **F-2**：digest 拒绝统一包装为 AppError，cause 保持且不序列化。
- **F-3**：cause 不再出现在 `Object.keys` 或 `toJSON` 中。
- **F-4**：无效值回退默认，零上限稳定保留零条。
- **F-6**：非正数、NaN、Infinity 和非安全整数均被拒绝。
- **F-7**：准备路径仅产生一份 UTF-8 字节数组。
- **无新增 finding**。
- **结论: PASS**。

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | spec-compliance | P1 | keep，已修复 | Spec §8.2 仅允许 publishable/anon key；原 `config.js:73` 只检查非空 |
| F-2 | robustness | P1 | keep，已修复 | Spec §4.2.2 要求异步错误统一 AppError；原 digest 没有 catch |
| F-3 | standards | P1 | keep，已修复 | Spec §4.2.2 规定 cause 不直接暴露；普通赋值会被对象枚举 |
| F-4 | robustness | P1 | keep，已修复 | Spec §8.1 要求日志有界；零/NaN 上限原实现不成立 |
| F-5 | spec-compliance | P1 | drop | `tasks.md` Task 1.5 尚未开始，测试按工作流在 review 后生成 |
| F-6 | robustness | P2 | keep，已修复 | Spec §4.2.3 的 2 MiB 是强限制，参数入口不能允许绕过 |
| F-7 | performance | P2 | keep，已修复 | Spec §7.3 对 2 MiB hash 有性能目标，复用编码避免额外 O(n) 分配 |

---

## 6. 总体结论: PASS

两轮审查后所有成立问题均已修复，正确性和质量 reviewer 均返回 PASS。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无。

### P2（建议改进）

无。

---

## 8. Follow-up Items

无。

---

## 9. Review Summary

- **Review 轮次**: 2 轮（Round 1 7 项 candidate finding → keep 并修复 6 项 → Round 2 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 4 项
- **P2 keep**: 2 项，均已修复
- **Follow-up**: 0 项
- **最终结论**: PASS

## 10. Phase 3 测试结果

- 新增 `tests/account-foundations.test.js`，包含 13 项 Task 1 专项测试。
- `npm test`：27/27 PASS（13 项新增 + 14 项既有回归）。
- `npm run build`：PASS，Vite 生产构建无新 warning。
- `git diff --check`：PASS。
