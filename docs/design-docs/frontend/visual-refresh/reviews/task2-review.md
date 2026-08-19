# Task 2 Code Review Report: 家长端页面视觉焕新

> **Review Date**: 2026-07-30  
> **Task**: Task 2 — 焕新 Dashboard 与 AI 主要体验  
> **Scope**: panduola，3 文件，工作区相对 HEAD 为 +2009/-387（含用户原有未提交修改）  
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/components/Dashboard.vue` — 调整首页信息层级、卡片语义与响应式布局。
2. `src/components/AISearch.vue` — 统一 AI 体验和设置弹窗，补充模态与状态语义。
3. `src/style.css` — 调深次级文字语义色，保证柔和表面上的对比度。

### 关联文档

- Spec: `spec.md` §3.1、§3.2、§4.2.1、§4.3
- Tasks: `tasks.md` Task 2（4 个子任务、6 个验收标准）

### 关键设计决策

1. 保留 Dashboard 当前信息架构和所有业务派生逻辑。
2. 将可点击卡片改为原生按钮，但不改变事件 payload。
3. AI provider、history、network 与 localStorage 行为保持不变。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

无。

### 2.2 健壮性类 (Robustness)

无 keep finding。

### 2.3 工程规范类 (Standards)

**F-1** (P1) — 年龄阶段标题使用动态低对比颜色
- **位置**: `src/components/Dashboard.vue:10`
- **问题**: 标题文字直接使用年龄颜色，部分颜色与柔和背景对比度不足。
- **证据**: 实测阶段色组合约为 1.55:1–3.98:1。

**F-2** (P1) — 次级文字在柔和表面上的对比度不足
- **位置**: `src/style.css:19`
- **问题**: 原 `--text-secondary` 在 `surface-soft` 与 `primary-soft` 上低于 4.5:1。
- **证据**: 对比度约为 4.42:1 与 4.08:1。

**F-3** (P1) — AI 设置弹窗缺少模态语义和焦点管理
- **位置**: `src/components/AISearch.vue:97`
- **问题**: 缺少 dialog 语义、打开聚焦、焦点循环、Escape 关闭和焦点恢复。
- **证据**: 键盘焦点可遍历遮罩后的页面。

**F-4** (P1) — AI 设置表单标签未与控件关联
- **位置**: `src/components/AISearch.vue:108`
- **问题**: label 没有 `for`，控件没有对应 `id`。
- **证据**: 控件缺少程序化名称。

**F-5** (P2) — AI 异步状态没有 live-region 通知
- **位置**: `src/components/AISearch.vue:57`
- **问题**: 结果、加载和错误动态插入时不会主动通知辅助技术。
- **证据**: 原模板没有 `aria-live`、`role=status` 或 `role=alert`。

**F-6** (P2) — 两个组件通过追加覆盖样式保留较多重复规则
- **位置**: `src/components/Dashboard.vue:1244`、`src/components/AISearch.vue:702`
- **问题**: 新旧 scoped CSS 同时存在，增加构建体积与级联维护成本。
- **证据**: 多个选择器和媒体查询在同一组件内重复定义。

### 2.4 契约破坏类 (Contract)

**F-7** (P1 candidate, drop) — `view-all-links` 事件只声明未触发
- **位置**: `src/components/Dashboard.vue:139`
- **问题**: reviewer 建议恢复该事件触发。
- **证据**: 当前入口使用 `stat-click({type:'today'})`。

### 2.5 需求/设计符合度类 (Spec Compliance)

F-1 至 F-5 与 spec §3.2 的对比度、键盘焦点和可访问状态要求相关。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 阶段标题对比度不足 | 移除标题动态文字色，阶段色仅保留为装饰 | 执行遗漏 |
| F-2 | P1 | 次级文字对比度不足 | 将 `--text-secondary` 调深为 `#526d68` | 规范未遵守 |
| F-3 | P1 | AI 弹窗焦点管理缺失 | 增加 dialog 语义、焦点循环、Escape 与焦点恢复 | 设计考虑不足 |
| F-4 | P1 | 表单标签未关联 | 为 label/控件增加成对 for/id | 规范未遵守 |
| F-5 | P2 | 异步状态无播报 | 为结果、加载和错误增加 status/alert live regions | 执行遗漏 |
| F-6 | P2 | 重复 scoped CSS | 本轮不做大规模清理，记录 Follow-up | 设计考虑不足 |

---

## 4. Round 2: Re-review

- **F-1**：PASS，标题继承正文高对比色。
- **F-2**：PASS，新次级色在相关柔和背景上均超过 4.5:1。
- **F-3**：PASS，设置弹窗具备模态语义和完整焦点循环。
- **F-4**：PASS，三组表单控件均有程序化名称。
- **F-5**：PASS，动态状态均可被辅助技术获知。
- **无新增 P0/P1 finding**。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | standards | P1 | keep / fixed | 动态阶段色在标题背景上确实低于 4.5:1 |
| F-2 | standards | P1 | keep / fixed | 次级色用于 0.7–0.84rem 文本，必须满足普通文字对比度 |
| F-3 | standards | P1 | keep / fixed | spec 要求弹窗键盘操作可见可用 |
| F-4 | standards | P1 | keep / fixed | label 与控件缺少程序化关联 |
| F-5 | standards | P2 | keep / fixed | 搜索状态为动态插入内容 |
| F-6 | standards | P2 | follow-up | 清理需大规模改写 CSS，超出渐进式低风险策略 |
| F-7 | contract | P1 | drop | 该行为在 Task 2 修改前已存在，恢复旧事件会改变用户已有 today 筛选语义 |

---

## 6. 总体结论: PASS

所有阻塞 finding 已修复，P2 重复样式记录为后续维护项。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

F-1、F-2、F-3、F-4，均已修复。

### P2（建议改进）

- F-5 已修复。
- F-6 保留为 Follow-up。

---

## 8. Follow-up Items

| ID | 内容 | 优先级 | 建议处理时机 |
|----|------|--------|-------------|
| F-6 | 合并 Dashboard 与 AISearch 的重复 scoped CSS 规则 | P2 | 后续独立 CSS 清理任务 |

---

## 9. Review Summary

- **Review 轮次**: 2 轮（Round 1 7 项 candidate finding → 修复 5 项、drop 1 项、follow-up 1 项 → Round 2 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 4 项
- **P2 keep**: 2 项（1 项已修复、1 项 follow-up）
- **Follow-up**: 1 项
- **最终结论**: PASS

## 10. Phase 3 测试结果

- **测试类型**: 生产构建 + 静态契约检查 + 浏览器响应式 DOM 断言
- **用例数**: 7
- **结果**: 7 PASS
- `npm run build` PASS；Dashboard/AI 契约与搜索历史逻辑保留；遗留断点选择器已清除。
- 1200 × 800、992 × 768、390 × 844 均满足 `documentElement.scrollWidth <= innerWidth`。
- 992px 与 390px 的 `banner-tip-row` 均计算为单列，1200px Dashboard 保持均衡双栏。
