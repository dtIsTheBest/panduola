# Task 16 Code Review Report: 轻量页面互动特效

> **Review Date**: 2026-09-08
> **Task**: 16 — 增加轻量页面互动特效
> **Scope**: panduola，8 文件，+354/-13 行
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/utils/interactionEffects.js` — 提供确定性的点击粒子模型与数量边界。
2. `src/components/InteractionEffects.vue` — 管理点击烟花的触发、并发上限和定时清理。
3. `src/components/ThemeSwitcher.vue` — 为主题切换增加径向 View Transition 与降级路径。
4. `src/style.css` — 增加主题揭幕、卡片微光和减少动态效果规则。
5. `src/App.vue` — 挂载全局互动效果层。
6. `tests/interaction-effects.test.js` — 覆盖粒子数量、分布和非法输入。
7. `docs/design-docs/frontend/visual-refresh/spec.md` — 补充互动效果需求与设计依据。
8. `docs/design-docs/frontend/visual-refresh/tasks.md` — 增加 Task 16 实施与验收清单。

### 关联文档

- Spec: `spec.md` §3.1、3.2、4.1、4.2、4.3、5、6、7
- Tasks: `tasks.md` Task 16（5 个子任务、8 个验收标准）

### 关键设计决策（如有用户确认）

1. 只提供三种克制的互动：点击星火、主题径向揭幕、卡片微光。
2. 不引入粒子或动画依赖，全部使用原生 DOM、CSS 与 View Transition。
3. 所有装饰性动画遵循 `prefers-reduced-motion`。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

无。

### 2.2 健壮性类 (Robustness)

**F-1** (P1) — 触屏滚动会被误判为点击并生成烟花
- **位置**: `src/components/InteractionEffects.vue:46`
- **问题**: 在 `pointerdown` 阶段创建烟花，触屏滚动和滑动也会先触发该事件。
- **证据**: 原实现未等待 `pointerup` 或 `click`，也没有位移、取消手势判断。

**F-2** (P2) — 并发主题过渡可能竞争清理圆心变量
- **位置**: `src/components/ThemeSwitcher.vue:117`
- **问题**: 快速连续切换时，旧过渡完成回调可能删除新过渡正在使用的 CSS 圆心变量。
- **证据**: 原实现的每个 `transition.finished` 都无条件调用同一个清理函数。

### 2.3 工程规范类 (Standards)

**F-3** (P2) — 组件生命周期关键约束缺少自动化覆盖
- **位置**: `tests/interaction-effects.test.js:9`
- **问题**: 单元测试覆盖粒子模型，但未挂载组件验证节流、过滤、定时和卸载清理。
- **证据**: 测试只调用 `createClickBurst`，没有触发组件 DOM 事件或推进定时器。

### 2.4 契约破坏类 (Contract)

无。

### 2.5 需求/设计符合度类 (Spec Compliance)

无。

---

## 3. Round 1 Fixes（如有修复）

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 触屏滚动误触发烟花 | 改用语义 `click`，并过滤键盘/程序化的零 detail 事件 | 触屏手势边界考虑不足 |
| F-2 | P2 | 旧主题过渡误清理新圆心 | 增加递增 transition ID，仅允许最新过渡清理 | 并发过渡清理遗漏 |

---

## 4. Round 2: Re-review（仅 Round 1 有 P0/P1 修复时执行）

- **F-1**：语义 `click` 不再由滚动手势合成，真实鼠标/触屏点击仍可正常触发；监听移除契约正确。
- **F-2**：旧回调因 transition ID 不匹配无法清理新过渡变量，当前过渡仍能正常清理。
- **无新增 finding**。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | robustness | P1 | keep（已修复） | `InteractionEffects.vue` 原 `pointerdown` 在触屏滚动起手时也触发；现改为完成后的 `click`。 |
| F-2 | robustness | P2 | keep（已修复） | `ThemeSwitcher.vue` 原 finished 回调无实例标识；现由 `transitionSequence` 限定最新操作。 |
| F-3 | standards | P2 | follow-up | 当前测试文件只覆盖纯粒子模型；本任务先以真实浏览器冒烟覆盖组件行为，后续引入组件测试环境时补自动化。 |

---

## 6. 总体结论: PASS

P1 已修复并通过定向复审，无阻塞合入的问题。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无（F-1 已修复）。

### P2（建议改进）

无未修复的正式问题（F-2 已修复）。

---

## 8. Follow-up Items

| ID | 内容 | 优先级 | 建议处理时机 |
|----|------|--------|-------------|
| F-3 | 在项目引入 Vue 组件测试环境后，补充节流、目标过滤、定时清理和卸载清理自动化测试。 | P2 | 后续测试基础设施升级时 |

---

## 9. Review Summary

- **Review 轮次**: 2 轮（Round 1 3 项 candidate finding → 修复 2 项 → Round 2 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 1 项
- **P2 keep**: 1 项（已修复）
- **Follow-up**: 1 项
- **最终结论**: PASS
