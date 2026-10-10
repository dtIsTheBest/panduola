# Task 2 Code Review Report: 评论建议墙与私有亲子照片墙

> **Review Date**: 2026-10-10
> **Task**: Task 2 — 实现 Community Repository 与安全图片处理
> **Scope**: panduola，5 个文件，约 +1682/-0 行
> **Reviewers**: 2 并行 reviewer（correctness-reviewer + quality-reviewer）

---

## 1. Review Scope

### 改动文件清单

1. `src/community/communityRepository.js` — 封装评论 RPC、私有照片 Storage、签名 URL 与状态机。
2. `src/community/photoProcessor.js` — 图片文件头预读、解码期缩放、WebP 重编码和元数据移除。
3. `src/main.js` — 复用共享 Supabase Provider 注入 Community Repository。
4. `tests/community-repository.test.js` — Repository 契约、错误、权限和补偿测试。
5. `tests/photo-processor.test.js` — MIME、尺寸、EXIF、Canvas、编码和资源释放测试。

### 关联文档

- Spec: `spec.md` §3.1、3.2、4.1、4.2、4.3、7.1
- Tasks: `tasks.md` Task 2（4 个子任务、7 个验收标准）

### 关键设计决策

1. 私有照片 DTO 不暴露对象路径，只返回一小时签名 URL。
2. 上传采用 reserve → Storage → finalize；明确失败取消预留，不确定结果由服务端列表恢复。
3. 所有图片在像素解码前读取 JPEG/PNG/WebP 文件头，并在解码阶段缩至最长边 1920。

---

## 2. Round 1: Findings

### 2.1 性能类 (Performance)

**F-5** (P1) — 小体积超高像素图片可能在缩放前耗尽内存
- **位置**: `src/community/photoProcessor.js`
- **问题**: 原实现先完整解码再检查宽高，低端移动设备存在峰值内存风险。
- **证据**: 压缩文件不超过 10 MiB 仍可能包含 48MP 以上像素数据。

### 2.2 健壮性类 (Robustness)

**F-1** (P1) — Canvas 创建和绘制异常未映射稳定错误
- **位置**: `src/community/photoProcessor.js`
- **问题**: `canvasFactory`、`getContext`、`drawImage` 抛错会泄漏原始 DOMException。
- **证据**: 原 try/catch 只覆盖编码调用。

**F-2** (P1) — 透明图片被渲染为黑色背景
- **位置**: `src/community/photoProcessor.js`
- **问题**: `alpha:false` 破坏 PNG/WebP 透明像素。
- **证据**: 透明图片在不透明 Canvas 中会合成到黑色 backing store。

**F-4** (P1) — 取消预留忽略 Supabase `{ error }`
- **位置**: `src/community/communityRepository.js`
- **问题**: cancel 返回普通错误对象时仍被当作清理成功，暂时占用照片额度。
- **证据**: 原实现只捕获 Promise rejection，没有检查返回值。

### 2.3 工程规范类 (Standards)

无。

### 2.4 契约破坏类 (Contract)

**F-3** (P2) — 异常服务端 DTO 被误报为用户输入错误
- **位置**: `src/community/communityRepository.js`
- **问题**: 响应映射复用输入校验器，错误码语义不正确。
- **证据**: 非法远端 UUID/文本触发 `COMMUNITY_INVALID_INPUT`。

### 2.5 需求/设计符合度类 (Spec Compliance)

无。

---

## 3. Round 1 Fixes

| ID | 优先级 | 问题 | 修复方式 | 犯错原因 |
|----|--------|------|----------|----------|
| F-1 | P1 | Canvas 异常不稳定 | 包裹创建、绘制、编码全流程并保持 bitmap finally 关闭 | 执行遗漏 |
| F-2 | P1 | 透明像素变黑 | 使用 alpha Canvas 保留透明通道 | 设计考虑不足 |
| F-3 | P2 | 远端 DTO 错误语义不当 | 统一映射为可重试 NETWORK_ERROR | 执行遗漏 |
| F-4 | P1 | cancel 返回错误被忽略 | 检查 `{ error }`，执行一次幂等重试并聚合失败原因 | 设计考虑不足 |
| F-5 | P1 | 解码峰值内存过高 | 增加解码前尺寸读取和 resize decode | 设计考虑不足 |

---

## 4. Round 2～4: Re-review

- **F-1～F-4**：Round 2 验证通过。
- **F-5**：Round 2 发现无 `ImageDecoder` 环境仍有无界 fallback，改为 JPEG/PNG/WebP 文件头解析。
- **F-6** (P1)：Round 3 发现 EXIF Orientation 未参与缩放尺寸，补充 JPEG APP1、PNG eXIf、WebP EXIF/TIFF 解析；Orientation 5～8 交换视觉宽高。
- Round 4 两位 reviewer 均无新增 finding。
- **结论: PASS**

---

## 5. 裁决明细

| ID | 维度 | 原始优先级 | 最终处置 | 裁决依据 |
|----|------|-----------|---------|---------|
| F-1 | robustness | P1 | keep/fixed | Canvas 分配与绘制确实可能抛 DOMException，现统一映射。 |
| F-2 | robustness | P1 | keep/fixed | PNG/WebP 是明确支持格式，透明内容不能被黑底破坏。 |
| F-3 | contract | P2 | keep/fixed | Spec 要求稳定错误，远端数据异常不属于用户输入。 |
| F-4 | robustness | P1 | keep/fixed | Supabase 正常以 `{ error }` 返回失败，必须显式检查。 |
| F-5 | performance | P1 | keep/fixed | 10 MiB 压缩大小不能限制解码像素内存，现已在解码前预读。 |
| F-6 | spec-compliance | P1 | keep/fixed | `from-image` 与固定 resize 尺寸必须使用 orientation-correct 视觉宽高。 |

---

## 6. 总体结论: PASS

所有 P1/P2 finding 已修复并经两位 reviewer 定向复审通过。

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

- **Review 轮次**: 4 轮（Round 1 5 项 → Round 2/3 定向补充 1 项 → Round 4 PASS）
- **P0 修复**: 0 项
- **P1 修复**: 5 项
- **P2 keep**: 0 项（1 项已修复）
- **Follow-up**: 0 项
- **最终结论**: PASS

## 10. Test Results

- 定向 Node 测试：18/18 PASS
- 全量 Node 测试：189/189 PASS
- 生产构建：PASS
- `git diff --check`：PASS
