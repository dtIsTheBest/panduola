# Task 1 Code Review Report: 站内 AI 成长助手

> **Review Date**: 2026-08-19
> **Task**: Task 1 — 建立 AI 每日额度与幂等数据库契约
> **Scope**: panduola，2 个 SQL 文件
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `supabase/migrations/202608190002_ai_usage_quota.sql` — 配额 ledger、索引、权限与原子预占 RPC。
2. `supabase/tests/ai_usage_quota.sql` — 权限、边界、幂等和真实多连接竞态测试。

### 关联文档

- Spec: `spec.md` §3.1、§3.2、§4.2.3、§4.2.4、§7.2、§8.4。
- Tasks: `tasks.md` Task 1（3 个子任务、5 个验收标准）。

### 关键设计决策

1. 只保存 HMAC 主体、请求 UUID、actor 类型和 UTC 日期，不保存问题、回答或身份原文。
2. requestId 与 actor/day 使用固定顺序的双 advisory transaction lock。
3. 配额在短事务中预占，模型远程调用不进入数据库事务。
4. 表和 RPC 仅对 service role 开放最小权限。

---

## 2. Round 1–3: Findings

### 2.1 性能类

**F-4 (P2)** — 缺少以日期为前导列的过期清理索引。

### 2.2 健壮性类

**F-1 (P1)** — service role 未先撤销默认权限，可能保留 UPDATE/DELETE。

**F-2 (P1)** — 初版测试只检查锁源码，没有实际并发竞争。

**F-3 (P1)** — actor/day 竞态未覆盖不同 actor 复用同 requestId 的并发边界。

**F-5 (P1)** — 异步查询逐个发送但无统一起跑屏障，可能退化为顺序执行。

### 2.3 工程规范类

**F-6 (P2)** — dblink 连接依赖 Supabase 本地 Docker 的固定端口。

### 2.4 契约破坏类

无。

### 2.5 需求/设计符合度类

无。

---

## 3. Round 1–3 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | service role 可能继承额外权限 | 先 REVOKE ALL，再只授予 SELECT/INSERT/EXECUTE，并反向断言其他权限不存在 | 设计考虑不足 |
| F-2 | P1 | 无真实并发测试 | 使用 dblink 四独立连接竞争同 actor/day | 执行遗漏 |
| F-3 | P1 | 未覆盖 requestId 竞态 | 两 actor 同 requestId 并发，断言一 winner、一 duplicate、一行 | 执行遗漏 |
| F-4 | P2 | 清理可能全表扫描 | 增加 `usage_date` 单列索引 | 设计考虑不足 |
| F-5 | P1 | 异步发送未保证同时起跑 | 主会话持有 gate，确认所有远端 waiter 后统一释放 | 执行遗漏 |

---

## 4. Round 4: Re-review

- 双 reviewer 均确认 actor/day 与 requestId 两类锁边界有真实竞态覆盖。
- 异步结果完整 drain，随机测试主体避免失败后污染下次执行。
- service role 权限已收敛到最小集合。
- **结论: PASS**。

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1～F-5 | robustness/performance | P1/P2 | keep/fixed | Round 4 双 reviewer PASS，真实 pgTAP 通过 |
| F-6 | standards | P2 | follow-up | 测试明确以 Supabase CLI 本地 Docker 为运行环境 |

---

## 6. 总体结论: PASS

所有 P0/P1 均已修复；生产 SQL 与并发测试符合 Task 1 契约。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无。

### P2（建议改进）

无阻断项。

---

## 8. Follow-up Items

| ID | 内容 | 优先级 | 建议处理时机 |
|----|------|--------|-------------|
| F-6 | dblink 固定使用 Supabase 本地 Docker 主机映射端口 | P2 | 引入非 Supabase CI 数据库时适配 |
| F-7 | start gate waiter 计数未按具体 advisory key 过滤 | P2 | 测试迁移到共享数据库前增强 |

---

## 9. Review Summary

- **Review 轮次**: 4 轮。
- **P0 修复**: 0 项。
- **P1 修复**: 4 项。
- **P2 keep**: 0 项。
- **Follow-up**: 2 项。
- **最终结论**: PASS。

## 10. Phase 3 Test Result

- `supabase db reset`：两份 migration 应用成功。
- `supabase test db`：2 个文件、55 个断言全部通过。
