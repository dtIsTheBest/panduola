# Task 2 Code Review Report: 辅食搭配计算器

> **Review Date**: 2026-08-20  
> **Task**: Task 2 — 开发弹框并接入所有辅食入口  
> **Scope**: panduola，2 个文件，新增 899 行  
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/components/FoodCalculator.vue` — 新增月龄、搭配、安全提示与来源弹框。
2. `src/components/Dashboard.vue` — 接入默认、婴儿期和幼儿期辅食入口。

### 关联文档

- Spec: `spec.md` §3、§4、§7、§8
- Tasks: `tasks.md` Task 2（4 个子任务、7 个验收标准）

### 关键设计决策

1. 未满 6 月龄仅展示准备信号，不运行今日食物多样性检查。
2. 孩子选择和所有计算状态只存在于组件内，不写入 Store。

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

无。

### 2.2 健壮性类 (Robustness)

**F-1** (P1) — 未满 6 月龄仍展示食物多样性补充建议
- **位置**: `src/components/FoodCalculator.vue:49`
- **问题**: 准备期提示与“至少 4 类”建议同时出现，健康语义互相矛盾。
- **证据**: 5 月龄、未勾食物时，计算结果仍建议增加谷薯、蔬果和动物性食物。

### 2.3 工程规范类 (Standards)

**F-2** (P1) — 透明复选框缺少可见键盘焦点
- **位置**: `src/components/FoodCalculator.vue:502`
- **问题**: Tab 会进入透明 checkbox，但卡片没有焦点轮廓。
- **证据**: checkbox 使用 `opacity: 0`，全局 focus outline 随元素一起不可见。

### 2.4 契约破坏类 (Contract)

无。

### 2.5 需求/设计符合度类 (Spec Compliance)

无其他问题。

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 准备期仍显示搭配检查 | 新增 `<6` 月龄专用准备信号分支，隐藏不适用计算 | 设计考虑不足 |
| F-2 | P1 | 卡片式 checkbox 无可见焦点 | 为食物卡片和新食物开关增加 `:focus-within` 轮廓 | 执行遗漏 |

## 4. Round 2: Re-review

- **F-1**：准备期已隐藏搭配检查，但发现隐藏的“首次尝试”状态仍能生成提示。
- **F-2**：可见焦点问题已关闭。
- **新增 F-3 (P1)**：从 6 月龄降到 5 月龄后，隐藏状态造成首次尝试提示与准备期建议冲突。
- **结论: NEEDS_CHANGES**。

### Round 2 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-3 | P1 | 隐藏状态影响准备期提示 | `<6` 月龄时强制忽略首次尝试状态 | 设计考虑不足 |

### Round 3: Re-review

- **F-1、F-2、F-3**：全部关闭。
- **无新增 finding**。
- **结论: PASS**。

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | robustness | P1 | keep → fixed | Spec 3.1 要求未满 6 月龄突出准备提示 |
| F-2 | standards | P1 | keep → fixed | Spec 3.2 要求可交互元素具有可见键盘焦点 |
| F-3 | robustness | P1 | keep → fixed | 隐藏控件状态仍影响可见健康提示 |

## 6. 总体结论: PASS

三项阻塞问题均修复，第三轮定向复审通过。

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无未解决问题。

### P2（建议改进）

无。

## 8. Follow-up Items

无。

## 9. Review Summary

- **Review 轮次**: 3 轮（Round 1 共 2 项 → Round 2 新增 1 项 → Round 3 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 3 项
- **P2 keep**: 0 项
- **Follow-up**: 0 项
- **最终结论**: PASS
- **Phase 3 测试**: `npm test` 153/153 PASS；`npm run build` PASS；桌面与 375px 浏览器验收 PASS
