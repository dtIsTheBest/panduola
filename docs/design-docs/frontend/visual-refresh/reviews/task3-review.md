# Task 3 Code Review Report: 链接库与管理弹窗视觉

> **Review Date**: 2026-07-30  
> **Task**: Task 3 — 统一链接库与管理弹窗视觉  
> **Scope**: `SearchBar.vue`、`LinkList.vue`、`LinkModal.vue`、`CategoryManager.vue`、`CategoryModal.vue`  
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/components/SearchBar.vue` — 搜索输入、清除操作和焦点视觉。
2. `src/components/LinkList.vue` — 链接库层级、卡片、状态、收藏和触屏操作。
3. `src/components/LinkModal.vue` — 链接表单弹窗视觉、语义和键盘焦点管理。
4. `src/components/CategoryManager.vue` — 分类管理布局、操作可见性和键盘焦点管理。
5. `src/components/CategoryModal.vue` — 分类表单、图标/颜色/年龄选择器和键盘焦点管理。

### 关联文档

- Spec: `spec.md` §3.1、§3.2、§4.2.1、§4.3
- Tasks: `tasks.md` Task 3（4 个子任务、7 个验收标准）

### 关键设计决策

1. 保持 LinkList、LinkModal 和分类弹窗的 props/emits/store 契约不变。
2. 交互选择项使用原生按钮，触屏条件下编辑/删除操作常显。
3. 三类弹窗与 AI 设置弹窗采用一致的打开聚焦、焦点循环、Escape 关闭和焦点恢复。

---

## 2. Round 1: Reviewer 意见汇总

### 2.1 正确性审查

**F-1** (P1) — 收藏按钮按 Enter 会同时打开链接
- **位置**: `src/components/LinkList.vue:35`
- **问题**: 父链接区域监听 Enter，收藏按钮的 keydown 冒泡会先触发 `openLink()`。
- **证据**: 收藏按钮的 `.stop` 只作用于后续 click，无法阻止已经发生的 keydown。

**F-2** (P1) — 分类选择项和编辑/删除按钮存在交互嵌套
- **位置**: `src/components/CategoryManager.vue:15`
- **问题**: 自定义按钮容器包裹原生操作按钮，键盘事件可能串扰。
- **证据**: 子按钮 Enter 会冒泡到父分类选择处理器。

### 2.2 代码质量审查

**F-1**、**F-2** 与正确性审查重复，合并处理。

**F-3** (P1) — 三类管理弹窗缺少完整键盘焦点管理
- **位置**: `src/components/LinkModal.vue:2`、`CategoryManager.vue:2`、`CategoryModal.vue:2`
- **问题**: 虽有 dialog 语义，但打开后未聚焦、Tab 可离开弹窗、无 Escape 与关闭后焦点恢复。
- **证据**: 三组件原脚本均无焦点引用和键盘处理函数。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 收藏 Enter 冒泡打开链接 | 改为 `@keydown.enter.self.prevent`，仅父链接自身聚焦时触发 | 交互边界考虑不足 |
| F-2 | P1 | 分类操作嵌套与事件串扰 | 将分类选择改为独立原生按钮，与编辑/删除按钮并列 | 可访问语义考虑不足 |
| F-3 | P1 | 三类弹窗焦点管理缺失 | 增加打开聚焦、焦点循环、Escape、焦点恢复，并隔离嵌套弹窗事件 | 执行遗漏 |

浏览器验证期间另发现分类删除按钮背景被局部白色规则覆盖，已将白色背景限制到非危险按钮，恢复危险操作的红底白图标。

---

## 4. Round 2: Re-review

- **F-1**：PASS，收藏按钮 Enter 不再触发父链接。
- **F-2**：PASS，分类选择、编辑和删除均为并列原生按钮。
- **F-3**：PASS，三类弹窗焦点管理完整；嵌套分类弹窗不会关闭外层弹窗。
- **无新增 P0/P1 finding**。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | correctness / standards | P1 | keep / fixed | `keydown` 在 click 前冒泡，原 `.stop` 无法阻止父处理器 |
| F-2 | correctness / standards | P1 | keep / fixed | 交互元素嵌套会造成键盘路径串扰 |
| F-3 | standards | P1 | keep / fixed | spec 要求弹窗键盘焦点可见、可用且不落到背景页面 |

---

## 6. 总体结论: PASS

所有 P1 finding 已修复并通过两路聚焦复审。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

F-1、F-2、F-3，均已修复。

### P2（建议改进）

无。

---

## 8. Follow-up Items

无。

---

## 9. Review Summary

- **Review 轮次**: 2 轮（Round 1 3 项去重 finding → 全部修复 → Round 2 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 3 项
- **P2 keep**: 0 项
- **Follow-up**: 0 项
- **最终结论**: PASS

## 10. Phase 3 测试结果

- **测试类型**: 生产构建 + 静态契约检查 + 390 × 844 浏览器渲染与键盘冒烟
- **用例数**: 10
- **结果**: 10 PASS
- `npm run build` PASS；LinkList 事件、LinkModal `isDefault` 和三类弹窗 props/emits 均保留。
- 链接库、链接弹窗、分类管理和分类编辑均满足 `scrollWidth <= innerWidth`。
- LinkModal 打开后聚焦标题，Escape 后回到“添加链接”。
- CategoryManager 打开后聚焦关闭按钮，Escape 后回到“分类总数”。
- 嵌套 CategoryModal 打开后聚焦分类名称，Escape 仅关闭子弹窗并回到“添加子分类”。
