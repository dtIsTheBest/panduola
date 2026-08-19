# Task 2 Code Review Report: 账号本地数据空间与 Store 边界

> **Review Date**: 2026-07-31
> **Task**: Task 2 — 引入账号本地数据空间并扩展 Store 边界
> **Scope**: panduola，2 个产品文件，约 +1015/-106 行（含工作区既有 Store 改动）
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/data/dataSpaceRepository.js` — 新增 Web 本地数据空间、迁移、隔离、恢复副本和设备元数据仓储。
2. `src/data/store.js` — 迁移持久化边界并新增空间切换、快照应用和本地提交订阅。

### 关联文档

- Spec: `spec.md` §3.1、3.2、4.1、4.2.1、4.2.2、4.2.3、4.2.5、4.3、7.1、7.2
- Tasks: `tasks.md` Task 2（5 个子任务、7 个验收标准）

### 关键设计决策

1. Web 采用单 envelope 完整替换，游客和 UUID 用户使用独立存储键。
2. 旧 `panduola_data` 仅在新游客空间写入成功后完成迁移，并继续保留旧键。
3. 损坏数据必须先隔离，才能使用恢复副本、旧数据或默认快照。
4. Store 保持既有业务方法签名，并在持久化成功后才提交 reactive 状态和单次事件。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

**F-5** (P1) — 本地提交产生不必要的完整快照复制
- **位置**: `src/data/store.js:331`、`src/data/dataSpaceRepository.js:392`
- **问题**: 无订阅者时仍深拷贝快照，仓储还返回调用方未使用的 envelope 拷贝。
- **证据**: 接近 2 MiB 的每次 CRUD 会额外执行 JSON stringify/parse 并增加峰值内存。

**F-7** (P2) — 访问批处理采用 O(k×n) 查找
- **位置**: `src/data/store.js:360`
- **问题**: 每个待更新 ID 都对完整链接数组执行 `findIndex`。
- **证据**: 同一批次更新大量不同链接时重复扫描完整数组。

### 2.2 健壮性类 (Robustness)

**F-2** (P1) — 同毫秒 quarantine 键可能覆盖
- **位置**: `src/data/dataSpaceRepository.js:229`
- **问题**: 主空间与恢复列表连续隔离时使用相同空间和毫秒时间戳。
- **证据**: 固定时钟下第二次 `setItem` 会覆盖第一次隔离的原始数据。

**F-3** (P1) — 恢复后未修复主存储
- **位置**: `src/data/dataSpaceRepository.js:348`
- **问题**: 从恢复副本返回后仍保留损坏主键，后续启动重复隔离。
- **证据**: 每次加载都会再次复制最多 2 MiB 原始数据并持续消耗配额。

**F-4** (P1) — Storage 异常未统一包装
- **位置**: `src/data/dataSpaceRepository.js:163`
- **问题**: Storage getter 和部分读取可能直接抛出原始 `Error` 或 `DOMException`。
- **证据**: 该路径缺少统一 `AppError.code`，破坏异步错误契约。

**F-6** (P2) — 损坏旧数据未隔离回退
- **位置**: `src/data/dataSpaceRepository.js:332`
- **问题**: malformed `panduola_data` 直接导致初始化失败。
- **证据**: 未执行规范要求的隔离及默认数据回退。

### 2.3 工程规范类 (Standards)

**F-8** (P2) — 提交事件仅浅冻结
- **位置**: `src/data/store.js:332`
- **问题**: 多个监听器共享可变的嵌套 snapshot。
- **证据**: 前一个监听器可修改后续监听器读取的数据。

### 2.4 契约破坏类 (Contract)

无。

### 2.5 需求/设计符合度类 (Spec Compliance)

**F-1** (P1) — 损坏同步元数据被误判为 clean
- **位置**: `src/data/dataSpaceRepository.js:77`
- **问题**: 缺失或非法 `sync.dirty` 被宽松归一化为 `false`。
- **证据**: 未上传本地编辑可能因此被协调器当作已同步数据。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | sync 损坏误判 clean | envelope 读取改为严格校验 sync，revision 仅允许 null/正整数 | 设计考虑不足 |
| F-2 | P1 | 隔离键碰撞 | 键加入来源 kind 和递增序号 | 边界条件遗漏 |
| F-3 | P1 | 恢复后重复隔离 | 恢复副本成功后先修复主键，写失败立即中止 | 执行遗漏 |
| F-4 | P1 | Storage 原始异常 | getter 与全部 getItem 统一包装为 AppError | 规范未遵守 |
| F-5 | P1 | 大快照冗余复制 | 无订阅者快速返回，save 不再返回未使用拷贝 | 性能考虑不足 |
| F-6 | P2 | 损坏 legacy 不回退 | 先隔离 legacy，再持久化默认空间 | Spec 理解偏差 |
| F-7 | P2 | 访问批处理重复扫描 | 构建首项优先的 id→index Map | 性能考虑不足 |
| F-8 | P2 | 监听器共享可变快照 | 对事件 snapshot 执行深冻结 | 接口所有权不明确 |

---

## 4. Round 2/3: Re-review

- **F-1～F-8**：原始问题修复验证通过。
- **F-9 (P1)**：Round 2 发现 `activateDataSpace()` 的空空间默认快照未先持久化；已抽取并复用 `loadOrCreateDataSpace()`，写失败时保持原空间。
- **F-10 (P1)**：Round 2 发现 Map 优化会把重复 ID 从“首项”改为“末项”；已改为只记录首次出现的索引。
- Round 3 验证空间切换失败回滚与重复 ID 语义，未发现新增 P0/P1。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | spec-compl | P1 | keep/fixed | Spec §4.2.3 要求 dirty 元数据可靠，宽松 clean 会影响覆盖决策 |
| F-2 | robustness | P1 | keep/fixed | Spec §4.2.5 要求原始损坏数据先成功隔离 |
| F-3 | robustness | P1 | keep/fixed | 重复隔离会持续消耗 localStorage 并最终阻断恢复 |
| F-4 | standards | P1 | keep/fixed | Spec §4.2.2 要求异步模块统一 AppError |
| F-5 | performance | P1 | keep/fixed | 2 MiB 上限下每次 CRUD 存在可避免的多份完整复制 |
| F-6 | robustness | P2 | keep/fixed | Spec §4.2.5 明确损坏 legacy 的隔离与回退顺序 |
| F-7 | performance | P2 | keep/fixed | Map 可将访问批处理从 O(k×n) 降为 O(n+k) |
| F-8 | standards | P2 | keep/fixed | 订阅边界需要防止监听器间相互篡改 |
| F-9 | contract | P1 | keep/fixed | 空空间写失败时不得提交 active/reactive 状态 |
| F-10 | contract | P1 | keep/fixed | 既有 `findIndex` 对重复 ID 更新首项，优化不得改变语义 |

---

## 6. 总体结论: PASS

全部 P0/P1 已修复并通过双 reviewer 定向复审，未保留阻塞问题。

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

- **Review 轮次**: 3 轮（Round 1 8 项 candidate finding → Round 2 新增 2 项 → Round 3 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 7 项
- **P2 keep**: 0 项
- **Follow-up**: 0 项
- **最终结论**: PASS
