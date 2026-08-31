# Task 14 Code Review Report: 三套可持久化页面主题

> **Review Date**: 2026-08-31  
> **Task**: Task 14 — 新增三套可持久化页面主题  
> **Scope**: panduola，12 个功能与测试文件  
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/theme/themeManager.js` — 主题元数据、校验、应用、恢复与持久化。
2. `src/components/ThemeSwitcher.vue` — 可访问主题选择浮层。
3. `src/style.css` — 三套语义 Token 与主题化全局基础样式。
4. `src/main.js`、`index.html` — Vue 挂载前恢复主题并提供默认标记。
5. `Header.vue`、`App.vue`、`CategoryNav.vue`、`Dashboard.vue`、`LinkList.vue`、`SearchBar.vue` — 主题入口及主要页面表面迁移。
6. `tests/theme-manager.test.js` — 主题契约、异常和持久化测试。

### 关联文档

- Spec: `spec.md` §3、§4、§5、§6、§7
- Tasks: `tasks.md` Task 14（5 个子任务、8 个验收标准）

### 关键设计决策

1. 默认保留“岁序清新”，新增“暖杏书卷”和“云岚静蓝”两套浅色主题。
2. 外观偏好独立保存在当前设备，不进入业务 Store、快照或云同步。
3. 本期不提供简单反色的深色主题，待固定浅色表面完成统一 Token 化后再评估。

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

无。

### 2.2 健壮性类 (Robustness)

**F-1** (P1) — 390px 窄屏隐藏了原有刷新功能
- **位置**: `src/components/Header.vue:356`
- **问题**: 为容纳主题入口直接隐藏唯一刷新按钮，破坏原有功能。
- **证据**: `max-width: 420px` 下 `.refresh-btn` 计算样式为 `display: none`，无替代入口。

### 2.3 工程规范类 (Standards)

**F-2** (P1) — 非默认主题主按钮 hover 跳回绿色
- **位置**: `src/style.css:246`
- **问题**: 常态背景使用主题 Token，hover 背景与阴影仍固定为默认绿色。
- **证据**: 暖杏和静蓝下悬停主按钮会瞬间变为 `#236f67/#175e57`。

**F-3** (P2) — radiogroup 缺少方向键与 roving tabindex
- **位置**: `src/components/ThemeSwitcher.vue:25`
- **问题**: 三个 `role="radio"` 全部可 Tab，且方向键不能切换单选项。
- **证据**: 键盘处理仅覆盖 Escape，与单选组交互语义不一致。

### 2.4 契约破坏类 (Contract)

无。

### 2.5 需求/设计符合度类 (Spec Compliance)

无其他问题。

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 手机端刷新入口消失 | 恢复刷新按钮，仅在 360px 以下隐藏品牌文字 | 设计考虑不足 |
| F-2 | P1 | hover 使用固定绿色 | 增加逐主题 hover、阴影和交互边框 Token | 执行遗漏 |
| F-3 | P2 | 单选组键盘语义不完整 | 增加 roving tabindex、方向键与 Home/End | 规范未遵守 |

## 4. Round 2: Re-review

- **F-1、F-2、F-3**：均已关闭。
- **新增 F-4 (P1)**：恢复刷新按钮后，移动端浮层按主题按钮右对齐会从屏幕左侧溢出。
- **结论: NEEDS_CHANGES**。

### Round 2 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-4 | P1 | 移动端主题浮层横向溢出 | 改为视口固定定位，左右各保留 0.75rem | 设计考虑不足 |

### Round 3: Re-review

- **F-4**：320px 与 390px 不再横向溢出，桌面定位保持不变。
- **无新增 finding**。
- **结论: PASS**。

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | contract | P1 | keep → fixed | Spec 要求保持现有功能和事件契约 |
| F-2 | standards | P1 | keep → fixed | 三套主题必须覆盖主要交互状态 |
| F-3 | standards | P2 | keep → fixed | `role="radiogroup"` 应提供匹配的键盘交互 |
| F-4 | robustness | P1 | keep → fixed | Task 14 明确要求 390px 无横向溢出 |

## 6. 总体结论: PASS

主题状态、视觉 Token、键盘交互和响应式布局均通过三轮审查。

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

- **Review 轮次**: 3 轮（Round 1 三项 → Round 2 新增一项 → Round 3 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 3 项
- **P2 keep**: 1 项，已修复
- **Follow-up**: 0 项
- **最终结论**: PASS
- **Phase 3 测试**: `npm test` 157/157 PASS；`npm run build` PASS；三主题、持久化、键盘、工具弹窗及 390px 响应式冒烟 PASS
