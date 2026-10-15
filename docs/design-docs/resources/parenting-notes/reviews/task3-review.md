# Task 3 发布验证记录

> **日期**: 2026-10-15
> **结论**: 数据库发布与本地门禁 PASS；前端推送等待 GitHub 重新认证

## 变更范围

- `.env.example`
- `docs/deployment/parenting-notes.md`
- `supabase/migrations/202610150001_parenting_notes.sql`

## 验证结果

- Node：209/209 PASS。
- Supabase pgTAP：131/131 PASS。
- `supabase db lint --local --level warning`：无 Schema 错误。
- `npm run build`：PASS。
- 格式检查与 `git diff --check`：PASS。
- 远端 migration `202610150001`：已发布并与本地一致。
- 本地提交 `b35b1a3` 已生成；GitHub HTTPS 凭据失效，前端尚未推送至远端。

## 回滚边界

- 前端可通过 `VITE_PARENTING_NOTES_ENABLED=false` 停用入口。
- 回滚前端时保留私有表、Bucket、Policy 与用户对象，不执行破坏性数据回滚。
