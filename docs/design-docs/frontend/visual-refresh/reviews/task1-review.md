# Task 1 Code Review Report: 家长端页面视觉焕新

> **Review Date**: 2026-07-30  
> **Task**: Task 1 — 建立全局主题系统并焕新应用骨架  
> **Scope**: panduola，4 文件，工作区相对 HEAD 为 +474/-499（含用户原有未提交修改）  
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/style.css` — 新增清新育儿主题变量、公共控件、焦点和减少动效规则。
2. `src/App.vue` — 调整应用骨架、链接库工具栏和 Footer，并统一移动侧栏控制入口。
3. `src/components/Header.vue` — 焕新品牌导航，补充按钮可访问名称。
4. `src/components/CategoryNav.vue` — 焕新年龄侧栏，统一移动状态并补充键盘操作语义。

### 关联文档

- Spec: `spec.md` §3.1、§3.2、§4.1、§4.2.1、§4.3
- Tasks: `tasks.md` Task 1（4 个子任务、6 个验收标准）

### 关键设计决策

1. 使用全局语义 CSS 变量作为跨组件视觉契约。
2. 保留 Header 与 CategoryNav 的既有 props/events。
3. 移动侧栏通过 `defineExpose()` 暴露内部切换方法，避免增加 props/events。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

无。

### 2.2 健壮性类 (Robustness)

**F-1** (P1) — 移动端存在父子两套互不关联的侧栏状态
- **位置**: `src/App.vue:13`、`src/components/CategoryNav.vue:3`
- **问题**: Header 菜单修改父层状态，实际侧栏和遮罩由组件内部状态控制。
- **证据**: 根节点 `open` 类未被侧栏 CSS 消费，内部 `.sidebar.open` 来自另一 ref。

**F-2** (P1) — 768px 视口的 JS 与 CSS 移动端判断不一致
- **位置**: `src/components/CategoryNav.vue:83`
- **问题**: JS 使用 `< 768`，CSS 使用 `max-width: 768px`。
- **证据**: 768px 时侧栏进入覆盖布局但遮罩不会渲染。

### 2.3 工程规范类 (Standards)

**F-3** (P1) — 年龄阶段入口无法通过键盘操作
- **位置**: `src/components/CategoryNav.vue:17`
- **问题**: 可点击元素使用普通 `div`，没有按钮语义或键盘处理。
- **证据**: 元素不能获得焦点，全局 `:focus-visible` 无法生效。

**F-4** (P1) — 表单局部规则覆盖清晰焦点描边
- **位置**: `src/style.css:242`
- **问题**: `.form-*:focus` 的 `outline: none` 覆盖全局焦点样式。
- **证据**: 键盘焦点只剩低对比阴影。

**F-5** (P1) — 主按钮和危险按钮文字对比度不足
- **位置**: `src/style.css:126`
- **问题**: 白字与原主色、危险色对比度低于 4.5:1。
- **证据**: 对比度分别约为 3.28:1 和 3.42:1。

**F-6** (P1) — muted 文本 token 对比度不足
- **位置**: `src/style.css:20`
- **问题**: `#8aa09c` 用于小字号年龄范围和 placeholder。
- **证据**: 与白色背景对比度约为 2.77:1。

**F-7** (P2) — Header 图标按钮缺少可访问名称
- **位置**: `src/components/Header.vue:5`
- **问题**: 菜单和刷新按钮只有 SVG。
- **证据**: 辅助技术无法可靠区分用途。

### 2.4 契约破坏类 (Contract)

无。

### 2.5 需求/设计符合度类 (Spec Compliance)

F-1 至 F-7 同时违反 spec §3.2 的响应式、焦点、对比度和触屏/键盘可用性要求。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 侧栏双状态 | App 通过 ref 调用 CategoryNav 暴露的唯一 `toggleSidebar()` | 设计考虑不足 |
| F-2 | P1 | 768px 判断不一致 | JS 统一使用 `<= 768`，并在卸载时移除 resize 监听 | 执行遗漏 |
| F-3 | P1 | 年龄项不可键盘操作 | 改为原生 `button`，增加 `aria-pressed` | 规范未遵守 |
| F-4 | P1 | 表单焦点描边被覆盖 | 移除 `outline: none` 并增加 2px `:focus-visible` 描边 | 执行遗漏 |
| F-5 | P1 | 按钮对比度不足 | 主色与危险色调整到白字对比度至少 4.5:1 | 规范未遵守 |
| F-6 | P1 | 弱化文字对比度不足 | `--text-muted` 调深为 `#5f7773` | 规范未遵守 |
| F-7 | P2 | 图标按钮无名称 | 为菜单、刷新和品牌首页按钮补充 `aria-label` | 执行遗漏 |

---

## 4. Round 2 / Round 3: Re-review

- **F-1**：PASS，Header 菜单、侧栏按钮和遮罩控制同一内部状态。
- **F-2**：PASS，JS 与 CSS 均以 768px 为移动边界。
- **F-3**：PASS，原生按钮支持键盘和选中态语义。
- **F-4**：PASS，表单具备明确焦点描边。
- **F-5**：Round 2 默认态 PASS，但发现 hover 渐变起始色仍只有约 3.93:1，对应新增 **F-8 (P1)**。
- **F-6**：PASS，muted 文本在白色与 soft surface 上均超过 4.5:1。
- **F-7**：PASS，图标按钮均具备可访问名称。
- **F-8**：将主按钮 hover 渐变调整为 `#236f67 → #175e57`；Round 3 PASS。
- **无新增 finding**。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | robustness | P1 | keep / fixed | `App.vue` 与 `CategoryNav.vue` 确有两套状态，修复后只调用内部状态 |
| F-2 | robustness | P1 | keep / fixed | spec 明确要求验证 768px，原判断在该宽度不一致 |
| F-3 | standards | P1 | keep / fixed | 普通 `div` 不可聚焦，改为 button 后满足键盘操作 |
| F-4 | standards | P1 | keep / fixed | scoped 表单规则 specificity 更高，原先确实清除 outline |
| F-5 | standards | P1 | keep / fixed | 原色对比度低于 spec 引用的 WCAG 4.5:1 |
| F-6 | standards | P1 | keep / fixed | muted token 用于小字号正文，原对比度低于 4.5:1 |
| F-7 | standards | P2 | keep / fixed | Header 两个图标按钮无可访问名称 |
| F-8 | standards | P1 | keep / fixed | hover 起始色与白字对比度约 3.93:1 |

---

## 6. 总体结论: PASS

所有 keep finding 已修复，生产构建与定向 re-review 通过。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

F-1、F-2、F-3、F-4、F-5、F-6、F-8，均已修复。

### P2（建议改进）

F-7，已修复。

---

## 8. Follow-up Items

无。

---

## 9. Review Summary

- **Review 轮次**: 3 轮（Round 1 7 项 candidate finding → Round 2 新增 1 项状态对比度 finding → Round 3 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 7 项
- **P2 keep**: 1 项，已修复
- **Follow-up**: 0 项
- **最终结论**: PASS

## 10. Phase 3 测试结果

- **测试类型**: 生产构建 + 静态契约/资源/配置检查
- **用例数**: 5
- **结果**: 5 PASS
- `npm run build` PASS；无外部视觉资源；依赖与 Tauri 配置无变更；减少动效规则及组件契约检查 PASS。
