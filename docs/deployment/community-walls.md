# 评论建议墙与私有亲子照片墙部署

本文用于部署公开留言与账号私有照片功能。发布顺序必须保持为：

1. Supabase migration；
2. 数据库、RPC、Bucket 与 Storage Policy 验证；
3. EdgeOne 前端环境变量与构建；
4. 匿名和双账号生产冒烟。

AI 相关源码和服务端能力继续保留，回滚前端时不删除社区数据。

## 1. 发布前检查

- Supabase CLI 已关联目标项目，`supabase/.temp/project-ref` 指向预期项目。
- 前端只使用 Supabase publishable/anon key，禁止使用 `sb_secret_*` 或 service-role JWT。
- 工作区没有真实邮箱、照片、验证码、签名 URL、数据库密码或 API Key 将被提交。
- 本地门禁通过：

  ```bash
  supabase migration up --local
  supabase test db
  supabase db lint --local --level warning
  npm test
  npm run build
  ```

## 2. 部署 Supabase migration

推荐在已关联项目中执行：

```bash
supabase migration list --linked
supabase db push --dry-run
supabase db push
```

本次 migration 为：

```text
supabase/migrations/202610100003_community_walls.sql
```

它会创建：

- `public.community_comments` 与公开 DTO RPC；
- `public.family_photo_items` 与本人照片状态机 RPC；
- private `family-photos` Bucket；
- `storage.objects` 的本人目录 SELECT、INSERT、DELETE Policy。

不要把同一 migration 再复制到 SQL Editor 执行，否则会造成 migration history 漂移。若因应急必须使用 SQL Editor，完成后应核对实际对象并使用 `supabase migration repair` 登记对应版本。

## 3. 数据库与 Storage 验证

在 Supabase Dashboard 中确认：

- `family-photos` 为 private；
- 单文件上限为 5 MiB；
- MIME 仅允许 `image/webp`；
- anon/authenticated 对两张业务表均没有直接读写权限；
- `list_community_comments` 允许 anon/authenticated 执行，写入和本人照片 RPC 仅允许 authenticated。

只读核对 SQL：

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'family-photos';

select policyname, cmd, roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like '%family photos%'
order by policyname;
```

不要直接对 `storage.objects` 执行 INSERT、UPDATE 或 DELETE；对象操作必须走 Storage API。

## 4. EdgeOne 前端配置

在 EdgeOne Pages 生产环境保留现有 Supabase 配置，并增加：

```text
VITE_COMMUNITY_ENABLED=true
```

同时确认已有变量：

```text
VITE_SYNC_ENABLED=true
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-or-anon-key>
```

Vite 会把 `VITE_*` 写入公开构建产物，因此这些变量只能包含公开客户端配置。保存后从 GitHub `main` 触发新的 EdgeOne 构建。

## 5. 生产冒烟

### 5.1 匿名访问

1. 使用无登录 Session 的浏览器打开首页。
2. 评论建议墙可读取公开留言，不显示邮箱或用户 ID。
3. 点击“登录留言”和“登录开启照片墙”均打开账号中心。
4. 照片墙不请求或展示任何私有照片。

### 5.2 账号 A

1. 登录账号 A，发布一条无敏感信息的测试留言。
2. 确认留言仅对账号 A 显示删除入口。
3. 上传一张无真实人物、定位或隐私内容的测试图。
4. 确认图片使用短时签名 URL，刷新后仍只在账号 A 中可见。
5. 暂时保留 A 的留言和照片，直到账号 B 与反向隔离验证完成。

### 5.3 账号 B

1. 切换账号 B，确认可以看见账号 A 的公开留言，但没有删除入口。
2. 确认账号 B 看不到账号 A 的任何照片。
3. 账号 B 上传测试图后，切回账号 A，确认双方照片互不可见。
4. 账号 A 仍能看见自己的留言和照片，且看不到账号 B 的照片。
5. 退出登录，确认页面立即清空照片和旧签名 URL 引用。
6. 重新登录账号 A，删除 A 的测试留言和测试图；再登录账号 B 删除 B 的测试图，确认焦点和状态提示正常。

生产冒烟禁止使用真实儿童照片；使用无人物的临时测试图，验收完成后通过页面删除。

## 6. 监控与故障处理

- 评论故障不应影响照片、资源库、成长记录或本地数据。
- Storage 故障时保留照片元数据和可重试状态，不直接改底层对象表。
- 上传中断后，下一次照片列表读取会恢复已存在对象；超过一小时且没有对象的 pending 预留会自动回收。
- 删除采用 Storage-first；对象已删除但元数据请求中断时，下一次列表读取会清理缺失对象的 ready 元数据。
- 通过 Supabase Dashboard 观察数据库错误、Storage 使用量和 4xx/5xx 增长。

如公开留言出现滥用，可先执行紧急止写：

```sql
revoke execute on function public.create_community_comment(text, text)
from authenticated;
```

恢复写入：

```sql
grant execute on function public.create_community_comment(text, text)
to authenticated;
```

## 7. 回滚

前端止用或回滚均不执行破坏性数据库降级：

1. 紧急停止社区网络与写入时，将 EdgeOne `VITE_COMMUNITY_ENABLED=false` 并重新构建；双墙仍会显示，但明确提示服务不可用。
2. 真正恢复旧 AI 体验时，回退到上一份已验证的前端 commit，或恢复 `Dashboard.vue` 中 `AIExperience` 的挂载；AI 源码与服务端能力仍在。
3. 保留评论表、照片元数据、private Bucket、Policy 和对象。
4. 不删除 migration、不删除 Bucket、不清空用户照片。

止用后确认双墙不再发起社区请求；完整回滚后确认旧前端不再引用社区入口。同时验证现有账号同步、资源库和成长功能仍可使用。
