# Task 4 Code Review Report: 评论建议墙与私有亲子照片墙

> **Review Date**: 2026-10-10
> **Task**: Task 4 — 完成部署、回滚与生产隔离验证
> **Scope**: 20 个暂存文件，6138 insertions / 13 deletions
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `.env.example` — 增加公开社区开关示例。
2. `docs/deployment/community-walls.md` — migration、EdgeOne、生产冒烟、止写和无损回滚手册。
3. `docs/design-docs/platform/community-walls/` — spec、tasks 与四阶段评审记录。
4. Task 1～3 的数据库、Repository、图片处理、Vue UI 与测试文件。

### 关联文档

- Spec: `spec.md` §5～10
- Tasks: `tasks.md` Task 4（4 个子任务、7 个验收标准）

### 关键设计决策

1. 生产顺序为 migration → 远端 lint → 前端 main → EdgeOne 冒烟。
2. `VITE_COMMUNITY_ENABLED=false` 仅作为网络 kill switch；恢复 AI 体验需要回退前端 commit 或挂载。
3. 回滚不删除评论、照片元数据、private Bucket 或对象。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

无。

### 2.2 健壮性类 (Robustness)

无。

### 2.3 工程规范类 (Standards)

**F-2** (P1) — 两份无关文档可能被误暂存
- **位置**: 工作区 Git 状态
- **问题**: `git add .` 会把不属于本功能的 Vibe Coding 文档带入发布。
- **证据**: 一份 modified、一份 untracked，Tasks 明确要求排除。

**F-4** (P2) — 未暂存新增文件时 diff check 证据不完整
- **位置**: Task 2/3 review 记录
- **问题**: 普通 `git diff --check` 不覆盖 untracked 文件。
- **证据**: 主要新增代码在精确 stage 前均为 untracked。

### 2.4 契约破坏类 (Contract)

**F-1** (P1) — 双账号冒烟在隔离检查前删除 A 夹具
- **位置**: `docs/deployment/community-walls.md` §5
- **问题**: B 阶段无法验证 A 留言可见和照片不可见。
- **证据**: 原步骤在 A 阶段末尾先清理全部测试数据。

**F-3** (P2) — kill switch 与完整 UI 回滚混淆
- **位置**: `docs/deployment/community-walls.md` §7
- **问题**: 环境变量关闭只显示不可用双墙，不会恢复 AI。
- **证据**: Dashboard 无条件挂载 CommunityHub。

### 2.5 需求/设计符合度类 (Spec Compliance)

无。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 冒烟顺序无效 | 保留 A 夹具完成 B 与反向隔离后再分账号清理 | 设计考虑不足 |
| F-2 | P1 | 无关文件可能污染提交 | 使用显式文件清单 stage，并核对 cached name-status | 执行遗漏 |
| F-3 | P2 | 止用与回滚混淆 | 分开描述 kill switch 和 commit/AIExperience 真回滚 | 规范未遵守 |
| F-4 | P2 | diff check 未覆盖 untracked | 精确 stage 后执行 `git diff --cached --check` | 执行遗漏 |

---

## 4. Round 2: Re-review

- 两位 reviewer 确认四项 finding 均已修复。
- 两份 Vibe Coding 文档未进入 index。
- cached diff 无格式错误，暂存范围未发现真实凭据或个人信息。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | contract | P1 | keep/fixed | 无夹具时跨账号不可见属于假阳性，必须调整顺序。 |
| F-2 | standards | P1 | keep/fixed | 用户改动必须保留且不进入本次提交。 |
| F-3 | contract | P2 | keep/fixed | 实现中环境变量不会改变 Dashboard 挂载。 |
| F-4 | standards | P2 | keep/fixed | cached check 才覆盖本次全部新增文件。 |

---

## 6. 总体结论: PASS

发布和回滚文档可执行，暂存边界准确，生产数据库部署已完成。

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

- 前端推送并由 EdgeOne 完成构建后执行正式域名匿名冒烟。
- 双账号生产写入/照片隔离需要使用两个测试账号按部署手册执行，不使用真实儿童照片。

---

## 9. Review Summary

- **Review 轮次**: 2 轮
- **P0 修复**: 0 项
- **P1 修复**: 2 项
- **P2 keep**: 0 项（2 项已修复）
- **Follow-up**: 2 项生产冒烟
- **最终结论**: PASS

## 10. Verification

- 生产 Supabase `202610100003` migration：已应用，local/remote history 一致。
- 生产 Supabase lint：PASS。
- 本地 pgTAP：3 文件、114 assertions PASS。
- Node 全量测试：189/189 PASS。
- 生产构建：PASS。
- `git diff --cached --check`：PASS。
- 敏感信息扫描：未发现真实 JWT、API Key、邮箱、数据库密码或签名 URL。
