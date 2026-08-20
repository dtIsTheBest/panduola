# Task 6 Code Review Report: 生产 AI 延迟修复

> **Review Date**: 2026-08-20
> **Task**: Task 6 — 修复生产 AI 正常问题超时
> **Scope**: panduola，Edge Function 方舟适配器、运行时配置、契约测试与交付文档
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `supabase/functions/_shared/arkClient.js` — 增加显式思考模式能力配置。
2. `supabase/functions/ai-growth-assistant/index.ts` — 从 Secret 注入思考模式。
3. `tests/ai-function-core.test.js` — 覆盖配置开启、默认省略和未知值。
4. `docs/design-docs/platform/in-site-ai-assistant/spec.md` — 记录模型能力配置与 A/B 约束。
5. `docs/design-docs/platform/in-site-ai-assistant/tasks.md` — 增加 Task 6。
6. `docs/deployment/in-site-ai-assistant.md` — 补充配置与回滚方式。
7. `docs/troubleshooting-ai-timeout-20260820.md` — 记录生产证据链。

### 关联文档

- Spec: `spec.md` §3.2、§4.2.5、§4.3、§7、§8.4。
- Tasks: `tasks.md` Task 6（3 个子任务、5 个验收标准）。

### 关键设计决策

1. 不继续扩大到 30～60 秒等待，而是对当前模型验证关闭默认深度思考的低延迟路径。
2. `thinking` 默认不发送，仅由服务端 `ARK_THINKING_MODE=disabled` 显式开启。
3. 未知配置降级为 `AI_NOT_CONFIGURED`；切换模型时可直接 unset 回滚。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

无。

### 2.2 健壮性类 (Robustness)

**F-1** (P1) — Seed 2.0 Chat 的 thinking 兼容性尚未真实验证。
- **位置**: `supabase/functions/_shared/arkClient.js`
- **问题**: mock 只能证明 JSON 序列化，不能证明生产模型接受参数。
- **证据**: 官方 Responses 示例明确展示 Seed 2.0 的 thinking 参数，Chat 契约为模型能力相关字段。

### 2.3 工程规范类 (Standards)

**F-2** (P1) — 模型特定字段无条件应用于任意模型。
- **位置**: `supabase/functions/_shared/arkClient.js`
- **问题**: 未来 `ARK_MODEL_ID` 切换到不兼容模型时可能返回 Provider 4xx。
- **证据**: 原实现无配置门禁，所有模型请求均携带 thinking。

### 2.4 契约破坏类 (Contract)

无。

### 2.5 需求/设计符合度类 (Spec Compliance)

**F-3** (P1) — Spec、Task 与排障记录提前宣称修复成立。
- **位置**: `spec.md`、`tasks.md`、`troubleshooting-ai-timeout-20260820.md`
- **问题**: 生产 A/B 尚未完成，文档结论成熟度不一致。
- **证据**: 排障记录仍把思考模式列为待验证，Task 却写为既定修复。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 兼容性未经真实验证 | 将生产同问题 A/B 保留为 Task 验收标准 | 设计考虑不足 |
| F-2 | P1 | 模型能力无条件发送 | 增加显式 Secret 配置、默认省略、未知值降级和回滚 | 设计考虑不足 |
| F-3 | P1 | 文档提前宣称成功 | Spec、Task 和排障记录统一改为待生产 A/B | 执行遗漏 |

---

## 4. Round 2: Re-review

- correctness-reviewer：原两项 P1 已关闭，无新增 P0/P1。
- quality-reviewer：原两项 P1 已关闭，无新增 P0/P1。
- 定向测试：20/20 PASS；`git diff --check` PASS。
- 结论：PASS。

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | robustness | P1 | keep/fixed | 生产 A/B 尚未完成，已保留为 Task 6 阻塞验收 |
| F-2 | standards | P1 | keep/fixed | `thinkingMode` 默认 undefined，只有 `disabled` 时写入请求体 |
| F-3 | spec-compliance | P1 | keep/fixed | 三份文档统一使用“待生产 A/B”表述 |

---

## 6. 总体结论: PASS

代码改动具备显式能力门禁和安全回滚路径，自动化测试与生产 A/B 均已通过。

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
| F-4 | 增加 `phase`、`timeoutSource` 与 Auth/RPC/Provider 分阶段耗时日志 | P2 | 后续可观测性任务 |

---

## 9. Review Summary

- **Review 轮次**: 2 轮（Round 1 3 项 P1 → 修复 3 项 → Round 2 PASS）。
- **P0 修复**: 0 项。
- **P1 修复**: 3 项。
- **P2 keep**: 1 项 follow-up。
- **Follow-up**: 1 项。
- **最终结论**: PASS。

## 10. Phase 3 Test Result

- `node --test tests/ai-function-core.test.js`：20/20 PASS。
- `npm test`：130/130 PASS。
- `npm run build`：PASS。
- 格式检查：PASS（本次无 Java/XML 变更）。
- 生产兼容性：`thinking=disabled` 请求返回 HTTP 200，未出现 Provider 4xx。
- 最终生产配置：20 秒 Provider deadline、300 tokens；同问题直调 3/3 PASS（9.527～12.581 秒）。
- 正式页面：回答在 16.319 秒显示，额度恢复为每天 3 次。
