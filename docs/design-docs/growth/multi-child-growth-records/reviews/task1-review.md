# Task 1 Code Review Report: 多孩生长记录 Schema 与 Store

> **Review Date**: 2026-08-20
> **Task**: Task 1 — 建立 Schema v3 与多孩 Store 契约
> **Scope**: panduola，Schema、Store、本地版本门禁与核心测试
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/data/store.js` — Schema v3、孩子模型、迁移和 CRUD 不变量。
2. `src/sync/snapshot.js` — 当前支持版本升级到 3。
3. `src/data/dataSpaceRepository.js` — 本地版本门禁跟随统一常量。
4. `tests/growth-multi-child.test.js` — 迁移、边界、CRUD、兼容桥与回滚测试。
5. `tests/system-hardening.test.js` — 历史迁移断言升级。
6. `tests/account-foundations.test.js` — v3 canonical、hash 与未来版本测试。

### 关联文档

- Spec: `spec.md` §3、§4.1～4.3、§7.1。
- Tasks: `tasks.md` Task 1（4 个子任务、5 个验收标准）。

### 关键设计决策

1. v1/v2 迁移使用固定默认孩子，重复记录 ID 确定性重命名。
2. v3 可承载历史同日重复；新写入禁止扩大重复集合。
3. 单孩阶段兼容旧 UI 缺失 childId，多孩阶段缺参 fail-closed。

---

## 2. Round 1–2: Findings

### 2.1 性能类 (Performance)

**F-5** (P2) — 部分写入在最终完整快照标准化前执行重复线性校验。

### 2.2 健壮性类 (Robustness)

**F-1** (P0) — Store 强制 childId 后旧 UI 新增/删除全部失效。

**F-2** (P1) — 显式非整数 Schema 被当作历史 v1 静默迁移。

**F-3** (P1) — 旧版允许的重复 ID/同日记录会使迁移整份失败。

**F-6** (P1) — 历史同日重复记录保留后无法原日期编辑。

### 2.3 工程规范类 (Standards)

无。

### 2.4 契约破坏类 (Contract)

**F-4** (P1) — 边界、旧 UI 兼容和持久化失败回滚测试不足。

### 2.5 需求/设计符合度类 (Spec Compliance)

无。

---

## 3. Round 1–2 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P0 | 旧 UI 回归 | 单孩缺参确定性归属唯一孩子，多孩缺参拒绝 | 执行遗漏 |
| F-2 | P1 | 非法版本误迁移 | 仅字段缺失时按 v1；显式非法值 fail-closed | 设计考虑不足 |
| F-3 | P1 | 历史记录迁移失败 | 重复 ID 确定性重命名，历史同日记录保留 | Spec 理解偏差 |
| F-4 | P1 | 测试不足 | 增加 21 孩子、重复 ID、非法版本、原子回滚、并发和兼容桥测试 | 执行遗漏 |
| F-6 | P1 | grandfather 记录不可编辑 | 日期不变时允许编辑，新增/改日期继续判重 | 设计考虑不足 |

---

## 4. Round 3: Re-review

- correctness-reviewer：PASS，无新增 P0/P1。
- quality-reviewer：PASS，无新增 P0/P1。
- 定向测试：32/32 PASS；`git diff --check` PASS。

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1～F-4、F-6 | robustness/contract | P0/P1 | keep/fixed | Round 3 双 reviewer PASS，边界测试覆盖 |
| F-5 | performance | P2 | follow-up | 完整快照验证是安全边界，当前 2 MiB 规模仍为线性 |

---

## 6. 总体结论: PASS

Schema v3、历史迁移、Store 隔离和旧 UI 兼容满足 Task 1 验收要求。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无。

### P2（建议改进）

无阻塞项。

---

## 8. Follow-up Items

| ID | 内容 | 优先级 | 建议处理时机 |
|----|------|--------|-------------|
| F-5 | 评估大快照写入中的重复线性校验 | P2 | 性能基线超标时 |

---

## 9. Review Summary

- **Review 轮次**: 3 轮。
- **P0 修复**: 1 项。
- **P1 修复**: 4 项。
- **P2 keep**: 1 项 follow-up。
- **Follow-up**: 1 项。
- **最终结论**: PASS。

## 10. Phase 3 Test Result

- Task 1 定向测试：32/32 PASS。
- `npm run build`：PASS。
- JS 语法检查、`git diff --check`：PASS。
- 格式检查：PASS（本次无 Java/XML 变更）。
