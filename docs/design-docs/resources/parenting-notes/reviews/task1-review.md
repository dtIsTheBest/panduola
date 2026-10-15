# Task 1 Code Review Report: 私有育儿手记数据域

> **Review Date**: 2026-10-15
> **Task**: Task 1 — 建立私有手记数据域与安全仓库
> **Scope**: panduola，Repository、链接解析、Supabase migration、pgTAP 与单元测试
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/notes/parentingNotesRepository.js` — 私有手记与图片持久化、失败恢复和签名 URL。
2. `src/notes/noteContent.js` — 安全基础链接解析与摘要生成。
3. `supabase/migrations/202610150001_parenting_notes.sql` — RLS、私有 Bucket 与中断恢复。
4. `supabase/tests/parenting_notes.sql` — 双账号数据面隔离测试。
5. `tests/parenting-notes.test.js` — 仓库多阶段写入和内容解析测试。
6. `src/main.js` — Repository 注入。

### 关联文档

- Spec: `spec.md` §3、§4、§7
- Tasks: `tasks.md` Task 1

### 关键设计决策

1. 手记与图片不进入账号快照，避免改变 Schema 和快照 hash。
2. 图片使用独立 private Bucket；未知上传结果保留 pending 元数据供恢复。
3. 正文仅解析 HTTP(S) 链接 token，禁止渲染 HTML。

## 2. Round 1: Findings

### 2.1 性能类

- 无。

### 2.2 健壮性类

- **F-1 (P1)**：上传结果未知时删除 reservation，可能产生 Storage 孤儿对象。
- **F-2 (P1)**：正文提交后回读失败被当作保存失败，重试可能重复创建。
- **F-3 (P1)**：pending 图片占用隐藏槽位，用户无法理解重试失败。
- **F-4 (P1)**：删除含 pending 图片的手记可能丢失对象清理路径。

### 2.3 工程规范类

- **F-5 (P1)**：多阶段创建、更新、删除与部分失败测试不足。

### 2.4 契约破坏类

- **F-6 (P2)**：100 篇上限时同 ID upsert 会被 INSERT trigger 提前拒绝。

### 2.5 需求/设计符合度类

- **F-7 (P1)**：pgTAP 未执行真实双账号 RLS/Storage 数据面验证。

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 上传未知结果可能孤儿 | 保留 pending，增加 recovery RPC；finalize 未知结果同样保留元数据 | 设计考虑不足 |
| F-2 | P1 | 已提交操作被误报失败 | 编辑器使用稳定 UUID，创建改用 upsert；提交后刷新失败单独返回 | 设计考虑不足 |
| F-3 | P1 | pending 槽位不可见 | DTO 暴露数量，UI 明确占位并阻止冲突补传 | 执行遗漏 |
| F-4 | P1 | pending 删除丢清理路径 | 删除前 recovery；仍 pending 时暂缓删除并返回可重试错误 | 设计考虑不足 |
| F-5 | P1 | 核心流程测试不足 | 补充 unknown upload、幂等创建、混合更新与 Storage-first 删除测试 | 执行遗漏 |
| F-6 | P2 | upsert 触发上限误判 | trigger 对同 ID、同用户的幂等重试跳过新增计数 | 执行遗漏 |
| F-7 | P1 | 隔离测试不足 | pgTAP 创建 A/B 用户并实际验证表、元数据与对象不可见 | 执行遗漏 |

## 4. Round 2/3: Re-review

- 三轮定向修复后，所有 P0/P1 均关闭。
- 正确性 reviewer：PASS。
- 质量 reviewer：PASS。
- 无新增 finding。

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | robustness | P1 | keep / fixed | unknown outcome 必须保留可恢复路径 |
| F-2 | contract | P1 | keep / fixed | Postgres 与 Storage 多阶段提交需要区分 committed 与 refresh |
| F-3 | spec-compliance | P1 | keep / fixed | UI 必须说明 pending 状态并计入上限 |
| F-4 | robustness | P1 | keep / fixed | pending metadata 是未知对象的唯一清理索引 |
| F-5 | standards | P1 | keep / fixed | Task 1 明确要求多阶段写入覆盖 |
| F-6 | contract | P2 | keep / fixed | BEFORE INSERT 早于 ON CONFLICT |
| F-7 | spec-compliance | P1 | keep / fixed | Spec §7.2 明确要求双账号行为验证 |

## 6. 总体结论: PASS

私有数据域、未知结果恢复、幂等语义和账号隔离均通过复审。

## 7. 正式问题

- P0：无。
- P1：无（历史 finding 均已修复）。
- P2：无。

## 8. Follow-up Items

- 无。

## 9. Review Summary

- **Review 轮次**: 3 轮
- **P0 修复**: 0 项
- **P1 修复**: 6 项
- **P2 修复**: 1 项
- **Follow-up**: 0 项
- **最终结论**: PASS

### 测试结果

- Node：209/209 PASS。
- Supabase pgTAP：131/131 PASS。
- 生产构建与数据库 lint：PASS。
