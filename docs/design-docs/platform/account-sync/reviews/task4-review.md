# Task 4 Code Review Report: Supabase 快照表、RLS 与 CAS

> **Review Date**: 2026-07-31
> **Task**: Task 4 — 建立 Supabase 快照表、RLS 与 CAS 数据库函数
> **Scope**: panduola，2 个实现文件
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `supabase/config.toml` — 本地 Supabase Auth、PostgreSQL 和测试配置。
2. `supabase/migrations/202607310001_account_sync.sql` — 单用户快照表、RLS、权限和 CAS RPC。

### 关联文档

- Spec: `spec.md` §4.2.3、§4.2.4、§6.2、§7.2、§8.2、§8.3。
- Tasks: `tasks.md` Task 4（4 个子任务、6 个验收标准）。

### 关键设计决策

1. RLS 是跨用户数据库安全边界，第一方 `CloudSnapshotRepository` 以 CAS RPC 作为唯一更新契约。
2. CAS RPC 保持 `SECURITY INVOKER`，从 `auth.uid()` 获取用户，不接受目标 `user_id`。
3. 客户端负责精确的 2 MiB canonical JSON 约束，数据库使用独立 JSONB 存储尺寸护栏。

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

**F-3** (P1) — 数据库和客户端的 2 MiB 度量不一致
- **位置**: `supabase/migrations/202607310001_account_sync.sql:8`
- **问题**: `jsonb::text` 会增加格式空格并规范化数字，可能误拒客户端合法快照。
- **证据**: 客户端按无空格 canonical UTF-8 计量，PostgreSQL 使用不同的 JSONB 文本表示。

### 2.2 健壮性类 (Robustness)

**F-2** (P1) — 并发 CAS 输家可能返回旧 revision/hash
- **位置**: `supabase/migrations/202607310001_account_sync.sql:108`
- **问题**: data-modifying CTE 与冲突 SELECT 共享语句快照。
- **证据**: 条件 UPDATE 能保证单赢家，但输家后续 SELECT 不保证看到赢家提交后的元数据。

### 2.3 工程规范类 (Standards)

无。

### 2.4 契约破坏类 (Contract)

**F-1** (P1) — 自定义 GUC 不能作为不可伪造的 CAS 门禁
- **位置**: `supabase/migrations/202607310001_account_sync.sql:55`
- **问题**: 普通 PostgreSQL 角色可设置任意两段式自定义参数。
- **证据**: 设置与用户 ID 相同的 GUC 后可直接执行 revision 递增 UPDATE。

### 2.5 需求/设计符合度类 (Spec Compliance)

无。

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | GUC 门禁可伪造 | 删除 GUC 与 trigger；按批准设计明确 RLS 与第一方 CAS 契约的职责 | 设计考虑不足 |
| F-2 | P1 | 冲突元数据可能过期 | CAS 失败固定返回 `false` 和空元数据，由客户端独立 load | 执行遗漏 |
| F-3 | P1 | JSONB 文本计量误拒 | 首轮放宽为独立 4 MiB 护栏 | 设计考虑不足 |

## 4. Round 2/3: Re-review

- **F-1**：GUC/trigger 已完全移除；与 `SECURITY INVOKER` 和 authenticated UPDATE 的批准设计一致。
- **F-2**：冲突分支不再读取同语句快照，已关闭。
- **F-3**：Round 2 发现 4 MiB `jsonb::text` 仍会因指数数字展开而误拒并放大内存；Round 3 改为 `pg_column_size(payload)` 后关闭。
- **无新增 P0/P1**。
- **结论: PASS**。

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | contract | P1 | keep/fixed | 自定义 GUC 可由普通 SQL role 设置，不能提供不可伪造能力 |
| F-2 | robustness | P1 | keep/fixed | PostgreSQL data-modifying CTE 与主查询共享语句快照 |
| F-3 | performance | P1 | keep/fixed | canonical JSON 与 JSONB 文本输出并非同一字节表示 |

## 6. 总体结论: PASS

全部成立的 P1 已修复，两位 reviewer 在 Round 3 均返回 PASS。

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

- **Review 轮次**: 3 轮
- **P0 修复**: 0 项
- **P1 修复**: 3 项
- **P2 keep**: 0 项
- **Follow-up**: 0 项
- **最终结论**: PASS

## 10. Phase 3 测试进度

- 新增 `supabase/tests/account_sync.sql`，包含 27 个 pgTAP 断言，覆盖结构、权限、RLS、创建竞态、CAS 和失败回滚。
- Supabase CLI `2.101.0` 已成功读取项目配置。
- 已安装并启动 Docker Desktop，使用本地 Supabase PostgreSQL 完成真实数据库验证。
- `supabase db reset`：PASS，migration 可从空库重复应用。
- `supabase test db`：27/27 PASS。
- `supabase db lint --level error`：PASS，无 schema error。
- `npm test`：45/45 PASS。
- `npm run build`：PASS。
- `git diff --check`：PASS。
- Task 4 全部验收项完成。
