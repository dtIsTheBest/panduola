# Task 8 Code Review Report: 本地优先账号与云端同步

> **Review Date**: 2026-08-19
> **Task**: Task 8 — 增加账号、同步、冲突与恢复交互
> **Scope**: panduola，6 个代码文件、2 个测试文件，约 +1900/-40 行
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/components/AccountCenter.vue` — 登录、同步、迁移、冲突、恢复和诊断交互。
2. `src/components/Header.vue` — 账号入口、同步状态与 ARIA 弹层语义。
3. `src/App.vue` — 账号中心挂载、触发器焦点和业务数据导出。
4. `src/account/accountSyncFacade.js` — 恢复副本、原子恢复和脱敏诊断接口。
5. `src/data/store.js` — 账号空间内的原子恢复事务。
6. `src/data/dataSpaceRepository.js` — Web 恢复副本跨标签串行写入。
7. `tests/account-facade.test.js` — 账号隔离恢复与脱敏诊断导出。
8. `tests/data-spaces.test.js` — 原子恢复、失败回滚、dirty 与并发顺序。

### 关联文档

- Spec: `spec.md` §3.1、§3.2、§4.2.1、§4.2.2、§4.2.5、§4.3、§8.1、§8.3。
- Tasks: `tasks.md` Task 8（5 个子任务、8 个验收标准）。

### 关键设计决策

1. UI 只依赖账号门面，不直接依赖 Supabase 或 Store。
2. 配置缺失时入口仍可见，明确展示“本地模式”和导出通道。
3. 恢复操作在 Store 单一 mutation 中完成空间校验、当前快照备份和副本应用。
4. 恢复列表与 userId/requestId 绑定，账号切换时立即清空完整 Snapshot。
5. 策略操作必须在 pending decision 真正消失后才呈现成功。

---

## 2. Round 1–2: Findings

### 2.1 性能类 (Performance)

- **F-9 (P2)**：恢复列表仍加载最多五份完整 Snapshot。

### 2.2 健壮性类 (Robustness)

- **F-1 (P0)**：facade 新 Store 契约导致既有账号测试 fake 构造失败。
- **F-2 (P1)**：恢复前备份与副本应用不在同一 Store 串行边界。
- **F-3 (P1)**：恢复列表无账号/请求归属，迟到结果可暴露上一账号 Snapshot。
- **F-4 (P1)**：动态切换表单或账号分支后焦点回到 body，焦点陷阱失效。
- **F-5 (P1)**：UI 将 resolved false 或仍有 pending decision 的结果显示为成功。
- **F-6 (P1)**：Web 并发恢复时恢复副本数组读改写可相互覆盖。

### 2.3 工程规范类 (Standards)

- **F-7 (P2)**：OTP 限流 `retryAfter` 被丢弃，重发按钮可立即再点。
- **F-8 (P2)**：下载 URL 即时 revoke 且异常路径无清理。
- **F-10 (P2)**：Header 账号入口缺少 `aria-haspopup`/`aria-expanded`，导航缺少 `aria-current`。
- **F-11 (P2)**：监听完整 pending 对象可在 revision 刷新时抢夺用户焦点。

### 2.4 契约破坏类 (Contract)

无。

### 2.5 需求/设计符合度类 (Spec Compliance)

无。

---

## 3. Round 1–2 Fixes

| ID | 优先级 | 修复方式 | 犯错原因 |
|----|---------|----------|----------|
| F-1 | P0 | 补齐账号门面测试 fake 的恢复/诊断 Store 契约 | 执行遗漏 |
| F-2 | P1 | 新增 Store `restoreRecoveryCopy`，在单一 mutation 中校验空间、备份和应用 | 设计考虑不足 |
| F-3 | P1 | 恢复列表绑定 userId/requestId/visible，导出和恢复前二次校验 owner | 执行遗漏 |
| F-4 | P1 | 表单步骤、登录状态和 decision 存在性变化后 `nextTick` 重新聚焦 | 执行遗漏 |
| F-5 | P1 | `runAction` 增加结果判定，sync/resolve 同时校验最终状态/pending | 执行遗漏 |
| F-6 | P1 | Web recovery read-modify-write 统一进入 `recovery:${space}` 跨标签锁 | 设计考虑不足 |
| F-7 | P2 | OTP 限流使用 `retryAfter`，成功路径使用默认 60 秒 | 执行遗漏 |
| F-8 | P2 | 下载 anchor 显式挂载/移除，并在下一任务中 revoke URL | 执行遗漏 |
| F-10/F-11 | P2 | 补充弹层/导航 ARIA，焦点 watcher 只依赖分支布尔值 | 执行遗漏 |

---

## 4. Round 3: Re-review

- correctness-reviewer：PASS。
- quality-reviewer：PASS（仅保留不阻断的恢复列表大快照性能建议）。
- 无新增 P0/P1 finding。
- **结论: PASS**。

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|------------|----------|----------|
| F-1–F-8、F-10–F-11 | robustness/standards | P0/P1/P2 | keep/fixed | Round 3 双 reviewer PASS |
| F-9 | performance | P2 | follow-up | 当前上限五份；待 Task 9 真实 2 MiB 设备测试后决定是否拆 metadata/content 接口 |

---

## 6. 总体结论: PASS

所有 P0/P1 均已修复，剩余性能建议不影响当前最多五份恢复副本的正确性。

---

## 7. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无。

### P2（建议改进）

无。

---

## 8. Follow-up Items

| ID | 内容 | 优先级 | 建议处理时机 |
|----|------|--------|--------------|
| F-9 | 恢复列表加载完整 Snapshot 的内存和解析开销 | P2 | Task 9 性能验证后决定 |
| T-1 | Store 测试共享模块级 singleton 与 `globalThis.localStorage` | P2 | 后续引入可注入 Store 工厂时处理 |

---

## 9. Review Summary

- **Review 轮次**: 功能代码 3 轮，测试增量 3 轮。
- **P0 修复**: 1 项。
- **P1 修复**: 5 项。
- **P2 修复**: 4 项。
- **Follow-up**: 1 项。
- **最终结论**: PASS。

---

## 10. Test Generation Review

测试增量覆盖正常路径、边界和异常场景：

1. 当前账号恢复副本读取、恢复和 A→B 空间隔离。
2. 未登录恢复拒绝、失效副本和账号空间变化拒绝。
3. 恢复在同一 mutation 内先备份再应用，并与排队写入保持确定顺序。
4. 恢复提交将同步元数据置 dirty，且发出 `source = recovery` 的真实目标快照。
5. 恢复前备份失败时保留当前数据且不发送恢复提交。
6. 诊断导出只包含状态摘要，不包含邮箱、Session、token 或业务 Snapshot。

测试 review Round 1 发现 5 项 P1；Round 2 发现 1 项 P1；Round 3 双 reviewer PASS。保留 1 项不阻断 P2：模块级 Store singleton 的测试隔离后续可通过工厂化改善。

## 11. Verification

- `npm test`：98/98 PASS。
- `npm run build`：PASS。
- `cargo fmt --check`、`cargo check`：PASS。
- `cargo test`：9/9 PASS。
- `node --check`、`git diff --check`：PASS。
- 浏览器桌面端：账号入口、禁用态弹层、ARIA expanded、Escape 关闭及焦点恢复 PASS。
- 浏览器键盘：Shift+Tab/Tab 在弹层首尾循环 PASS。
- 浏览器 375×812：body 宽度 375、无横向溢出；弹层 351px、左右各 12px，视觉 PASS。
- 配置态 OTP、退出、同步与冲突动作由门面测试覆盖；真实 Supabase staging 全链路归入 Task 9。
