# Task 17 Code Review Report: 成长标准工具与权威资源

> **Review Date**: 2026-09-16
> **Task**: 17 — 补全成长标准工具与权威资源
> **Scope**: panduola，7 文件，+1228/-39 行
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/data/childDevelopmentGuide.js` — 成长标准、保健节点、视力节点和官方来源。
2. `src/components/ChildDevelopmentGuide.vue` — 成长标准速查弹窗和可访问 Tab。
3. `src/components/Dashboard.vue` — 新工具入口、阶段入口复用和去重。
4. `src/data/store.js` — 关键内置资源官方化及旧占位链接迁移。
5. `tests/child-development-guide.test.js` — 标准覆盖、来源、迁移和边界测试。
6. `docs/design-docs/frontend/visual-refresh/spec.md` — Task 17 需求与设计。
7. `docs/design-docs/frontend/visual-refresh/tasks.md` — Task 17 实施清单。

### 关联文档

- Spec: `spec.md` §3.1、3.2、4.2.1、4.2.5、7
- Tasks: `tasks.md` Task 17（5 个子任务、9 个验收标准）

### 关键设计决策（如有用户确认）

1. 站内提供标准选择、时间节点和使用说明，完整数值表打开官方原文。
2. 只迁移“系统 ID + 精确旧占位 URL”，任何自定义 URL 保持不变。
3. 标准用于筛查和趋势参考，不提供诊断或自行治疗建议。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

无。

### 2.2 健壮性类 (Robustness)

**F-1** (P1) — 导入与仓储保存使用不同迁移路径
- **位置**: `src/data/store.js:478`
- **问题**: 严格导入初版不迁移，但仓储保存会再次非严格规范化，造成内存与持久化结果不一致。
- **证据**: `replaceData()` 经 `validateImportData()` 后，repository `save()` 仍会调用 `normalizeData()`。

**F-2** (P1) — 官方资源仍沿用旧占位链接的年龄标签
- **位置**: `src/data/store.js:182`
- **问题**: 7 岁以下、7～18 岁和 0～6 岁眼保健资料会推荐给不适用年龄。
- **证据**: l3、l7、l8 的 `ageStages` 与标题中的官方年龄范围相反，l4 还遗漏 13 周岁 HPV 阶段。

**F-3** (P1) — 18～22 岁阶段仍主动推荐儿童标准
- **位置**: `src/components/Dashboard.vue:545`
- **问题**: 初版只排除 `age22+`，19～22 岁仍会收到最高适用至 18 岁的标准入口。
- **证据**: 数据层没有 `age18-22` 的标准 guidance。

**F-4** (P2) — 等价入口在部分阶段重复出现
- **位置**: `src/components/Dashboard.vue:459`
- **问题**: milestones/standards、health/standards、feeding/food 分别打开同一工具，但按 ID 判重会重复展示。
- **证据**: 补充逻辑只检查新增 ID，没有检查等价 action ID。

**F-5** (P2) — 阶段查询误返回对象原型属性
- **位置**: `src/data/childDevelopmentGuide.js:156`
- **问题**: `toString`、`__proto__` 等未知值不会降级为 null。
- **证据**: 初版直接通过方括号读取普通对象。

### 2.3 工程规范类 (Standards)

**F-6** (P2) — 无交互内容的 Tab 面板不可聚焦
- **位置**: `src/components/ChildDevelopmentGuide.vue:111`
- **问题**: 保健节点面板没有按钮且没有 `tabindex`，焦点陷阱会从 Tab 直接循环到关闭按钮。
- **证据**: 三个 `tabpanel` 初版均不可聚焦。

### 2.4 契约破坏类 (Contract)

无。

### 2.5 需求/设计符合度类 (Spec Compliance)

无。

---

## 3. Round 1 Fixes（如有修复）

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | 导入与保存结果不一致 | 精确系统占位链接在读取、导入和保存时使用同一幂等迁移；不覆盖 categoryId | 设计考虑不足 |
| F-2 | P1 | 年龄标签错误 | 校正 l3/l4/l7/l8 年龄范围并增加迁移断言 | 执行遗漏 |
| F-3 | P1 | 18 岁以上误推荐 | 用 0～18 岁阶段白名单控制补充入口 | 执行遗漏 |
| F-4 | P2 | 等价入口重复 | 为成长标准与辅食入口建立等价 ID Set | 设计考虑不足 |
| F-5 | P2 | 原型键误命中 | 使用 `Object.hasOwn` 并补充原型键测试 | 执行遗漏 |
| F-6 | P2 | Tab 面板不可聚焦 | 为活动面板增加 `tabindex="0"` | 执行遗漏 |
| F-7 | P2 | 可聚焦面板没有可见焦点 | 增加使用主题 `focus-ring` 的 `:focus-visible` 样式 | 执行遗漏 |
| F-8 | P2 | 身高标准残留体重/计算标签 | 改为“身高/发育/标准”并增加迁移断言 | 执行遗漏 |
| F-9 | P2 | 重开弹窗停留在上次 Tab | 每次打开时重置到“生长标准” | 设计考虑不足 |

---

## 4. Round 2: Re-review（仅 Round 1 有 P0/P1 修复时执行）

- **F-1～F-6**：定向复审均已闭环。
- 新发现 **F-7**、**F-8**（P2）：可聚焦面板仍使用 `outline: none`；l7 仍保留旧“体重/计算”搜索标签。
- 修复：增加主题 `focus-ring` 的 `:focus-visible`；标签改为“身高/发育/标准”并锁定迁移结果。

### Round 3: Final Re-review

- 面板焦点在四套主题下清晰可见。
- l7 搜索语义与 WS/T 612—2018 身高资料一致。
- 浏览器冒烟新增 **F-9**（P2）：从阶段入口重开弹窗会停留在上次 Tab。
- 修复：监听 `visible`，每次打开重置到“生长标准”。

### Round 4: Final Re-review

- 弹窗首次及每次重开均从“生长标准”开始，打开期间的 Tab 选择不被重置。
- **无新增 finding**。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | robustness | P1 | keep（已修复） | 仓储保存确定会再次调用 `normalizeData`，初版存在双路径差异。 |
| F-2 | robustness | P1 | keep（已修复） | 资源标题中的官方年龄范围与初版 `ageStages` 不一致。 |
| F-3 | spec-compl | P1 | keep（已修复） | 工具声明覆盖 0～18 岁，但初版包含 `age18-22`。 |
| F-4 | standards | P2 | keep（已修复） | 不同 action ID 由同一 `handleAction` 分支打开相同工具。 |
| F-5 | robustness | P2 | keep（已修复） | 普通对象方括号访问会命中 `Object.prototype`。 |
| F-6 | standards | P2 | keep（已修复） | 保健节点面板内部无可聚焦元素。 |
| F-7 | standards | P2 | keep（已修复） | 面板可聚焦后初版仍隐藏 outline，键盘用户无位置反馈。 |
| F-8 | contract | P2 | keep（已修复） | l7 内容已变为纯身高标准，旧“体重/计算”标签会造成搜索误命中。 |
| F-9 | spec-compl | P2 | keep（已修复） | 阶段入口再次打开时应直接展示适用标准，而非继承上次浏览位置。 |

---

## 6. 总体结论: PASS

全部 P1/P2 已修复并通过四轮审查，无阻塞问题。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无（F-1、F-2、F-3 已修复）。

### P2（建议改进）

无（F-4～F-9 均已修复）。

---

## 8. Follow-up Items

无。

---

## 9. Review Summary

- **Review 轮次**: 4 轮（Round 1 6 项 → Round 2 新增 2 项 P2 → 浏览器新增 1 项 P2 → Round 4 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 3 项
- **P2 keep**: 6 项（均已修复）
- **Follow-up**: 0 项
- **最终结论**: PASS

---

## 10. Phase 3 Test Results

- `npm test`：171/171 PASS。
- `npm run build`：PASS。
- 桌面浏览器：全部工具入口、三个标准卡片、Tab 键盘、Escape 关闭、阶段入口复用均 PASS。
- 390 × 844：弹窗全屏适配、单列卡片、无横向溢出，PASS。
- 控制台：无 error/warning。
