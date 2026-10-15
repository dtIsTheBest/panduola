# 私有育儿手记部署

育儿手记正文保存在 Supabase Postgres，图片保存在独立的 private Storage Bucket。手记不进入现有账号快照，因此不会改变同步 Schema 或历史快照 hash。

## 1. 发布顺序

1. 确认 Supabase CLI 已关联正确项目。
2. 执行并验证 migration：

   ```bash
   supabase migration list --linked
   supabase db push --dry-run
   supabase db push
   ```

3. 在 EdgeOne Pages 生产环境增加：

   ```text
   VITE_PARENTING_NOTES_ENABLED=true
   ```

4. 从 GitHub `main` 触发新的前端构建。

本次 migration：

```text
supabase/migrations/202610150001_parenting_notes.sql
```

## 2. 安全核对

在 Supabase Dashboard 确认：

- `parenting-note-images` Bucket 为 private；
- 单对象最大 5 MiB，仅允许 `image/webp`；
- `parenting_notes` 与 `parenting_note_images` 均启用并强制 RLS；
- anon 角色没有两张表的任何权限；
- Storage Policy 只允许 `auth.uid()` 对应的首级目录。

本地门禁：

```bash
supabase migration up --local
supabase test db
npm test
npm run build
```

## 3. 生产冒烟

### 未登录

- 资源库可以切换到“育儿手记”。
- 页面只显示登录引导，不能创建或读取手记。

### 账号 A

- 创建一篇包含普通文本、裸 HTTPS 地址和 Markdown 链接的手记。
- 上传 1—2 张不含真实儿童或定位隐私的临时测试图。
- 刷新页面后文字、链接和图片仍可读取。
- 编辑标题、正文和图片，再确认删除功能正常。

### 账号 B

- 切换账号后不能看到账号 A 的手记或图片。
- 创建账号 B 的测试手记，再切回账号 A，双方内容仍严格隔离。
- 冒烟完成后删除所有临时测试内容。

## 4. 故障与回滚

- 图片上传失败不回滚已经保存的文字；用户可重新编辑并补传图片。
- 删除采用 Storage-first；Storage 暂时不可用时保留数据库记录，避免失去后续清理路径。
- 需要紧急关闭入口时，将 `VITE_PARENTING_NOTES_ENABLED=false` 后重新构建。
- 前端回滚时保留两张表、Bucket、Policy 和对象，不执行破坏性数据库回滚。
- 签名 URL、正文、标题和对象路径不得写入日志或错误上报。
