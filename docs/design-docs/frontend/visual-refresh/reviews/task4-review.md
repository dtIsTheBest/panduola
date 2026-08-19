# Task 4 Code Review Report: 集成、响应式与回归验证

> **Review Date**: 2026-07-30  
> **Task**: Task 4 — 完成集成、响应式与回归验证  
> **Scope**: 全部视觉改造文件及 `src/data/store.js` 只读上下文  
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/style.css` — 全局视觉系统和公共控件。
2. `src/App.vue`、`Header.vue`、`CategoryNav.vue` — 页面骨架、导航和年龄状态。
3. `Dashboard.vue`、`AISearch.vue` — 首页层级、AI 体验和设置弹窗。
4. `SearchBar.vue`、`LinkList.vue` — 链接搜索、卡片和状态。
5. `LinkModal.vue`、`CategoryManager.vue`、`CategoryModal.vue` — 三类管理弹窗。
6. `src/data/store.js` — 用户已有未提交数据改动，只读核对。

### 关联文档

- Spec: `spec.md` §3、§4、§6、§7、§8.4
- Tasks: `tasks.md` Task 4（4 个子任务、10 个验收标准）

### 关键设计决策

1. 五个关键视口同时验证首页与链接库。
2. 通过真实浏览器交互验证导航、筛选、搜索、收藏、表单和弹窗。
3. 不新增测试框架、运行时依赖、远程资源或构建配置。

---

## 2. Round 1: Reviewer 意见汇总

### 2.1 正确性审查

**F-1** (P1 candidate, drop) — `Dashboard.view-all-links` 声明但不可触发
- **位置**: `src/components/Dashboard.vue:139`
- **问题**: “最近添加 → 查看全部”触发 `stat-click({ type: 'today' })`，没有发出 `view-all-links`。
- **证据**: `App.vue` 仍保留 `view-all-links` 监听。

其余集成检查通过：`clearSelection()` 同步路径安全、弹窗焦点与嵌套隔离有效、LinkList Enter 修复有效、store 用户 diff 保留、构建与五视口结果一致。

### 2.2 代码质量审查

**F-2** (P1) — AI 设置遮罩覆盖对话框并拦截指针操作
- **位置**: `src/components/AISearch.vue:956`
- **问题**: 全局 `.modal-overlay` 的 `z-index: 1000` 高于同级 AI 对话框。
- **证据**: 遮罩和对话框同在 `.ai-settings-modal` 下，对话框原先没有正向 z-index。

**F-3** (P1) — “导入数据”的键盘焦点不可见
- **位置**: `src/App.vue:291`
- **问题**: 实际焦点位于透明文件输入框，外层标签没有焦点状态。
- **证据**: 输入框 `opacity: 0`，其自身轮廓不可见。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-2 | P1 | AI 遮罩拦截触屏点击 | AI 遮罩设为 `z-index: 0`，对话框设为 `z-index: 1` | 全局样式级联考虑不足 |
| F-3 | P1 | 导入操作焦点不可见 | 为 `.import-btn:focus-within` 增加 2px 描边和 3px offset | 透明原生控件焦点遗漏 |

Phase 3 还发现 Dashboard 清除年龄筛选后，CategoryNav 的选中高亮未同步。增加 `CategoryNav.clearSelection()` 并由 `App.handleClearAgeStage()` 调用，保持原事件契约且不重复 emit。

---

## 4. Round 2: Re-review

- **F-2**：PASS，计算样式为遮罩 z-index 0、对话框 z-index 1，鼠标点击“取消”成功关闭。
- **F-3**：PASS，文件输入聚焦时外层 `focus-within` 为 true，计算轮廓为 solid 2px、offset 3px。
- **无新增 P0/P1 finding**。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | contract | P1 | drop | `stat-click({type:'today'})` 在本次视觉任务开始前已存在于用户 dirty worktree；恢复旧 HEAD 行为会覆盖用户当前“今日新增”筛选语义 |
| F-2 | standards / usability | P1 | keep / fixed | 全局 z-index 确实使同级遮罩位于对话框之上 |
| F-3 | standards / accessibility | P1 | keep / fixed | 实际焦点元素透明，缺少外层 focus-within 时无法看到焦点 |

---

## 6. 总体结论: PASS

所有本次改动引入的 P1 finding 已修复并复审通过；F-1 为用户既有功能语义，按 dirty-worktree 保护原则不改动。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

F-2、F-3，均已修复。

### P2（建议改进）

无新增项；Task 2 已记录 Dashboard/AISearch 重复 scoped CSS 的后续清理建议。

---

## 8. Follow-up Items

| ID | 内容 | 优先级 | 建议处理时机 |
|----|------|--------|-------------|
| T2-F6 | 合并 Dashboard 与 AISearch 的重复 scoped CSS 规则 | P2 | 后续独立 CSS 清理任务 |

---

## 9. Review Summary

- **Review 轮次**: 2 轮（Round 1 3 项 candidate finding → 修复 2 项、drop 1 项 → Round 2 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 2 项
- **P2 keep**: 0 项
- **Follow-up**: 1 项（继承 Task 2）
- **最终结论**: PASS

## 10. Phase 3 测试结果

### 自动与静态检查

- `npm run build` PASS：1572 modules，CSS 64.39 kB（gzip 10.32 kB），JS 155.63 kB（gzip 55.51 kB）。
- `git diff --check` PASS。
- package、lockfile、Vite 和 Tauri 配置 diff 为 0。
- 无新增远程字体、CDN、图片 URL 或运行时依赖。
- `prefers-reduced-motion` 规则存在；链接卡片无限 glow 动画已移除。

### 五视口 DOM 断言

| 视口 | 首页 scrollWidth | 链接库 scrollWidth | 结果 |
|------|------------------|---------------------|------|
| 1440 × 900 | 1440 | 1440 | PASS |
| 1200 × 800 | 1200 | 1200 | PASS |
| 992 × 768 | 992 | 992 | PASS |
| 768 × 1024 | 768 | 768 | PASS |
| 390 × 844 | 390 | 390 | PASS |

### 正常、边界与异常路径

- **正常路径**：首页/链接库切换、年龄选择/清除、今日新增统计跳转、返回首页、收藏切换并恢复原状态、三类管理弹窗和 AI 设置均 PASS。
- **边界条件**：空搜索、Unicode/emoji 搜索、超长中文标题/描述、390px 弹窗、24px 最小触屏目标、2px 键盘焦点轮廓均 PASS。
- **异常场景**：空链接表单提交被原生必填校验拦截，弹窗保持打开且数据未新增。
- **截图核对**：首页、链接库、分类管理/编辑弹窗和 AI 设置均完成真实渲染检查。
- **用户改动保护**：`src/data/store.js` 保持 modified，96 additions / 6 deletions 的既有 diff 未被回退。

### 测试结论

全部测试通过，无需新增测试代码或测试依赖。
