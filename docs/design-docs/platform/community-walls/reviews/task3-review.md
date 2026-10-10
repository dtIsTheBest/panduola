# Task 3 Code Review Report: 评论建议墙与私有亲子照片墙

> **Review Date**: 2026-10-10
> **Task**: Task 3 — 实现双墙 UI 并替换首页 AI 挂载
> **Scope**: panduola，5 个文件，约 +1585/-12 行
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/components/CommunityHub.vue` — 双墙容器、账号状态适配和隐私说明。
2. `src/components/CommentWall.vue` — 匿名浏览、登录发布、刷新和本人删除。
3. `src/components/FamilyPhotoWall.vue` — 私密照片处理、预览、上传、刷新和删除。
4. `src/components/Dashboard.vue` — 停止渲染 AIExperience，挂载 CommunityHub。
5. `src/App.vue` — 将登录请求接入现有 AccountCenter。

### 关联文档

- Spec: `spec.md` §2、3、4.2、4.3、7.2
- Tasks: `tasks.md` Task 3（5 个子任务、8 个验收标准）

### 关键设计决策

1. AI 文件、客户端、配额 migration 与 Edge Function 均保留，只替换首页挂载点。
2. 评论可匿名浏览，照片未登录时不发私有请求。
3. 账号切换使用 owner generation 清除照片和丢弃迟到响应。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

无。

### 2.2 健壮性类 (Robustness)

**F-1** (P1) — 刷新可能令 mutation 永久保持 busy
- **位置**: `CommentWall.vue`、`FamilyPhotoWall.vue`
- **问题**: 列表刷新和写操作共用 generation，刷新会阻止 mutation finally 释放状态。
- **证据**: publish/upload/delete 捕获的 generation 会被 `load*()` 递增。

**F-4** (P1) — 照片错误按钮总是刷新列表
- **位置**: `FamilyPhotoWall.vue`
- **问题**: 处理、上传、删除失败均无法重试对应操作。
- **证据**: 所有错误按钮原本只调用 `loadPhotos()`。

**F-6** (P1) — 迟到旧列表会覆盖成功 mutation
- **位置**: `CommentWall.vue`、`FamilyPhotoWall.vue`
- **问题**: 写成功后旧刷新仍可赋值，导致新内容消失或已删除内容重现。
- **证据**: mutation 成功未使当前 list request 失效。

### 2.3 工程规范类 (Standards)

**F-5** (P2) — 赛博主题危险文字对比度不足
- **位置**: `CommentWall.vue`、`FamilyPhotoWall.vue`
- **问题**: 固定暗红色在深色主题下不足 4.5:1。
- **证据**: 未使用项目主题危险色变量。

### 2.4 契约破坏类 (Contract)

**F-2** (P1) — 原生 maxlength 与 Unicode 口径不一致
- **位置**: `CommentWall.vue`、`FamilyPhotoWall.vue`
- **问题**: HTML 按 UTF-16 code unit 限制，Repository/数据库按 code point 校验。
- **证据**: emoji 可输入量只有设计上限的一半。

**F-3** (P1) — 删除确认缺少 Escape 和稳定焦点闭环
- **位置**: `CommentWall.vue`、`FamilyPhotoWall.vue`
- **问题**: 键盘无法 Escape 取消，部分成功/失败路径焦点丢失。
- **证据**: 内联确认没有 keydown 处理，删除后移除当前焦点节点。

### 2.5 需求/设计符合度类 (Spec Compliance)

无。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | generation 交叉失效 | 拆分 owner/list/mutation token，单独闭合 busy | 设计考虑不足 |
| F-2 | P1 | Unicode 上限不一致 | 移除 maxlength，统一 code-point 计数、禁用与 aria-invalid | 规范未遵守 |
| F-3 | P1 | Escape/焦点不完整 | 增加 Escape 取消，保留失败 trigger，成功聚焦稳定目标 | 执行遗漏 |
| F-4 | P1 | 错误动作不匹配 | 按 select/upload/delete/load 提供精确操作 | 设计考虑不足 |
| F-5 | P2 | 深色主题对比不足 | 使用 `--danger-color` 主题变量 | 执行遗漏 |
| F-6 | P1 | 旧列表覆盖写结果 | mutation 成功后失效旧列表、本地更新并发起新对账 | 设计考虑不足 |

---

## 4. Round 2～5: Re-review

- Round 2 验证 F-1～F-5 后发现 F-6 旧列表覆盖，已修复。
- Round 3/4 发现评论删除后的焦点目标会被 loading 或并发 publishing 禁用。
- 最终改为聚焦始终存在且不禁用的墙标题 `tabindex=-1`。
- Round 5 两位 reviewer 均无剩余 finding。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | robustness | P1 | keep/fixed | 用户可在 mutation 期间点击刷新，原 finally 确实可能失效。 |
| F-2 | contract | P1 | keep/fixed | Spec 明确以 Unicode 字符计数，原生 maxlength 口径不同。 |
| F-3 | contract | P1 | keep/fixed | Task 3 明确要求 Escape 和焦点闭环。 |
| F-4 | robustness | P1 | keep/fixed | 列表刷新不能重试文件处理、上传或删除。 |
| F-5 | standards | P2 | keep/fixed | 赛博主题固定红色对比度不足，主题变量已有合适值。 |
| F-6 | robustness | P1 | keep/fixed | 列表与 mutation 网络响应可任意重排，需显式淘汰旧请求。 |

---

## 6. 总体结论: PASS

所有正式问题已修复并经两位 reviewer 定向复审通过。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无未解决问题。

### P2（建议改进）

无未解决问题。

---

## 8. Follow-up Items

无。

---

## 9. Review Summary

- **Review 轮次**: 5 轮
- **P0 修复**: 0 项
- **P1 修复**: 5 项
- **P2 keep**: 0 项（1 项已修复）
- **Follow-up**: 0 项
- **最终结论**: PASS

## 10. Test Results

- 全量 Node 测试：189/189 PASS
- 生产构建：PASS
- 浏览器：1200×800、390×844 无横向溢出；游客评论、登录入口、焦点恢复 PASS
- `git diff --check`：PASS
