# 排查记录: 生产 AI 问答超时

> 创建时间: 2026-08-20 09:19 CST
> 状态: 🟢 已定位

---

## 版本信息

| 字段 | 值 |
|------|-----|
| **迭代** | 站内 AI 成长助手生产发布 |
| **Commit ID** | `7c691e4` |
| **分支** | `main` |

---

## 环境信息

| 字段 | 值 |
|------|-----|
| **环境** | 生产 |
| **前端** | 腾讯云 EdgeOne Pages |
| **服务端** | Supabase Edge Function `ai-growth-assistant` |
| **模型** | 火山方舟 `doubao-seed-2-0-lite-260215` |
| **相关配置** | 前端 25 秒总 deadline；方舟 18 秒 deadline |

---

## 问题现象

**触发条件**：在正式域名的站内 AI 区域提交“怎样培养孩子每天阅读的习惯？”。

**报错信息**：

```text
AI 回答超时，请稍后重试。
```

同一版本发布前的生产 curl 冒烟曾在约 18.3 秒内返回 HTTP 200 和正常回答。

---

## 根因定位（定位后填写）

### 根因

`doubao-seed-2-0-lite-260215` 默认开启深度思考，加上 800 tokens 输出上限，使部分普通问题超过 18 秒 Provider deadline；相同问题由 `arkClient` 主动中止并返回 HTTP 504 / `AI_TIMEOUT`。关闭深度思考后主体延迟明显下降，但 18 秒阈值仍有尾延迟超时；最终使用 20 秒 Provider deadline 与 300 tokens 输出上限稳定通过生产验收。此外，前端 25 秒总 deadline 小于登录路径各阶段预算之和，仍存在需要后续治理的时序风险。

### 证据链

1. 完全相同的问题通过生产 Edge Function 直接请求，在 19.239 秒返回 HTTP 504，响应 code 为 `AI_TIMEOUT`。
2. 浏览器端同一问题连续三次复现，最近一次约 23.37 秒出现同一超时文案；额度表记录证明请求已到达服务端。
3. 三个更短问题通过相同生产函数、相同模型和相同 Origin 调用，分别在 7.997、7.772、7.472 秒返回 HTTP 200。
4. `arkClient.js` 在 18 秒 Provider deadline 后中止 fetch，并把该路径映射为 `AI_TIMEOUT`；当前没有自动重试。
5. 前端 deadline 为 25 秒，而当前游客服务端路径可顺序消耗配额 RPC 10 秒 + 方舟 20 秒，预算未分层对齐。
6. 显式关闭深度思考后，同问题首次 A/B 在 15.901 秒返回 HTTP 200；最终 20 秒/300 tokens 配置下 3/3 直调成功，正式页面在 16.319 秒显示回答。

### 修复建议

- **临时方案**：已启用 `ARK_THINKING_MODE=disabled`、`AI_PROVIDER_TIMEOUT_MS=20000`、`AI_MAX_OUTPUT_TOKENS=300`，生产 A/B 通过。
- **根本方案**：保持思考模式为当前模型的显式能力配置；另行增加 Edge handler 统一总 deadline 和分阶段剩余预算，使 Provider deadline 小于服务端总预算、服务端总预算小于前端预算，并补充 `phase`、`timeoutSource`、Auth/RPC/Provider 分阶段耗时日志。

---

## 排查进度

### 当前结论

- [x] 根因已定位
- 当前判断：方舟 Provider deadline 过紧，且跨层预算未对齐。
- 置信度：高
- 依据：同问题生产直调稳定返回 HTTP 504 / `AI_TIMEOUT`，耗时贴近 18 秒 Provider deadline；短问题使用同链路均在 8 秒内成功。

### 待验证

| # | 假设 | 验证方法 | 状态 |
|---|------|----------|------|
| 1 | Edge Function 在 18 秒主动中止方舟请求 | 同问题直接调用生产函数，检查 HTTP 状态、业务 code 与耗时 | ✅ |
| 2 | 前端 25 秒预算与服务端分阶段预算不匹配 | 对比代码中前端、RPC、Provider deadline | ✅ |
| 3 | 故障由 CORS、密钥或模型整体不可用导致 | 同链路执行 3 次短问题调用 | ❌ |
| 4 | 默认深度思考导致耗时增加 | 显式配置关闭后执行同问题直调与浏览器 A/B | ✅ |

---

## 关键发现

### 关键日志

```text
生产 curl：HTTP 200，返回正常 answer，端到端命令耗时约 18.3 秒。
生产浏览器：同版本请求显示“AI 回答超时，请稍后重试”。
受控短问题探测：3/3 HTTP 200，总耗时分别为 7.997、7.772、7.472 秒。
相同浏览器问题直调：HTTP 504，code=AI_TIMEOUT，总耗时 19.239 秒。
浏览器精确复现：约 23.37 秒出现 AI_TIMEOUT 文案。
Provider deadline 提高到 30 秒后，同问题仍在 32.943 秒返回 HTTP 504 / AI_TIMEOUT。
关闭深度思考、30 秒/800 tokens：同问题 15.901 秒返回 HTTP 200。
关闭深度思考、18 秒/500 tokens：1/2 超时；18 秒/300 tokens：1/3 超时。
最终 20 秒/300 tokens：同问题 3/3 HTTP 200（9.527～12.581 秒）；正式页面 16.319 秒显示回答。
```

**分析**：功能、鉴权、配额与模型配置均可用；相同问题在服务端直接返回明确的 Provider 超时，根因已锁定在 18 秒模型 deadline。短问题成功说明不是全局服务故障。

### 代码分析

**相关代码位置**：

- `src/ai/config.js:3` — 前端默认 25 秒总 deadline。
- `src/ai/aiAssistantClient.js:200` — 前端总计时器覆盖 Provider、Session、fetch 与响应体。
- `supabase/functions/ai-growth-assistant/index.ts:42` — Supabase 单阶段默认 10 秒 deadline。
- `supabase/functions/ai-growth-assistant/index.ts:47` — 方舟默认 18 秒 deadline。
- `supabase/functions/_shared/aiAssistantHandler.js:233` — 身份、配额、模型按顺序执行，没有统一服务端总预算。
- `supabase/functions/_shared/arkClient.js:52` — Provider 计时器。
- `supabase/functions/_shared/arkClient.js:93` — Provider deadline 覆盖响应体读取并映射为 `AI_TIMEOUT`。

**代码逻辑**：

```text
浏览器 25s 总预算
  -> 获取 Provider/Session
  -> Edge Function
       -> Auth（登录时最多 10s）
       -> 配额 RPC（最多 10s）
       -> 方舟请求（最多 18s）
```

**问题点**：服务端多个独立 deadline 串行相加，Provider 18 秒不足以覆盖部分正常回答；同时服务端理论总耗时可能超过前端 25 秒。

---

## 备注

- 未记录用户问题之外的任何敏感信息；测试问题为通用育儿问题。
- 已完成定位、配置 A/B、函数部署和正式页面验收；游客额度已恢复为每天 3 次。
