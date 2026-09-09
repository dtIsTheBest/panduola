# Task 7 Code Review Report: 可回退的任务式成长参谋体验

> **Review Date**: 2026-09-09
> **Task**: 7 — 增加可回退的任务式成长参谋体验
> **Scope**: panduola，8 文件，+1200/-8 行
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/ai/growthCoach.js` — 定义任务、体验模式和受控提问构造。
2. `src/components/AIGrowthCoach.vue` — 实现任务式成长参谋交互。
3. `src/components/AIExperience.vue` — 提供新旧体验切换边界。
4. `src/components/Dashboard.vue` — 挂载体验边界并传入年龄阶段。
5. `tests/ai-growth-coach.test.js` — 覆盖模式、任务、隐私和长度边界。
6. `.env.example` — 增加经典模式回退配置。
7. `docs/design-docs/platform/in-site-ai-assistant/spec.md` — 补充 Task 7 需求与设计。
8. `docs/design-docs/platform/in-site-ai-assistant/tasks.md` — 增加 Task 7 实施清单。

### 关联文档

- Spec: `spec.md` §2、3.1、3.2、4.1、4.2、4.3、7、8.2
- Tasks: `tasks.md` Task 7（5 个子任务、8 个验收标准）

### 关键设计决策（如有用户确认）

1. 默认展示任务式成长参谋，原 `AISearch.vue` 和 AI 客户端保持不变。
2. 仅把当前年龄阶段和用户本次主动填写的内容构造成单轮问题。
3. 配置 `VITE_AI_EXPERIENCE_MODE=classic` 或页面入口均可返回经典问答。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

无。

### 2.2 健壮性类 (Robustness)

**F-1** (P1) — 年龄阶段变化后旧回答可能显示在新阶段标签下
- **位置**: `src/components/AIGrowthCoach.vue:217`
- **问题**: 请求只在提交时读取阶段，但阶段标签响应式更新，旧请求和旧回答没有随阶段变化失效。
- **证据**: 初版没有监听稳定阶段 key，也没有在阶段变化时 abort 或递增请求 generation。

### 2.3 工程规范类 (Standards)

**F-2** (P1) — 动态区域关闭和体验切换后没有恢复键盘焦点
- **位置**: `src/components/AIGrowthCoach.vue:79`、`src/components/AIExperience.vue:3`
- **问题**: 当前聚焦元素随 `v-if` 分支卸载，焦点可能回落到页面 body。
- **证据**: 初版关闭与模式切换处理函数只更新状态，没有 `nextTick` 后的焦点目标。

**F-3** (P1) — 新组件引用不存在的主题变量
- **位置**: `src/components/AIGrowthCoach.vue:340`
- **问题**: `--accent-warm` 和 `--surface-color` 未在四套主题中定义，相关背景声明会失效。
- **证据**: 全局主题实际提供 `--warm-color`、`--card-bg`、`--surface-soft` 和 `--surface-muted`。

**F-4** (P2) — 亲子任务图标标识与组件映射不一致
- **位置**: `src/components/AIGrowthCoach.vue:208`
- **问题**: 任务定义使用 `heart`，初版映射键误写为 `family`，导致第四张任务卡没有图标。
- **证据**: 真实浏览器检查显示前三张卡有 SVG、亲子任务卡的图标容器为空。

### 2.4 契约破坏类 (Contract)

无。

### 2.5 需求/设计符合度类 (Spec Compliance)

无。

---

## 3. Round 1 Fixes（如有修复）

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 旧阶段回答与新标签错配 | 监听稳定阶段 ID，阶段变化时 abort、递增 generation 并清空回答；等待旧请求 settle 后再允许提交 | 设计考虑不足 |
| F-2 | P1 | 动态区域卸载后焦点丢失 | 保存任务、提交、新旧体验焦点目标并在 `nextTick` 后恢复 | 执行遗漏 |
| F-3 | P1 | 使用不存在的主题变量 | 统一替换为四主题已有的 `--warm-color` 和 `--card-bg` | 执行遗漏 |
| F-4 | P2 | 亲子任务卡缺少图标 | 将映射键修正为 `heart: HeartHandshake` | 执行遗漏 |

---

## 4. Round 2: Re-review（仅 Round 1 有 P0/P1 修复时执行）

- **F-1**：旧请求通过 generation 失效，abort 后保持 loading 直至客户端请求真正结束，不会与新提交竞争。
- **F-2**：收起任务、关闭结果及新旧体验切换均有明确焦点落点。
- **F-3**：替换后的变量在 growth、paper、sky、cyber 四套主题中均有定义。
- **无新增 finding**。
- **结论: PASS**

### Round 3: 浏览器发现项定向复审

- **F-4**：四个任务标识 `trend`、`calendar`、`food`、`heart` 均能命中图标映射。
- **无新增 finding**。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | robustness | P1 | keep（已修复） | `AIGrowthCoach.vue` 的阶段标签会响应式更新，而初版请求无阶段变化失效机制。 |
| F-2 | standards | P1 | keep（已修复） | 初版关闭按钮所在 DOM 被移除，处理函数没有恢复焦点。 |
| F-3 | standards | P1 | keep（已修复） | `style.css` 四主题中不存在初版引用的两个变量。 |
| F-4 | standards | P2 | keep（已修复） | 浏览器 DOM 检查确认亲子任务图标容器初版没有 SVG。 |

---

## 6. 总体结论: PASS

三项 P1 和一项 P2 已修复并通过定向复审，经典问答组件无代码变更。

---

## 7. 正式问题

### P0（必须修复）

无（F-4 已修复）。

### P1（应该修复）

无（F-1、F-2、F-3 均已修复）。

### P2（建议改进）

无。

---

## 8. Follow-up Items

无。

---

## 9. Review Summary

- **Review 轮次**: 3 轮（Round 1 3 项 candidate finding → 修复 3 项 → Round 2 PASS；浏览器发现 1 项 → Round 3 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 3 项
- **P2 keep**: 1 项（已修复）
- **Follow-up**: 0 项
- **最终结论**: PASS

---

## 10. Phase 3 Test Results

- `npm test`：164/164 PASS。
- `npm run build`：PASS。
- 真实浏览器：四任务选择、年龄阶段联动、编辑区展开/收起、焦点恢复、新旧体验双向切换均 PASS。
- 经典配置：以 `VITE_AI_EXPERIENCE_MODE=classic` 启动后只渲染原 `AISearch.vue`，PASS。
- 响应式：1200 × 800 与 390 × 844 均无横向溢出，控制台无错误。
