# Task 15 Code Review Report: 霓虹夜航主题与主题入口

> **Review Date**: 2026-09-04  
> **Task**: Task 15 — 新增霓虹夜航主题并强化主题入口  
> **Scope**: panduola，4 个功能与测试文件  
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/theme/themeManager.js` — 新增 cyber 主题和四套完整描述。
2. `src/components/ThemeSwitcher.vue` — 将入口改为“主题切换 + 当前主题”双行文案。
3. `src/style.css` — 新增赛博朋克深色 Token、网格背景和主要表面映射。
4. `tests/theme-manager.test.js` — 覆盖 cyber 元数据、应用与持久化。

### 关联文档

- Spec: `spec.md` §3、§4、§5、§7
- Tasks: `tasks.md` Task 15（5 个子任务、8 个验收标准）

### 关键设计决策

1. 赛博朋克主题使用独立深色语义 Token，不对浅色主题做简单反色。
2. Header 明确显示“主题切换”，主题选项承担风格说明。

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

无。

### 2.2 健壮性类 (Robustness)

**F-1** (P1) — Dashboard 主内容容器仍保留浅色背景
- **位置**: `src/components/Dashboard.vue:1605`
- **问题**: 深色文字显示在接近白色的内容容器上，正文对比度不足。

**F-2** (P1) — 生长曲线和疫苗面板遗漏深色表面
- **位置**: `GrowthTracker.vue:809`、`VaccineGuide.vue:389`
- **问题**: `.chart-panel` 和 `.update-item` 固定浅色，深色主题文字不可读。

### 2.3 工程规范类 (Standards)

**F-3** (P1) — 青色主操作仍使用白色前景
- **位置**: `Dashboard.vue:1663`、`AISearch.vue:458`
- **问题**: 激活 Tab 与 AI 按钮白字叠加荧光青，未使用 `--on-primary`。

**F-4** (P1) — 危险按钮前景对比度不足
- **位置**: `src/style.css:341`
- **问题**: 霓虹粉背景仍使用白字，常态和 hover 均不足 4.5:1。

**F-5** (P2) — 测试没有实际应用 cyber
- **位置**: `tests/theme-manager.test.js:23`
- **问题**: 只验证元数据，没有验证根节点应用和独立持久化。

### 2.4 契约破坏类 (Contract)

无。

### 2.5 需求/设计符合度类 (Spec Compliance)

无其他问题。

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 首页容器浅色残留 | 将主内容容器映射到深色语义表面 | 执行遗漏 |
| F-2 | P1 | 工具面板浅色残留 | 补充图表和疫苗更新面板映射 | 执行遗漏 |
| F-3 | P1 | 主操作白字对比度不足 | 激活 Tab 和 AI 按钮使用 `--on-primary` | 设计考虑不足 |
| F-4 | P1 | 危险按钮对比度不足 | 增加 `--on-danger`，cyber 使用深色前景 | 设计考虑不足 |
| F-5 | P2 | cyber 测试只覆盖元数据 | 增加实际应用和持久化断言 | 执行遗漏 |

## 4. Round 2: Re-review

- **F-1 至 F-5**：均已关闭。
- **新增 F-6 (P1)**：Dashboard 五个内容 Tab 的容器、默认、hover 和激活数量徽标仍有浅色残留。
- **结论: NEEDS_CHANGES**。

### Round 2 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-6 | P1 | Dashboard Tab 内部状态未深色化 | 补充容器渐变、默认/hover 表面及激活徽标前景 | 执行遗漏 |

### Round 3: Re-review

- **F-6**：全部 Tab 状态已使用深色表面和高对比前景。
- **无新增 finding**。
- **结论: PASS**。

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | robustness | P1 | keep → fixed | 首页主内容是 Task 15 明确要求覆盖的主要表面 |
| F-2 | robustness | P1 | keep → fixed | 工具弹窗必须在深色主题保持文字可读 |
| F-3 | standards | P1 | keep → fixed | 荧光青背景的白字对比度不足 |
| F-4 | standards | P1 | keep → fixed | 危险按钮普通文字需要足够对比度 |
| F-5 | standards | P2 | keep → fixed | 新主题需验证真实应用和持久化契约 |
| F-6 | robustness | P1 | keep → fixed | Tab 默认、hover 和激活状态均属于用户主路径 |

## 6. 总体结论: PASS

霓虹夜航的页面表面、交互前景、持久化和入口表达均通过三轮审查。

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无未解决问题。

### P2（建议改进）

无未解决问题。

## 8. Follow-up Items

无。

## 9. Review Summary

- **Review 轮次**: 3 轮（Round 1 五项 → Round 2 新增一项 → Round 3 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 5 项
- **P2 keep**: 1 项，已修复
- **Follow-up**: 0 项
- **最终结论**: PASS
- **Phase 3 测试**: `npm test` 157/157 PASS；`npm run build` PASS；四主题、跨标签页、刷新持久化、主要弹窗及 390px 响应式冒烟 PASS
