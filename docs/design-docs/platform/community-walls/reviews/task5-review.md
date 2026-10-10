# Task 5 Code Review Report: 云快照升级与评论默认昵称

> **Review Date**: 2026-10-10
> **Task**: Task 5 — 修复云快照升级并优化评论默认昵称
> **Reviewers**: correctness-reviewer + quality-reviewer

---

## 1. Review Scope

### 改动文件清单

1. `src/data/store.js`、`src/sync/snapshot.js` — Snapshot Schema 5。
2. `src/sync/cloudSnapshotRepository.js`、`src/sync/syncCoordinator.js` — v4 读取、等价 CAS 和人工降级。
3. `src/data/dataSpaceRepository.js`、`src/components/AccountCenter.vue` — 升级恢复副本和提示。
4. `src/community/commentNickname.js` — 邮箱脱敏与按账号偏好。
5. `src/components/CommentWall.vue`、`CommunityHub.vue` — 紧凑昵称编辑体验。
6. 同步、数据空间和昵称相关测试。

### 关联文档

- Spec: `spec.md` §1.3、3.1、3.2、4.2、7.1、8.4
- Tasks: `tasks.md` Task 5（5 个子任务、7 个验收标准）

### 关键设计决策

1. v4 原始 payload hash 必须先通过，随后规范化为 v5。
2. 自动 CAS 必须同时满足 normalized hash、revision 和 lastSyncedHash 三重一致。
3. 任一内容分歧进入已有人工选择流程并创建恢复副本。
4. 默认评论昵称只保存脱敏值，不保存原始邮箱。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

无。

### 2.2 健壮性类 (Robustness)

**F-2** (P1) — `schema-upgrade` 未进入真实恢复原因白名单
- **位置**: `src/data/dataSpaceRepository.js`
- **问题**: 实际持久化会把升级备份降级成 `manual-import`。

**F-3** (P1) — 昵称存储失败仍提示持久化成功
- **位置**: `src/community/commentNickname.js`、`src/components/CommentWall.vue`
- **问题**: storage 缺失或 set/remove 失败后，刷新行为与 UI 提示不一致。

### 2.3 工程规范类 (Standards)

**F-4** (P2) — 昵称编辑器关闭后焦点未恢复
- **位置**: `src/components/CommentWall.vue`
- **问题**: v-if 移除编辑器后，键盘焦点可能落到 body，且缺少展开语义。

### 2.4 契约破坏类 (Contract)

**F-1** (P1) — 普通 Schema 5 首次同步被误标为旧版升级
- **位置**: `src/sync/syncCoordinator.js`、`src/components/AccountCenter.vue`
- **问题**: 仅以 sourceSchemaVersion 为整数判断升级，当前版本也会命中。

### 2.5 需求/设计符合度类 (Spec Compliance)

无。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 升级提示误判 | pending DTO 显式传递并判断 `requiresMigration` | 执行遗漏 |
| F-2 | P1 | 恢复原因丢失 | 加入共享白名单并使用真实 Web Repository 测试 | 执行遗漏 |
| F-3 | P1 | 昵称偏好虚报成功 | 统一失败返回值，区分已保存与仅本次生效 | 设计考虑不足 |
| F-4 | P2 | 昵称编辑焦点丢失 | 增加 expanded/controls，并统一 nextTick 恢复触发按钮 | 执行遗漏 |

---

## 4. Round 2: Re-review

- F-1～F-4 均验证通过。
- 无新增 finding。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | contract | P1 | keep/fixed | 当前 Schema 远端同样带整数版本，必须有显式迁移布尔值。 |
| F-2 | robustness | P1 | keep/fixed | fake store 无法证明恢复原因真实持久化。 |
| F-3 | robustness | P1 | keep/fixed | 持久化失败后刷新会恢复旧值，不能提示已保存。 |
| F-4 | standards | P2 | keep/fixed | 收起控件必须恢复键盘焦点并暴露展开状态。 |

---

## 6. 总体结论: PASS

Schema 5 升级和评论默认昵称满足安全、一致性与可访问性要求。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无未解决问题。

### P2（建议改进）

无未解决问题。

---

## 8. Follow-up Items

- 使用现有生产登录账号刷新页面，确认 v4 快照自动升级后同步状态恢复为“已同步”。
- 登录评论墙确认默认显示邮箱脱敏昵称，修改后刷新仍复用。

---

## 9. Review Summary

- **Review 轮次**: 2 轮
- **P0 修复**: 0 项
- **P1 修复**: 3 项
- **P2 keep**: 0 项（1 项已修复）
- **Follow-up**: 0 项
- **最终结论**: PASS

## 10. Test Results

- Node 全量测试：199/199 PASS。
- 生产构建：PASS。
- `git diff --check`：PASS。
- GitHub `main`：`508c12a` 已推送。
- EdgeOne：新资源包 `index-D5aFq_ju.js` 已生效。
