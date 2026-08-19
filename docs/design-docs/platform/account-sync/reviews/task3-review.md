# Task 3 Code Review Report: Tauri 原子存储与安全 Session

> **Review Date**: 2026-07-31
> **Task**: Task 3 — 实现 Tauri 原子数据空间与安全 Session 存储
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

1. `src-tauri/src/lib.rs` — 受限路径、原子读写、损坏隔离、恢复副本、设备标识、Stronghold 引导和系统凭据。
2. `src/account/tauriSessionStorage.js` — 可注入的 Supabase Session Stronghold 适配器。
3. `src/data/dataSpaceRepository.js`、`src/account/errors.js` — Tauri 桥接、恢复顺序和原生错误映射。
4. `src-tauri/capabilities/default.json`、Rust/JavaScript 依赖清单 — 最小权限和依赖锁定。

## 2. 主要发现与修复

| 类别 | 优先级 | 问题 | 修复 |
|------|--------|------|------|
| correctness | P1 | 恢复副本写回失败后仍可能继续尝试 legacy | 将解析异常捕获与主空间写回分离，写回失败立即终止 |
| dependency | P1 | Stronghold JavaScript 包未实际安装 | 安装并锁定 `@tauri-apps/plugin-stronghold` |
| security | P1 | Stronghold salt 可能在首次加载时因缺失或长度非法失败 | 插件注册前生成或严格校验 32-byte 随机 salt，失败仅禁用安全 Session |
| security | P1 | 损坏原文通过 JSON/IPC 隔离可能扩容并携带敏感内容 | Rust 根据受校验 owner/kind 直接移动已知源文件，原文不经过 IPC |
| performance | P1 | 原生命令中的大文件 I/O 可能阻塞主线程 | 文件命令改为 async，并通过 `spawn_blocking` 执行 |
| robustness | P1 | 文件大小校验与读取存在 TOCTOU 窗口 | 从已打开句柄最多读取 `max + 1` 字节后判定 |
| contract | P1 | 原生错误码在 JavaScript 层被降级 | 映射为稳定 `AppError` code |
| durability | P1 | salt 无覆盖落盘后未同步父目录 | `persist_noclobber` 成功后同步父目录；失败安全降级 |
| permissions | P1 | Stronghold capability 范围过宽 | 仅保留初始化、client 和 store record 必需权限 |
| concurrency | P1 | 系统 keyring 初始化存在进程内竞态 | 使用进程级互斥锁保护读取与首次写入 |

## 3. Re-review

- 数据空间路径只接受 `guest` 或 `user:<uuid>`，无法构造任意路径。
- 所有业务 JSON 写入都会递归拒绝 access token、refresh token 和 provider token。
- 同目录临时文件在写入、flush、文件同步后原子替换；替换成功后的目录同步失败只记录告警，避免把已提交写入报告为失败。
- Stronghold salt 使用系统随机数、同目录临时文件、无覆盖持久化和父目录同步；任何准备失败都只跳过 Stronghold 注册，应用继续启动。
- Stronghold 解锁材料仅保存在系统凭据存储，普通业务文件和诊断路径不接收 Session。
- 损坏、超限或非 UTF-8 文件在原生层直接移动至隔离目录，恢复写回失败不会继续降级并覆盖状态。
- capability 与 Session adapter 的实际调用相匹配。
- 两位 reviewer 最终均未发现残余或新增 P0/P1。

## 4. 总体结论: PASS

全部成立问题已修复，correctness 与 quality reviewer 最终均返回 PASS。

## 5. 正式问题

### P0（必须修复）

无。

### P1（应该修复）

无。

### P2（建议改进）

无。

## 6. Follow-up Items

无。

## 7. Review Summary

- **Review 轮次**: 3 轮
- **P0 修复**: 0 项
- **P1 修复**: 10 项
- **最终结论**: PASS

## 8. Phase 3 测试结果

- 新增 `tests/tauri-storage.test.js`，包含 7 项 Stronghold Session 与 Tauri 数据桥接测试。
- Rust 单测由 4 项扩展至 8 项，新增 salt、损坏文件隔离和安全降级边界。
- `cargo fmt --check`：PASS。
- `cargo check`：PASS。
- `cargo test`：8/8 PASS。
- `npm test`：45/45 PASS。
- `npm run build`：PASS，Vite 生产构建无新 warning。
- `git diff --check`：PASS。
