# Task 6 Code Review Report: 安全、数据可靠性与交互契约加固

> **Review Date**: 2026-07-30  
> **Task**: Task 6 — 加固安全、数据可靠性与交互契约  
> **Scope**: panduola，13 个代码/测试文件  
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/utils/externalLinks.js` — 安全 URL 校验和隔离打开。
2. `src/data/store.js` — Schema v2、宽容迁移、严格导入、统一写队列和 CRUD 持久化。
3. `src/App.vue` — 导入替换、筛选和视图状态重置。
4. `src/components/Header.vue` — 传递移动菜单触发元素。
5. `src/components/AISearch.vue` — 安全文本渲染、会话级 Key 和风险提示。
6. `src/components/CategoryManager.vue` — 分类写接口和异步保存状态。
7. `src/components/CategoryModal.vue` — 成功后关闭和统一焦点恢复。
8. `src/components/CategoryNav.vue` — inert、焦点进入/恢复和 Escape。
9. `src/components/Dashboard.vue` — 年龄筛选、查看全部和安全外链。
10. `src/components/LinkList.vue` — 收藏筛选、年龄筛选和安全外链。
11. `src/components/LinkModal.vue` — URL 校验和保存失败处理。
12. `tests/system-hardening.test.js` — 数据、安全和并发测试。
13. `package.json` — Node 测试入口。

### 关联文档

- Spec: `spec.md` §2、§3、§4.2、§7
- Tasks: `tasks.md` Task 6（4 个子任务、9 个验收标准）

### 关键设计决策

1. 旧持久化数据采用宽容迁移，保留不安全旧链接但禁止打开。
2. 新导入和新增链接采用严格校验，仅允许 HTTP(S)。
3. 初始化、迁移和全部写操作共享一个串行队列。
4. Web 端 API Key 仅保存在当前内存会话。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

**F-7** (P2) — 迁移不落盘且单次写入重复规范化
- **位置**: `src/data/store.js`
- **问题**: 旧数据每次启动重复迁移，写操作执行两次全量规范化和深拷贝。
- **证据**: `getSnapshot()` 和 `saveData()` 均调用 `normalizeData()`，`init()` 未回写迁移结果。

### 2.2 健壮性类 (Robustness)

**F-1** (P0) — 单条旧不安全 URL 导致整包用户数据回退
- **位置**: `src/data/store.js`
- **问题**: 迁移和新导入共享严格 URL 校验，任意旧 FTP 等链接会令加载回退到默认数据。

**F-2** (P1) — Tauri 2 环境被误判为 Web
- **位置**: `src/data/store.js`
- **问题**: 仅检查未启用的 `window.__TAURI__`，绕过桌面数据文件。

**F-3** (P1) — 并发异步写入可能互相覆盖
- **位置**: `src/data/store.js`
- **问题**: 多个 mutation 基于旧状态生成快照并独立异步保存。

**F-5** (P1) — 分类弹窗在持久化完成前关闭
- **位置**: `src/components/CategoryModal.vue`、`CategoryManager.vue`
- **问题**: Vue emit 不等待父组件 Promise，失败后输入已丢失。

**F-6** (P1) — 导入和迁移字段规范化不足
- **位置**: `src/data/store.js`
- **问题**: 非数组 children、空 description 和非法 tags 可进入运行态并使搜索崩溃。

### 2.3 工程规范类 (Standards)

无。

### 2.4 契约破坏类 (Contract)

**F-4** (P1) — 一级分类操作可能被保存为子分类
- **位置**: `src/components/CategoryManager.vue`
- **问题**: Modal 的 parentId 从当前选中分类隐式推导，一级分类操作也会携带父 ID。

### 2.5 需求/设计符合度类 (Spec Compliance)

F-1 至 F-6 与 Spec 的数据保留、统一持久化、Tauri 兼容和失败路径要求相关。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P0 | 旧不安全 URL 导致整包回退 | 拆分宽容迁移与严格导入，保留旧记录并由打开层拦截 | 设计考虑不足 |
| F-2 | P1 | Tauri 环境误判 | 同时识别 `__TAURI_INTERNALS__` 与兼容全局标记 | Spec 理解偏差 |
| F-3 | P1 | 并发写覆盖 | 所有 mutation 进入统一 Promise 写队列 | 设计考虑不足 |
| F-4 | P1 | 一级分类父级错误 | 显式维护 `categoryParentId` 和操作模式 | 执行遗漏 |
| F-5 | P1 | 失败前关闭弹窗 | 父组件等待保存成功后关闭，并暴露 saving 状态 | 执行遗漏 |
| F-6 | P1 | 字段校验不足 | 递归规范化旧数据，严格校验新导入及分类引用 | 设计考虑不足 |
| F-7 | P2 | 重复迁移与规范化 | 迁移后回写，单次提交只规范化一次 | 设计考虑不足 |

---

## 4. Round 2: Re-review

- F-1 至 F-7：PASS。
- 新增 **F-8 (P1)**：`init()` 的读取和迁移回写绕过 mutationQueue。
- 新增 **F-9 (P2)**：分类保存成功后父组件直接隐藏 Modal，未触发焦点恢复。
- 修复：将完整初始化流程加入写队列；在 `visible=false` watcher 中统一恢复焦点。

### Round 3

- F-8：PASS，并发初始化测试覆盖通过。
- F-9：PASS，成功保存和手动关闭共享焦点恢复路径。
- 无新增 finding。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | robustness | P0 | keep / fixed | 严格校验异常会进入默认数据回退分支 |
| F-2 | robustness | P1 | keep / fixed | Tauri 配置未启用旧全局标记 |
| F-3 | robustness | P1 | keep / fixed | mutation 在 await 前基于同一旧快照计算 |
| F-4 | contract | P1 | keep / fixed | parentId 表达式会继承当前选中分类 |
| F-5 | robustness | P1 | keep / fixed | Vue emit 不等待异步监听器 |
| F-6 | robustness | P1 | keep / fixed | 多个消费端假设 description/tags/children 类型稳定 |
| F-7 | performance | P2 | keep / fixed | 加载未回写，保存重复 normalize |
| F-8 | robustness | P1 | keep / fixed | init 的异步保存原先不受 mutationQueue 约束 |
| F-9 | standards | P2 | keep / fixed | 成功路径未调用子组件 close |

---

## 6. 总体结论: PASS

三轮审查后，所有 P0/P1/P2 finding 均已修复，无阻塞问题。

---

## 7. 正式问题

### P0（必须修复）

无，F-1 已修复。

### P1（应该修复）

无，F-2 至 F-6、F-8 已修复。

### P2（建议改进）

无，F-7、F-9 已修复。

---

## 8. Follow-up Items

| ID | 内容 | 优先级 | 建议处理时机 |
|----|------|--------|-------------|
| T7 | Dashboard 清理、弹窗 composable 和访问统计合并 | P2 | Task 7 |

---

## 9. Review Summary

- **Review 轮次**: 3 轮（Round 1 7 项 → Round 2 2 项 → Round 3 PASS）
- **P0 修复**: 1 项
- **P1 修复**: 6 项
- **P2 修复**: 2 项
- **Follow-up**: 1 项
- **最终结论**: PASS

---

## 10. Phase 3 Test Results

### 自动测试与构建

- `npm test`：8/8 PASS。
- `npm run build`：PASS，Vite 生产构建成功。
- `git diff --check`：PASS。
- 静态安全扫描：AI 组件无 `v-html`，不再持久化 OpenAI API Key；外链统一经过安全工具。

### 浏览器集成回归

- 首页五个次级内容区保持单行 Tab；“最近添加”的“查看全部”进入全部链接。
- 链接库收藏筛选可进入和退出，退出后恢复完整列表。
- 年龄筛选按链接自身 `ageStages` 生效，清除筛选后状态恢复。
- 分类管理区分一级/子分类表单，关闭后焦点返回触发按钮。
- 390 × 844：无横向溢出；关闭侧栏不可聚焦，打开时焦点进入关闭按钮，Escape 后焦点返回菜单按钮。
- 1200 × 800：无横向溢出，五个 Tab 保持完整。
- 浏览器控制台：无 error / warning。

### 最终测试结论

Task 6 的自动测试、构建、静态检查和浏览器回归全部通过。
