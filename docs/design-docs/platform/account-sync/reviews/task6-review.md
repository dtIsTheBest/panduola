# Task 6 Code Review Report: 本地优先账号与云端同步

> **Review Date**: 2026-08-18
> **Task**: Task 6 — 实现同步状态机、冲突处理与跨标签互斥
> **Scope**: panduola，7 个文件，约 +1642/-24 行
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/sync/crossTabLock.js` — Web Locks 与 localStorage lease 回退。
2. `src/sync/syncCoordinator.js` — 同步状态机、单飞、重试、CAS、迁移和冲突处理。
3. `src/data/dataSpaceRepository.js` — 同步元数据 sidecar、localRevision 和跨标签保护。
4. `src/data/store.js` — 原子快照/元数据边界、外部变化恢复和游客空间保护。
5. `src/account/errors.js` — 增加本地 revision 冲突错误码。
6. `docs/design-docs/platform/account-sync/spec.md` — 明确成长记录属于用户快照同步范围。
7. `docs/design-docs/platform/account-sync/tasks.md` — 记录 Task 6 计划偏差与实施进度。

### 关联文档

- Spec: `spec.md` §3.1、§4.2.2–§4.2.5、§4.3、§7.1–§7.3。
- Tasks: `tasks.md` Task 6（5 个子任务、8 个验收标准）。

### 关键设计决策

1. 业务修改先持久化到本地，云端只做异步最终一致同步。
2. 云端 revision CAS 是跨设备正确性边界；Web Locks/lease 只减少重复请求。
3. Web 业务 envelope 与 metadata-only sidecar 分离，sidecar 使用 localRevision 绑定快照。
4. 跨标签写入通过 localRevision 乐观保护；发现变化后先备份当前快照再重载。
5. 按用户最新要求，Schema v2 已有的 `growthRecords` 与分类、链接一并持久化。

---

## 2. Round 1–7: Findings

### 2.1 性能类 (Performance)

- **F-8 (P2)**：协调器与云仓库重复哈希快照。裁决为 drop：云仓库保留独立输入校验是基础设施边界的防御性约束。
- **F-9 (P2)**：本地提交事件每次克隆与冻结完整快照。裁决为 drop：属于既有 Store 不可变订阅契约，不在 Task 6 中削弱。

### 2.2 健壮性类 (Robustness)

- **F-1 (P0)**：metadata-only 写入使用旧内存快照覆盖其他标签数据。
- **F-2 (P1)**：冲突/迁移解决绕过账号级单飞锁。
- **F-3 (P1)**：解决期间的新本地提交不会追加同步。
- **F-4 (P1)**：`use-cloud` 在备份耗时期间可应用过期远端快照。
- **F-5 (P1)**：云端快照与 revision 分两次落盘，失败形成部分提交。
- **F-6 (P1)**：`stop()` 未等待任务收敛，重试档位污染下一账号。
- **F-7 (P1)**：lease 清理失败覆盖业务结果，心跳配置可大于租期。
- **F-10 (P1)**：sidecar 读取错误误隔离有效主空间。
- **F-11 (P1)**：sidecar 与主 envelope 写序不具备崩溃一致性。
- **F-12 (P1)**：并发 start/stop 可使较早账号覆盖后调用账号。
- **F-13 (P1)**：本地 revision 冲突后缺少恢复/重载路径。
- **F-14 (P1)**：外部重载隐藏远端 conflict 但内部门闩仍阻止同步。
- **F-15 (P1)**：处理期间的 storage event 被丢弃。
- **F-16 (P1)**：已排队游客恢复任务可在账号切换后污染用户空间。
- **F-17 (P1)**：missed storage event 导致旧快照 dirty 自旋。
- **F-18 (P1)**：外部重载取消尚未落盘的访问计数批次。
- **F-19 (P1)**：启动期强制重载取消尚未落盘的访问计数批次。

### 2.3 工程规范类 (Standards)

- **F-20 (P2)**：订阅初始回调抛错后监听器无法注销。

### 2.4 契约破坏类 (Contract)

- **F-21 (P0)**：代码同步 `growthRecords` 与旧 spec 快照文字范围不一致。

### 2.5 需求/设计符合度类 (Spec Compliance)

- **F-22 (P1)**：fallback lease 不是原子 CAS。裁决为 drop：spec 明确 lease 是 Web Locks 缺失时的协调优化，云端 revision CAS 才是最终正确性边界。

---

## 3. Round 1–7 Fixes

| ID | 优先级 | 修复方式 | 犯错原因 |
|----|---------|----------|----------|
| F-1/F-5/F-10/F-11 | P0/P1 | 分离 Web metadata sidecar，使用 localRevision 绑定；cloud apply 一次写入 authoritative envelope | 设计考虑不足 |
| F-2/F-3 | P1 | resolutionPromise 与 crossTabLock 共享单飞边界，解决后追加同步 | 执行遗漏 |
| F-4 | P1 | 备份后重新拉取 revision/hash，应用后立即复查 | 设计考虑不足 |
| F-6/F-12 | P1 | 生命周期 request generation 抢占，立即失效旧会话并等待任务收敛 | 执行遗漏 |
| F-7 | P1 | lease 稳定确认、立即续租、心跳约束和 best-effort 清理 | 设计考虑不足 |
| F-13–F-17 | P1 | localRevision 乐观保护、storage event 追加循环、恢复副本、重载与本地 conflict 门闩 | 设计考虑不足 |
| F-18/F-19 | P1 | 外部重载和 start reload 前强制等待 pending writes/访问批次 | 执行遗漏 |
| F-20 | P2 | 初始回调失败时回滚 listener 注册 | 执行遗漏 |
| F-21 | P0 | 根据用户最新持久化目标更新 spec，明确成长记录属于快照 | Spec 演进未同步 |

---

## 4. Round 8: Re-review

- correctness-reviewer：PASS。
- quality-reviewer：PASS。
- start reload 前已等待 pending writes，并在等待后重新校验 lifecycle request。
- 无新增 P0/P1 finding。
- **结论: PASS**。

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|------------|----------|----------|
| F-1–F-7、F-10–F-21 | robustness/contract/standards | P0/P1/P2 | keep/fixed | 对应代码路径已修复，Round 8 双 reviewer PASS |
| F-8 | performance | P2 | drop | 云仓库需独立校验输入，不共享可伪造的 prepared 结果 |
| F-9 | performance | P2 | drop | 既有 Store 的不可变提交契约，本任务不改变订阅语义 |
| F-22 | spec-compliance | P1 | drop | spec 明确 lease 不是最终正确性边界，最终依赖云端 CAS |

---

## 6. 总体结论: PASS

全部成立的 P0/P1/P2 均已修复，Round 8 两位 reviewer 均未发现新增 P0/P1。

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

无。

---

## 9. Review Summary

- **Review 轮次**: 11 轮（Round 9–11 为测试增量评审）。
- **P0 修复**: 3 项。
- **P1 修复**: 21 项。
- **P2 修复**: 2 项。
- **P2 drop**: 2 项。
- **Follow-up**: 0 项。
- **最终结论**: PASS。

## 10. Round 9–11: 测试增量评审

- **Round 9**：发现 CAS fake 未校验 expected revision、跨协调器锁未覆盖、storage/localRevision
  和 lifecycle 高风险路径未进入测试，以及迟到响应未确认请求已启动。
- **Round 10**：补充 authoritative Fake Store、真实 CAS revision 校验、双 coordinator Web Locks、双 owner lease、
  missed/repeated storage event、local conflict 重试、start reload 失败和迟到响应测试；发现 lifecycle
  pending-write barrier 仍未覆盖。
- **Round 11**：增加同一 coordinator 的 `start(A) → start(B)` barrier 测试，验证 pending writes、
  lifecycle request 淘汰、最终账号和订阅清理。
- correctness-reviewer：PASS。
- quality-reviewer：PASS。

## 11. Phase 3 测试结果

- `node --test tests/sync-coordinator.test.js`：16/16 PASS。
- `npm test`：74/74 PASS。
- `npm run build`：PASS。
- JavaScript 语法检查：PASS。
- 格式检查：PASS（本次无 Java/XML 变更）。
