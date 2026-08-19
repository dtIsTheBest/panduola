# Task 3 Code Review Report: 站内 AI 成长助手

> **Review Date**: 2026-08-19
> **Task**: Task 3 — 建立前端 AI 客户端与共享依赖装配
> **Scope**: panduola，4 个代码/测试文件
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/ai/config.js` — AI 公开配置与 Supabase 连接复用。
2. `src/ai/aiAssistantClient.js` — Session、guestId、deadline、错误和 DTO 客户端。
3. `src/main.js` — 共享 Supabase Provider 与 AI 注入。
4. `tests/ai-assistant-client.test.js` — 客户端正常、边界、错误和并发测试。

### 关联文档

- Spec: `spec.md` §3、§4.2.1、§4.2.2、§4.2.5、§4.3、§7.1、§8.2。
- Tasks: `tasks.md` Task 3（4 个子任务、6 个验收标准）。

### 关键设计决策

1. AI 与账号同步共享单个 Supabase Client Provider 和 Session storage。
2. Session token 只进入 Authorization，不暴露给组件或请求体。
3. AI 默认关闭，关闭时不要求 fetch、crypto 或 localStorage。
4. 客户端单飞且总 deadline 覆盖 Provider、Session、HTTP 和响应体。

---

## 2. Round 1: Findings

### 2.1 性能类

**F-4 (P2)** — 响应体完整缓冲后才校验回答长度。

### 2.2 健壮性类

**F-1 (P1)** — 总 deadline 和取消不覆盖 Provider/Session 获取。

**F-2 (P1)** — Provider/Session 异常位于统一错误边界外。

**F-3 (P1)** — 同客户端没有单飞，双击可重复消耗额度。

### 2.3 工程规范类

**F-5 (P2)** — AI 关闭时仍强制检查 fetch/randomUUID/localStorage。

**F-6 (P2)** — guestId 测试没有实际覆盖跨 client 复用。

### 2.4 契约破坏类

无。

### 2.5 需求/设计符合度类

无。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1/F-2 | P1 | deadline/错误边界不完整 | ask 入口建立 abort context，以 signal race 覆盖 Provider/Session 并统一映射 | 设计考虑不足 |
| F-3 | P1 | 无客户端单飞 | `activeRequest` + finally 清理，重复调用返回稳定错误 | 执行遗漏 |
| F-4 | P2 | 响应体无硬上限 | 64 KiB Content-Length 预拒绝 + 流式累计/cancel | 设计考虑不足 |
| F-5 | P2 | 禁用态影响启动 | 仅可用时检查网络能力，并安全访问 storage | 执行遗漏 |
| F-6 | P2 | 测试未走复用分支 | 同一 storage 创建第二 client 并断言 guestId 一致 | 执行遗漏 |

---

## 4. Round 2: Re-review

- 双 reviewer PASS。
- 总 deadline、错误归一、单飞、禁用态惰性、响应上限和 guestId 复用均已验证。

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1～F-6 | robustness/performance/standards | P1/P2 | keep/fixed | Round 2 双 reviewer PASS，定向/全量测试与构建通过 |

---

## 6. 总体结论: PASS

前端客户端符合隐私、deadline、单飞和可选功能隔离契约。

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
| F-7 | signal race 不能物理取消第三方 Provider 内部 Promise | P2 | Provider 增加原生 signal 接口时优化 |

---

## 9. Review Summary

- **Review 轮次**: 2 轮。
- **P0 修复**: 0 项。
- **P1 修复**: 3 项。
- **P2 keep**: 0 项。
- **Follow-up**: 1 项。
- **最终结论**: PASS。

## 10. Phase 3 Test Result

- `node --test tests/ai-assistant-client.test.js`：12/12 PASS。
- `npm test`：129/129 PASS。
- `npm run build`：PASS。
