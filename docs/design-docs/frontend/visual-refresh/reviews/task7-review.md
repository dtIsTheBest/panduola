# Task 7 Code Review Report: 维护性与热点性能优化

> **Review Date**: 2026-07-31  
> **Task**: Task 7 — 优化维护性与热点性能  
> **Scope**: panduola，9 个代码/测试文件  
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/components/Dashboard.vue` — 删除失效布局代码并复用分类计数。
2. `src/components/AISearch.vue` — AI 设置弹窗复用焦点 composable。
3. `src/components/LinkModal.vue` — 链接弹窗复用焦点 composable。
4. `src/components/CategoryManager.vue` — 管理弹窗复用焦点及分类计数。
5. `src/components/CategoryModal.vue` — 分类弹窗复用焦点 composable。
6. `src/data/store.js` — 合并非关键访问统计写盘。
7. `src/composables/useDialogFocus.js` — 统一弹窗初始焦点、焦点循环和恢复。
8. `src/composables/useCategoryLinkCounts.js` — 单次扫描生成分类链接计数。
9. `tests/system-hardening.test.js` — 增加计数、批处理和并发边界测试。

### 关联文档

- Spec: `spec.md` §4.2.1、§4.3、§4.4、§7
- Tasks: `tasks.md` Task 7（4 个子任务、5 个验收标准）

### 关键设计决策

1. 四类弹窗保持现有公开契约，仅复用内部焦点机制。
2. 分类计数在响应式 computed 中对链接执行一次扫描。
3. 访问统计使用待处理增量批次，并与其他数据写入共享 mutationQueue。
4. 完整数据导入建立替换屏障，不接受旧访问批次污染。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

无。

### 2.2 健壮性类 (Robustness)

**F-1** (P1) — 队列外即时访问更新可被旧快照回滚
- **位置**: `src/data/store.js`
- **问题**: `recordVisit()` 在 mutationQueue 外修改链接；进行中的 Tauri 写操作完成后会用旧快照覆盖新访问次数。
- **证据**: 延迟写盘场景可稳定复现访问次数 `0 → 1 → 0`。

### 2.3 工程规范类 (Standards)

无。

### 2.4 契约破坏类 (Contract)

无。

### 2.5 需求/设计符合度类 (Spec Compliance)

F-1 违反 Task 7 的访问统计合并要求及现有统一串行写边界。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 旧快照回滚访问次数 | 使用 pending 增量，在 flush 的 mutationQueue 回调执行时基于最新链接状态应用 | 设计考虑不足 |

---

## 4. Round 2: Re-review

- F-1：PASS，访问批次与其他写操作共享串行边界。
- 新增 **F-2 (P1)**：导入前尚未入队的访问批次可能在 `replaceData()` 后污染同 ID 导入链接。
- 修复：数据替换建立计数屏障，取消旧待处理访问；替换期间暂停记录，已入队访问按队列顺序先执行并最终由导入覆盖。

### Round 3

- F-2：PASS。
- 替换成功、替换失败、并发替换及已入队/未入队访问边界均闭环。
- 无新增 finding。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | robustness | P1 | keep / fixed | 队列外状态可被进行中的旧快照覆盖，延迟写盘可复现 |
| F-2 | contract | P1 | keep / fixed | 完整导入后旧 pending delta 会修改导入数据，违背覆盖语义 |

---

## 6. 总体结论: PASS

三轮审查后，两项 P1 并发边界均已修复，无阻塞问题。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无，F-1、F-2 均已修复。

### P2（建议改进）

无。

---

## 8. Follow-up Items

无。

---

## 9. Review Summary

- **Review 轮次**: 3 轮（Round 1 1 项 → Round 2 1 项 → Round 3 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 2 项
- **P2 keep**: 0 项
- **Follow-up**: 0 项
- **最终结论**: PASS

---

## 10. Phase 3 Test Results

### 自动测试与构建

- `npm test`：14/14 PASS。
- 正常路径：分类汇总计数、连续访问合并写入。
- 边界路径：空分类、未知分类、队列写入交错、批次内重入、同 ID 数据导入。
- 异常路径：存储写入失败会拒绝调用方，后续重试可恢复。
- `npm run build`：PASS；CSS 产物由 Task 6 的 68.85 kB 降至 64.84 kB。
- `git diff --check`：PASS。

### 浏览器集成回归

- AI 设置、链接编辑、分类管理、分类编辑四类弹窗初始焦点正确。
- 首尾焦点循环、Escape 关闭、嵌套弹窗及触发按钮焦点恢复通过。
- 390 × 844 与 1200 × 800 均无横向溢出。
- 浏览器控制台无 error / warning。

### 最终测试结论

Task 7 的单元测试、并发边界、异常恢复、生产构建和浏览器回归全部通过。
