# Task 4 Code Review Report: 站内 AI 成长助手

> **Review Date**: 2026-08-19
> **Task**: Task 4 — 改造站内 AI 交互并调整首页顺序
> **Scope**: panduola，2 个 Vue 文件
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/components/AISearch.vue` — 站内问答、额度、错误、本机历史与可访问状态。
2. `src/components/Dashboard.vue` — AI 区块移动到内容导航之后并清理重复样式。

### 关联文档

- Spec: `spec.md` §2、§3、§4.2.1、§4.2.5、§4.3、§7.2。
- Tasks: `tasks.md` Task 4（4 个子任务、6 个验收标准）。

### 关键设计决策

1. 移除豆包 iframe、OpenAI Key 和服务商设置。
2. 回答只按纯文本渲染；历史最多五条且只保存在本机。
3. 错误按 code 决定是否允许重新提问，限流遵循 retryAfter。
4. 常驻 polite live region 播报加载、完成、额度和倒计时结束；错误由独立 alert 播报一次。

---

## 2. Round 1–3: Findings

### 2.1 性能类

**F-6 (P2)** — 移除 maxlength 后极端粘贴会增加 code point 计算成本。

### 2.2 健壮性类

**F-1 (P1)** — 组件卸载后迟到成功仍可能更新状态和历史。

**F-2 (P1)** — retryAfter 只禁用错误卡按钮，可从表单/建议入口绕过。

**F-3 (P1)** — 新请求失败时旧 quota 仍可见。

### 2.3 工程规范类

**F-4 (P1)** — HTML maxlength 与 Unicode code point 契约不一致。

**F-5 (P1)** — 所有错误统一显示重试，且 live region 可能重复播报。

**F-7 (P2)** — 历史解析失败会跳过旧 API Key 清理。

**F-8 (P2)** — Dashboard 存在重复 `.ai-search-full` 样式。

### 2.4 契约破坏类

无。

### 2.5 需求/设计符合度类

无。

---

## 3. Round 1–3 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 卸载后迟到回写 | isMounted + generation + controller 三重屏障 | 执行遗漏 |
| F-2 | P1 | 限流入口可绕过 | retrySeconds 进入统一 canSubmit，并禁用历史/建议入口 | 执行遗漏 |
| F-3 | P1 | 额度状态过期 | 新请求开始立即隐藏旧 quota | 执行遗漏 |
| F-4/F-6 | P1/P2 | 输入长度契约/性能 | code point 计数 + 1000 code unit 安全上限 | 设计考虑不足 |
| F-5 | P1 | 错误动作/播报不准确 | 结构化错误、按 code 动作、静态 alert + 常驻 polite status | 设计考虑不足 |
| F-7/F-8 | P2 | 清理/样式耦合 | 独立清理旧 key，删除重复 CSS | 执行遗漏 |

---

## 4. Round 4: Re-review

- correctness-reviewer：PASS。
- quality-reviewer：PASS。
- 统一倒计时门禁、错误播报隔离、Unicode 输入和卸载生命周期均闭环。

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1～F-8 | robustness/performance/standards | P1/P2 | keep/fixed | Round 4 双 reviewer PASS，构建与浏览器验证通过 |

---

## 6. 总体结论: PASS

UI 顺序、错误语义、响应式和可访问性符合 Task 4 验收要求。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无。

### P2（建议改进）

无。

---

## 8. Follow-up Items

无。

---

## 9. Review Summary

- **Review 轮次**: 4 轮。
- **P0 修复**: 0 项。
- **P1 修复**: 5 项。
- **P2 keep**: 0 项。
- **Follow-up**: 0 项。
- **最终结论**: PASS。

## 10. Phase 3 Test Result

- `npm test`：129/129 PASS。
- `npm run build`：PASS。
- 浏览器桌面 DOM：内容 Tab 在 AI 助手之前，状态/输入/提示语义完整。
- 浏览器 375×812：body 375px、卡片 351px、输入/按钮 317px，无横向溢出。
- 501 个 Unicode 字符：`aria-invalid=true`，提交按钮禁用。
