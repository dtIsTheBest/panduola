# Task 7 Code Review Report: 本地优先账号与云端同步

> **Review Date**: 2026-08-18
> **Task**: Task 7 — 接入应用账号门面与启动/切换生命周期
> **Scope**: panduola，7 个代码文件，约 +1342/-51 行
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/account/accountSyncFacade.js` — 账号、Session、登录、退出和同步编排门面。
2. `src/data/store.js` — 游客 seed、用户空间原子初始化和激活边界。
3. `src/data/dataSpaceRepository.js` — Web/Tauri `createIfAbsent` 持久化边界。
4. `src-tauri/src/lib.rs` — 桌面端原子 no-clobber 空间创建 command。
5. `src/main.js` — 延迟装配认证、云仓库和同步协调器。
6. `src/App.vue` — 根组件初始化与销毁账号门面。
7. `docs/design-docs/platform/account-sync/tasks.md` — Task 7 文件偏差和进度。

### 关联文档

- Spec: `spec.md` §3.1、§3.2、§4.1、§4.2.1–§4.2.4、§4.3。
- Tasks: `tasks.md` Task 7（5 个子任务、8 个验收标准）。

### 关键设计决策

1. 应用先完成游客本地初始化，Session 恢复和 Supabase 服务创建放到后台。
2. 所有凭据变更进入统一 auth queue，数据空间变更进入 transition queue。
3. generation 过期时不仅阻止状态回写，还必须补偿已发生的空间与同步副作用。
4. 首次用户空间通过原子 create-if-absent 创建，不覆盖其他标签/实例的先行数据。
5. Session 清理补偿同时校验 SDK 当前用户、facade generation 和新登录状态。

---

## 2. Round 1–6: Findings

### 2.1 性能类 (Performance)

- **F-11 (P2)**：已存用户空间在门面和协调器间存在重复读取。核心 check-then-act 已合并，保留协调器 authoritative reload 作为账号切换安全边界，不阻断本任务。

### 2.2 健壮性类 (Robustness)

- **F-1 (P0)**：generation 过期只阻止状态回写，不补偿已切换的数据空间/同步器。
- **F-2 (P0)**：登录失败回滚时用新账号凭据启动旧账号同步，存在跨账号云读写风险。
- **F-3 (P1)**：启动时缓存的 guest seed 遗漏登录前新编辑。
- **F-4 (P1)**：并发 verify 产生 facade 不知情的有效 Session。
- **F-5 (P1)**：logout/signOut 成功后游客切换失败，认证、状态与 Store 分裂。
- **F-6 (P1)**：登录回滚和后台 Session 失效切换失败被吞掉。
- **F-7 (P1)**：首次用户空间初始化存在 Web/Tauri check-then-save 竞态。
- **F-8 (P1)**：`destroy()` 未停止协调器，延迟服务绑定可在销毁后注册监听。
- **F-9 (P1)**：stale restore/verify 的 signOut 补偿可迟到删除新账号 Session。
- **F-10 (P1)**：auth-event activation 以 false 返回时未清理残留 Session，或仅按 userId 误删同账号新 Session。

### 2.3 工程规范类 (Standards)

- **F-12 (P2)**：OTP 请求的旧响应可覆盖新错误。

### 2.4 契约破坏类 (Contract)

- **F-13 (P1)**：目标账号空间已存在时仍强依赖 guest，guest 缺失阻断正常切换。

### 2.5 需求/设计符合度类 (Spec Compliance)

无。

---

## 3. Round 1–6 Fixes

| ID | 优先级 | 修复方式 | 犯错原因 |
|----|---------|----------|----------|
| F-1 | P0 | stale transition 统一抛入补偿回滚，失败进入明确 error | 设计考虑不足 |
| F-2 | P0 | 回滚只恢复本地空间，切换凭据后禁止重启 previousSession 同步 | Spec 理解偏差 |
| F-3/F-7 | P1 | Store 单串行边界内读最新 guest、Web Locks/no-clobber 创建并激活；Tauri 使用 `persist_noclobber` | 设计考虑不足 |
| F-4/F-9/F-10 | P1 | restore/request/verify/logout/cleanup 统一 auth queue；清理前校验 generation、SDK userId 与 facade signed-in Session | 执行遗漏 |
| F-5/F-6 | P1 | 认证已清除后将 facade 收敛为 session=null/error；回滚与后台切换失败不再吞掉 | 执行遗漏 |
| F-8 | P1 | terminal destroyed 标记、延迟 bind 阻断、订阅注销、队列收敛与 coordinator stop | 执行遗漏 |
| F-12 | P2 | OTP 请求进入 auth queue，状态回写校验 generation | 执行遗漏 |
| F-13 | P1 | 先读取目标空间，仅目标不存在时才依赖 guest seed | 执行遗漏 |

---

## 4. Round 7: Re-review

- correctness-reviewer：PASS。
- quality-reviewer：PASS。
- auth-event 补偿能清理旧 Session，且不会删除不同账号或同账号新 generation Session。
- 无新增 P0/P1 finding。
- **结论: PASS**。

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|------------|----------|----------|
| F-1–F-10、F-12–F-13 | robustness/contract/standards | P0/P1/P2 | keep/fixed | Round 7 两位 reviewer 均 PASS |
| F-11 | performance | P2 | follow-up | 保留 coordinator authoritative reload 作为账号切换的正确性复查，后续以 profile 决定是否优化 |

---

## 6. 总体结论: PASS

所有成立的 P0/P1 已修复；剩余仅为不阻断的性能 follow-up。

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
| F-11 | 大快照账号切换仍有重复读取/校验 | P2 | Task 9 性能门禁有实测数据后决定 |

---

## 9. Review Summary

- **Review 轮次**: 11 轮（Round 8–11 为测试增量评审）。
- **P0 修复**: 2 项。
- **P1 修复**: 10 项。
- **P2 修复**: 1 项。
- **Follow-up**: 1 项。
- **最终结论**: PASS。

## 10. Round 8–11: 测试增量评审

- **Round 8**：发现 logout 测试未验证跨组件顺序、auth-event cleanup 分支未真正进入、
  Supabase “返回错误但本地 Session 已清”语义未覆盖，以及 A→B 回滚与真实 Store 边界缺口。
- **Round 9**：增加共享 timeline、真实 SDK Session fake、慢 restore/verify barrier、后台 SIGNED_OUT、
  A→B 回滚、真实 Store guest seed 与 repository create-if-absent 测试；发现 create-if-absent 竞争仍未可观测。
- **Round 10**：两个 repository 注入共享可观测锁，断言两次创建均经过锁、临界区最大并发为 1，
  且仅一方胜出。
- **Round 11**：补充登录空间导入 dirty/纯业务导出与 Tauri `persist_noclobber` 单测后完成最终门禁。
- correctness-reviewer：PASS。
- quality-reviewer：PASS。

## 11. Phase 3 测试结果

- `node --test tests/account-facade.test.js`：16/16 PASS。
- Task 7 相关定向测试：30/30 PASS。
- `npm test`：93/93 PASS。
- `npm run build`：PASS。
- `cargo fmt --check`、`cargo check`、`cargo test`：PASS（9/9 Rust 测试）。
- JavaScript 语法与 `git diff --check`：PASS。
- 格式检查：PASS（本次无 Java/XML 变更）。
