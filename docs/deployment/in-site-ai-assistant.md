# 站内 AI 成长助手部署

站内 AI 使用以下链路：

```text
Vue → Supabase Edge Function → PostgreSQL 配额 → 火山方舟豆包 API
```

前端不保存火山方舟密钥，也不会自动上传收藏、生长记录或其他个人数据。

## 1. 准备火山方舟

在火山方舟控制台完成：

1. 开通需要使用的豆包文本模型。
2. 创建 API Key。
3. 记录模型 ID 或推理接入点 ID。

API Key 只用于 Supabase Secret，不要写入 `.env`、EdgeOne 前端变量、Git 或聊天记录。

## 2. 部署数据库 migration

推荐使用已经关联项目的 Supabase CLI，让 migration history 与仓库保持一致：

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

如果必须使用 SQL Editor：

1. 打开 `supabase/migrations/202608190002_ai_usage_quota.sql`。
2. 复制文件全部 SQL 到 SQL Editor 并执行。
3. 项目后续改用 CLI 前，先关联项目并登记该版本已应用：

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase migration repair --status applied 202608190002
   ```

CLI 与 SQL Editor 两种方式选择一种，不要在未登记 migration history 时混用。

迁移只保存请求 UUID、不可逆主体哈希、额度类型和 UTC 日期，不保存问题或回答。

## 3. 配置 Edge Function Secrets

先生成独立的配额 HMAC 盐：

```bash
openssl rand -hex 32
```

在 Supabase Dashboard 的 Edge Function Secrets 中添加：

```text
ARK_API_KEY=<火山方舟 API Key>
ARK_MODEL_ID=<模型或接入点 ID>
ARK_THINKING_MODE=disabled
AI_ALLOWED_ORIGINS=https://www.nurtureprimer.com
AI_QUOTA_SALT=<上一步生成的随机值>
AI_GUEST_DAILY_LIMIT=3
AI_USER_DAILY_LIMIT=20
AI_PROVIDER_TIMEOUT_MS=20000
AI_SUPABASE_TIMEOUT_MS=10000
AI_MAX_OUTPUT_TOKENS=300
```

`ARK_THINKING_MODE` 默认不设置；仅当当前模型已通过生产 A/B 验证时设置为 `disabled`。其他值会使 AI 网关降级为 `AI_NOT_CONFIGURED`。切换模型或需要回滚时执行：

```bash
supabase secrets unset ARK_THINKING_MODE
```

也可以使用 CLI；命令中的值仅为占位符：

```bash
supabase secrets set \
  ARK_API_KEY='replace-with-ark-key' \
  ARK_MODEL_ID='replace-with-model-id' \
  ARK_THINKING_MODE=disabled \
  AI_ALLOWED_ORIGINS=https://www.nurtureprimer.com \
  AI_QUOTA_SALT='replace-with-random-hex' \
  AI_GUEST_DAILY_LIMIT=3 \
  AI_USER_DAILY_LIMIT=20 \
  AI_PROVIDER_TIMEOUT_MS=20000 \
  AI_SUPABASE_TIMEOUT_MS=10000 \
  AI_MAX_OUTPUT_TOKENS=300
```

## 4. 部署 Edge Function

游客需要访问函数，因此平台 JWT 强制检查关闭；函数内部仍会验证 apikey 和可选用户 JWT。

```bash
supabase functions deploy ai-growth-assistant --no-verify-jwt
```

部署后先发起一次游客冒烟请求，再开启前端入口：

```bash
export SUPABASE_URL='https://your-project.supabase.co'
export SUPABASE_PUBLISHABLE_KEY='sb_publishable_your_key'
export REQUEST_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
export GUEST_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"

curl --fail-with-body "$SUPABASE_URL/functions/v1/ai-growth-assistant" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  -H "Origin: https://www.nurtureprimer.com" \
  -H "Content-Type: application/json" \
  --data "{\"question\":\"请给出一个简短的亲子阅读建议\",\"requestId\":\"$REQUEST_ID\",\"guestId\":\"$GUEST_ID\"}"
