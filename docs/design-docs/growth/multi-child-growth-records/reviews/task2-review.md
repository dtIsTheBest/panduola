# Task 2 Code Review Report: 多孩快照持久化与云同步

> **Review Date**: 2026-08-20
> **Task**: Task 2 — 贯通本地持久化与云同步兼容
> **Scope**: panduola，本地/Tauri 数据空间、快照摘要、云仓库与同步测试
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/sync/snapshot.js` — 历史可读快照 canonical/hash 契约。
2. `src/data/dataSpaceRepository.js` — v3 本地门禁与历史迁移。
3. `src/sync/cloudSnapshotRepository.js` — 原始 hash 验证、迁移与当前 v3 规范化绑定。
4. `tests/*` — Web/Tauri envelope、云端 v2 golden hash、v3 上传与同步 fixture。

### 关联文档

- Spec: `spec.md` §4.2.3～4.3、§7.2、§8.4。
- Tasks: `tasks.md` Task 2。

### 关键设计决策

1. 历史 v1/v2 hash 永远表示远端原始 payload，迁移后由协调器显式上传 v3。
2. 当前 v3 必须规范化前后 hash 相同，禁止静默修正后宣称 clean。
3. Web/Tauri envelope 迁移只改变业务 snapshot，保留 revision 与 sync metadata。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

**F-4** (P2) — 当前 v3 load 对原始和规范化内容执行两次摘要。

### 2.2 健壮性类 (Robustness)

**F-1** (P1) — 当前 v3 非规范 payload 可能返回变更后 snapshot 与原 hash。

**F-2** (P1) — v2 hash 测试使用同一生产 helper 自证。

**F-3** (P1) — 未覆盖已存在 Web/Tauri v2 envelope 主路径。

### 2.3 工程规范类 (Standards)

无。

### 2.4 契约破坏类 (Contract)

无。

### 2.5 需求/设计符合度类 (Spec Compliance)

无。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | v3 hash 与 snapshot 脱节 | 当前 v3 比较规范化后 hash，历史版本只保留原 hash | 设计考虑不足 |
| F-2 | P1 | hash 测试自证 | 固定 golden canonical，并用 Node crypto 独立计算 | 执行遗漏 |
| F-3 | P1 | 主迁移路径缺测 | 增加 Web/Tauri v2 envelope metadata 保留测试 | 执行遗漏 |

---

## 4. Round 2: Re-review

- correctness-reviewer：PASS。
- quality-reviewer：PASS。
- 定向测试：88/88 PASS。

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1～F-3 | robustness | P1 | keep/fixed | Round 2 双 reviewer PASS，新增独立与主路径测试 |
| F-4 | performance | P2 | follow-up | 2 MiB 性能基线通过，后续可用 canonical 比较减少摘要 |

---

## 6. 总体结论: PASS

本地、Tauri 与云端历史快照可安全迁移到 v3，当前 v3 保持严格 hash 绑定。

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
| F-4 | 当前 v3 用 canonical 比较替代第二次 SHA-256 | P2 | 性能基线超标时 |

---

## 9. Review Summary

- **Review 轮次**: 2 轮。
- **P0 修复**: 0 项。
- **P1 修复**: 3 项。
- **P2 keep**: 1 项 follow-up。
- **最终结论**: PASS。

## 10. Phase 3 Test Result

- Task 2 定向测试：88/88 PASS。
- `npm run build`：PASS。
- JS 语法检查、`git diff --check`：PASS。
