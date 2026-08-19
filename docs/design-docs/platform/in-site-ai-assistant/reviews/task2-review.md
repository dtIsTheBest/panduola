# Task 2 Code Review Report: 站内 AI 成长助手

> **Review Date**: 2026-08-19
> **Task**: Task 2 — 实现 Supabase Edge Function AI 网关
> **Scope**: panduola，5 个代码/配置/测试文件
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `supabase/functions/_shared/aiAssistantCore.js` — 输入、CORS、凭据、HMAC、body 限制和 deadline 工具。
2. `supabase/functions/_shared/aiAssistantHandler.js` — 可注入的认证、配额、模型与日志编排。
3. `supabase/functions/_shared/arkClient.js` — 火山方舟 Chat Completions 适配器。
4. `supabase/functions/ai-growth-assistant/index.ts` — Deno 组合根与依赖缓存。
5. `tests/ai-function-core.test.js` — 核心、适配器和 handler 单元测试。

### 关联文档

- Spec: `spec.md` §3、§4.2.1、§4.2.2、§4.2.5、§4.3、§7、§8。
- Tasks: `tasks.md` Task 2（4 个子任务、6 个验收标准）。

### 关键设计决策

1. 平台 `verify_jwt=false` 支持游客，但 handler 同时强制校验 apikey，并自行验证可选用户 JWT。
2. 问题和回答不进入日志、配额表或身份哈希原文。
3. Auth、RPC 和模型请求都有覆盖完整响应体的 deadline，模型不自动重试。
4. 纯配置完整性在额度预占前验证。

---

## 2. Round 1–3: Findings

### 2.1 性能类

**F-6 (P2)** — 静态配置和客户端在热路径重复创建。

### 2.2 健壮性类

**F-1 (P1)** — 游客入口未强制校验 apikey。

**F-2 (P1)** — Ark body、Auth 和配额 RPC deadline 不完整。

**F-3 (P1)** — 方舟配置缺失会在失败前扣减额度。

**F-4 (P1)** — 8 KiB 限制发生在全量读取 body 之后。

**F-5 (P1)** — Deno 主编排不可注入，关键分支没有测试。

**F-7 (P1)** — Ark body timeout 被包装为 502，而非 504。

**F-8 (P1)** — Auth 依赖故障被误报为无效 Session。

**F-9 (P1)** — runtime 初始化异常绕过统一 DTO/CORS。

**F-10 (P1)** — Auth 中文 timeout 包装形态仍被映射为 503。

### 2.3 工程规范类

**F-11 (P2)** — 配额返回数值字段缺少安全整数校验。

**F-12 (P2)** — 新增 Supabase deadline 配置未进入 Spec。

### 2.4 契约破坏类

无。

### 2.5 需求/设计符合度类

无。

---

## 3. Round 1–3 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 未校验 apikey | 强制命中 legacy/new publishable 集合 | 执行遗漏 |
| F-2/F-7 | P1 | deadline 不完整/错误语义不准 | 统一 deadline fetch + Ark body timeout 优先映射 504 | 设计考虑不足 |
| F-3 | P1 | 配置缺失先扣额度 | handler 在 body、认证和配额前检查依赖完整性 | 执行遗漏 |
| F-4 | P1 | 请求限制晚于全量读取 | Content-Length 预拒绝 + ReadableStream 分块硬上限 | 设计考虑不足 |
| F-5 | P1 | 编排不可测 | 抽取 `createAiAssistantHandler`，Deno 文件仅做组合根 | 设计考虑不足 |
| F-8/F-10 | P1 | Auth 错误分类错误 | 分离 timeout、retryable/network/429/5xx 与明确 JWT 拒绝 | 执行遗漏 |
| F-9 | P1 | bootstrap 异常逃逸 | runtime 创建失败降级为 null，由 handler 统一 503 | 执行遗漏 |
| F-11/F-12 | P2 | DTO/配置约束不足 | 校验 limit/remaining 并补充 `AI_SUPABASE_TIMEOUT_MS` | 执行遗漏 |

---

## 4. Round 4: Re-review

- correctness-reviewer：PASS。
- quality-reviewer：PASS。
- Auth timeout、依赖故障和 JWT 拒绝错误语义闭环。
- **结论: PASS**。

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1～F-12 | robustness/performance/standards | P1/P2 | keep/fixed | Round 4 双 reviewer PASS，定向和全量测试通过 |

---

## 6. 总体结论: PASS

所有 P0/P1 均已修复，服务端边界、错误语义和隐私约束符合 Spec。

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
| F-13 | 增加显式 Auth 429 自动测试 | P2 | 后续错误矩阵扩展时 |

---

## 9. Review Summary

- **Review 轮次**: 4 轮。
- **P0 修复**: 0 项。
- **P1 修复**: 9 项。
- **P2 keep**: 0 项。
- **Follow-up**: 1 项。
- **最终结论**: PASS。

## 10. Phase 3 Test Result

- `node --test tests/ai-function-core.test.js`：19/19 PASS。
- `npm test`：108/108 PASS。
- `npm run build`：PASS。
- Edge Function TypeScript 入口经 esbuild bundle 校验通过；本地 Edge Runtime 首次镜像验证仍在进行。