```

响应应包含非空 `answer` 和 `quota`。随后查看 Function Logs，确认没有 `AI_NOT_CONFIGURED`、密钥错误或模型错误，再进入下一步。

## 5. 开启 EdgeOne 前端入口

在 EdgeOne Pages 生产环境变量中保留现有 Supabase 配置，并新增：

```text
VITE_AI_ENABLED=true
VITE_AI_REQUEST_TIMEOUT_MS=25000
```

然后重新部署 `main`。Vite 环境变量写入构建产物，修改后必须重新构建。

## 6. 验证清单

1. 未登录状态提问成功，显示“游客体验”剩余额度。
2. 登录后提问成功，显示“账号额度”。
3. Network 请求体只有 `question`、`requestId` 和 `guestId`。
4. 连续请求达到额度后返回明确提示，且不调用模型。
5. 关闭页面或切换视图后，不出现迟到回答或历史写入。
6. 375px 宽度无横向滚动，键盘可完成输入和提交。
7. Supabase Function Logs 不包含问题、回答、邮箱、IP、JWT 或 API Key。

本地验证先启动 Supabase stack：

```bash
npm test
npm run build
supabase start
supabase db reset
supabase test db
```

将本地专用的 `ARK_API_KEY`、`ARK_MODEL_ID`、`AI_ALLOWED_ORIGINS` 和 `AI_QUOTA_SALT` 写入工作区外的临时 env 文件，然后启动：

```bash
supabase functions serve ai-growth-assistant \
  --no-verify-jwt \
  --env-file /absolute/path/to/local-ai.env
```

在另一个终端先查看本地连接信息：

```bash
supabase status
```

将输出中的本地 `Project URL` 和 `Publishable` 值重新导出；不要沿用生产 Key，也不要复制 Secret：

```bash
export SUPABASE_URL='http://127.0.0.1:54321'
export SUPABASE_PUBLISHABLE_KEY='copy-local-publishable-value-here'
export REQUEST_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
export GUEST_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
```

然后执行本地冒烟请求：

```bash
curl --fail-with-body "$SUPABASE_URL/functions/v1/ai-growth-assistant" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_PUBLISHABLE_KEY" \
  -H "Origin: http://127.0.0.1:5173" \
  -H "Content-Type: application/json" \
  --data "{\"question\":\"请给出一个简短的亲子阅读建议\",\"requestId\":\"$REQUEST_ID\",\"guestId\":\"$GUEST_ID\"}"
```

检查 HTTP 200、非空 `answer` 和 `quota`。临时 env 文件不得提交到 Git。

## 7. 监控与故障处理

关注以下脱敏事件：

- `ai.request_completed`
- `ai.request_failed`
- `AI_QUOTA_EXCEEDED`
- `AI_PROVIDER_ERROR`
- `AI_TIMEOUT`
- `AI_NOT_CONFIGURED`

建议告警基线：5 分钟模型失败率超过 20%、端到端 P95 超过 20 秒、连续出现 `AI_NOT_CONFIGURED`，或额度拒绝量异常增长。触发后先检查火山方舟用量、模型 ID、API Key 和 Function Secrets。密钥疑似泄露时立即在火山方舟轮换，并更新 Supabase Secret。

## 8. 回滚

1. 将 EdgeOne `VITE_AI_ENABLED=false` 并重新部署，隐藏 AI 入口。
2. 从上一份已验证 Git commit 恢复 `supabase/functions/` 后重新执行 `supabase functions deploy ai-growth-assistant --no-verify-jwt`；需要完全停止时执行 `supabase functions delete ai-growth-assistant`。
3. 保留 `ai_request_usage` 表；旧前端不会访问它，历史额度记录也不影响其他功能。

## 9. 桌面端说明

Web 版本可以独立上线。Tauri 正式包还需要在发布任务中把精确 Supabase origin 加入 CSP；未完成前不要把桌面端 AI 描述为已验证能力。
