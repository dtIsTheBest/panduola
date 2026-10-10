create or replace function public.normalize_community_text(
  p_value text
)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    coalesce(p_value, ''),
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );
$$;

revoke all on function public.normalize_community_text(text)
from public, anon, authenticated, service_role;

create table public.community_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  nickname text not null
    check (nickname = public.normalize_community_text(nickname))
    check (char_length(nickname) between 1 and 20),
  content text not null
    check (content = public.normalize_community_text(content))
    check (char_length(content) between 1 and 300),
  created_at timestamptz not null default now()
);

create index community_comments_created_idx
on public.community_comments (created_at desc, id desc);

create index community_comments_user_created_idx
on public.community_comments (user_id, created_at desc);

alter table public.community_comments enable row level security;
alter table public.community_comments force row level security;

revoke all on table public.community_comments
from public, anon, authenticated, service_role;

create table public.family_photo_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'ready')),
  object_path text not null unique
    check (object_path = btrim(object_path))
    check (char_length(object_path) between 40 and 200)
    check (object_path like user_id::text || '/%'),
  caption text not null default ''
    check (caption = public.normalize_community_text(caption))
    check (char_length(caption) <= 80),
  mime_type text not null
    check (mime_type = 'image/webp'),
  width integer not null
    check (width between 1 and 1920),
  height integer not null
    check (height between 1 and 1920),
  byte_size bigint not null
    check (byte_size between 1 and 5242880),
  created_at timestamptz not null default now()
);

create index family_photo_items_user_created_idx
on public.family_photo_items (user_id, created_at desc, id desc);

alter table public.family_photo_items enable row level security;
alter table public.family_photo_items force row level security;

revoke all on table public.family_photo_items
from public, anon, authenticated, service_role;

create or replace function public.list_community_comments(
  p_limit integer default 50
)
returns table (
  id uuid,
  nickname text,
  content text,
  created_at timestamptz,
  can_delete boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using
      errcode = '22023',
      message = 'comment limit must be between 1 and 50';
  end if;

  return query
  select
    comments.id,
    comments.nickname,
    comments.content,
    comments.created_at,
    coalesce(
      comments.user_id = (select auth.uid()),
      false
    ) as can_delete
  from public.community_comments as comments
  order by comments.created_at desc, comments.id desc
  limit p_limit;
end;
$$;

create or replace function public.create_community_comment(
  p_nickname text,
  p_content text
)
returns table (
  id uuid,
  nickname text,
  content text,
  created_at timestamptz,
  can_delete boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_nickname text := public.normalize_community_text(p_nickname);
  v_content text := public.normalize_community_text(p_content);
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;
  if v_nickname is null or char_length(v_nickname) < 1 or char_length(v_nickname) > 20 then
    raise exception using
      errcode = '22023',
      message = 'nickname must contain 1 to 20 characters';
  end if;
  if v_content is null or char_length(v_content) < 1 or char_length(v_content) > 300 then
    raise exception using
      errcode = '22023',
      message = 'comment must contain 1 to 300 characters';
  end if;

  return query
  insert into public.community_comments (user_id, nickname, content)
  values (v_user_id, v_nickname, v_content)
  returning
    community_comments.id,
    community_comments.nickname,
    community_comments.content,
    community_comments.created_at,
    true;
end;
$$;

create or replace function public.delete_community_comment(
  p_comment_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_deleted_count integer;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;
  if p_comment_id is null then
    raise exception using
      errcode = '22023',
      message = 'comment id must not be null';
  end if;

  delete from public.community_comments as comments
  where comments.id = p_comment_id
    and comments.user_id = v_user_id;
  get diagnostics v_deleted_count = row_count;
  return v_deleted_count = 1;
end;
$$;

create or replace function public.list_own_family_photos(
  p_limit integer default 24
)
returns table (
  id uuid,
  object_path text,
  caption text,
  mime_type text,
  width integer,
  height integer,
  byte_size bigint,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 24 then
    raise exception using
      errcode = '22023',
      message = 'photo limit must be between 1 and 24';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('family-photo:' || v_user_id::text, 0)
  );

  -- Recover an upload that reached Storage but was interrupted before finalize.
  update public.family_photo_items as photos
  set status = 'ready'
  where photos.user_id = v_user_id
    and photos.status = 'pending'
    and exists (
      select 1
      from storage.objects as objects
      where objects.bucket_id = 'family-photos'
        and objects.name = photos.object_path
        and objects.owner_id = v_user_id::text
    );

  -- Release invisible abandoned reservations and metadata left after an
  -- interrupted Storage-first delete. Fresh pending uploads get a one-hour
  -- recovery window before being reclaimed.
  delete from public.family_photo_items as photos
  where photos.user_id = v_user_id
    and not exists (
      select 1
      from storage.objects as objects
      where objects.bucket_id = 'family-photos'
        and objects.name = photos.object_path
        and objects.owner_id = v_user_id::text
    )
    and (
      photos.status = 'ready'
      or photos.created_at < pg_catalog.now() - interval '1 hour'
    );

  return query
  select
    photos.id,
    photos.object_path,
    photos.caption,
    photos.mime_type,
    photos.width,
    photos.height,
    photos.byte_size,
    photos.created_at
  from public.family_photo_items as photos
  where photos.user_id = v_user_id
    and photos.status = 'ready'
  order by photos.created_at desc, photos.id desc
  limit p_limit;
end;
$$;

create or replace function public.reserve_own_family_photo(
  p_object_path text,
  p_caption text,
  p_mime_type text,
  p_width integer,
  p_height integer,
  p_byte_size bigint
)
returns table (
  allowed boolean,
  id uuid,
  object_path text,
  caption text,
  mime_type text,
  width integer,
  height integer,
  byte_size bigint,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_caption text := public.normalize_community_text(p_caption);
  v_photo_count integer;
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;
  if p_object_path is null or p_object_path !~ (
    '^' || v_user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  ) then
    raise exception using
      errcode = '22023',
      message = 'photo path must use the authenticated user directory and a UUID webp name';
  end if;
  if char_length(v_caption) > 80 then
    raise exception using
      errcode = '22023',
      message = 'photo caption must not exceed 80 characters';
  end if;
  if p_mime_type is distinct from 'image/webp' then
    raise exception using
      errcode = '22023',
      message = 'photo mime type must be image/webp';
  end if;
  if p_width is null or p_width < 1 or p_width > 1920
    or p_height is null or p_height < 1 or p_height > 1920 then
    raise exception using
      errcode = '22023',
      message = 'photo dimensions must be between 1 and 1920 pixels';
  end if;
  if p_byte_size is null or p_byte_size < 1 or p_byte_size > 5242880 then
    raise exception using
      errcode = '22023',
      message = 'photo size must be between 1 and 5242880 bytes';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('family-photo:' || v_user_id::text, 0)
  );

  delete from public.family_photo_items as photos
  where photos.user_id = v_user_id
    and photos.status = 'pending'
    and photos.created_at < pg_catalog.now() - interval '1 hour'
    and not exists (
      select 1
      from storage.objects as objects
      where objects.bucket_id = 'family-photos'
        and objects.name = photos.object_path
        and objects.owner_id = v_user_id::text
    );

  select count(*)::integer
  into v_photo_count
  from public.family_photo_items as photos
  where photos.user_id = v_user_id;

  if v_photo_count >= 24 then
    return query select
      false,
      null::uuid,
      null::text,
      null::text,
      null::text,
      null::integer,
      null::integer,
      null::bigint,
      null::timestamptz;
    return;
  end if;

  return query
  insert into public.family_photo_items (
    user_id,
    status,
    object_path,
    caption,
    mime_type,
    width,
    height,
    byte_size
  )
  values (
    v_user_id,
    'pending',
    p_object_path,
    v_caption,
    p_mime_type,
    p_width,
    p_height,
    p_byte_size
  )
  returning
    true,
    family_photo_items.id,
    family_photo_items.object_path,
    family_photo_items.caption,
    family_photo_items.mime_type,
    family_photo_items.width,
    family_photo_items.height,
    family_photo_items.byte_size,
    family_photo_items.created_at;
end;
$$;

create or replace function public.finalize_own_family_photo(
  p_photo_id uuid
)
returns table (
  id uuid,
  object_path text,
  caption text,
  mime_type text,
  width integer,
  height integer,
  byte_size bigint,
  created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;
  if p_photo_id is null then
    raise exception using
      errcode = '22023',
      message = 'photo id must not be null';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('family-photo:' || v_user_id::text, 0)
  );

  update public.family_photo_items as photos
  set status = 'ready'
  where photos.id = p_photo_id
    and photos.user_id = v_user_id
    and photos.status = 'pending'
    and exists (
      select 1
      from storage.objects as objects
      where objects.bucket_id = 'family-photos'
        and objects.name = photos.object_path
        and objects.owner_id = v_user_id::text
    );

  return query
  select
    photos.id,
    photos.object_path,
    photos.caption,
    photos.mime_type,
    photos.width,
    photos.height,
    photos.byte_size,
    photos.created_at
  from public.family_photo_items as photos
  where photos.id = p_photo_id
    and photos.user_id = v_user_id
    and photos.status = 'ready';
end;
$$;

create or replace function public.cancel_own_family_photo(
  p_photo_id uuid
)
returns table (
  deleted boolean,
  object_path text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;
  if p_photo_id is null then
    raise exception using
      errcode = '22023',
      message = 'photo id must not be null';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('family-photo:' || v_user_id::text, 0)
  );

  return query
  with deleted_photo as (
    delete from public.family_photo_items as photos
    where photos.id = p_photo_id
      and photos.user_id = v_user_id
      and photos.status = 'pending'
      and not exists (
        select 1
        from storage.objects as objects
        where objects.bucket_id = 'family-photos'
          and objects.name = photos.object_path
          and objects.owner_id = v_user_id::text
      )
    returning photos.object_path
  )
  select true, deleted_photo.object_path
  from deleted_photo
  union all
  select false, null::text
  where not exists (select 1 from deleted_photo)
  limit 1;
end;
$$;

create or replace function public.delete_own_family_photo(
  p_photo_id uuid
)
returns table (
  deleted boolean,
  object_path text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'authentication required';
  end if;
  if p_photo_id is null then
    raise exception using
      errcode = '22023',
      message = 'photo id must not be null';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('family-photo:' || v_user_id::text, 0)
  );

  return query
  with deleted_photo as (
    delete from public.family_photo_items as photos
    where photos.id = p_photo_id
      and photos.user_id = v_user_id
      and photos.status = 'ready'
      and not exists (
        select 1
        from storage.objects as objects
        where objects.bucket_id = 'family-photos'
          and objects.name = photos.object_path
          and objects.owner_id = v_user_id::text
      )
    returning photos.object_path
  )
  select true, deleted_photo.object_path
  from deleted_photo
  union all
  select false, null::text
  where not exists (select 1 from deleted_photo)
  limit 1;
end;
$$;

create or replace function public.can_upload_family_photo(
  p_object_path text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_allowed boolean;
begin
  if v_user_id is null then
    return false;
  end if;

  -- Storage INSERT and metadata cancellation must serialize. Without the
  -- shared transaction lock, both can pass their existence checks and leave
  -- an object without quota-bearing metadata.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('family-photo:' || v_user_id::text, 0)
  );

  select exists (
    select 1
    from public.family_photo_items as photos
    where photos.user_id = v_user_id
      and photos.object_path = p_object_path
      and photos.status = 'pending'
  ) into v_allowed;

  return v_allowed;
end;
$$;

revoke all on function public.list_community_comments(integer)
from public, anon, authenticated, service_role;
revoke all on function public.create_community_comment(text, text)
from public, anon, authenticated, service_role;
revoke all on function public.delete_community_comment(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.list_own_family_photos(integer)
from public, anon, authenticated, service_role;
revoke all on function public.reserve_own_family_photo(text, text, text, integer, integer, bigint)
from public, anon, authenticated, service_role;
revoke all on function public.finalize_own_family_photo(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.cancel_own_family_photo(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.delete_own_family_photo(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.can_upload_family_photo(text)
from public, anon, authenticated, service_role;

grant execute on function public.list_community_comments(integer)
to anon, authenticated;
grant execute on function public.create_community_comment(text, text)
to authenticated;
grant execute on function public.delete_community_comment(uuid)
to authenticated;
grant execute on function public.list_own_family_photos(integer)
to authenticated;
grant execute on function public.reserve_own_family_photo(text, text, text, integer, integer, bigint)
to authenticated;
grant execute on function public.finalize_own_family_photo(uuid)
to authenticated;
grant execute on function public.cancel_own_family_photo(uuid)
to authenticated;
grant execute on function public.delete_own_family_photo(uuid)
to authenticated;
grant execute on function public.can_upload_family_photo(text)
to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'family-photos',
  'family-photos',
  false,
  5242880,
  array['image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read their own family photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'family-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);

create policy "Users can upload their own family photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'family-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
  and name ~ (
    '^' || (select auth.uid())::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  )
  and public.can_upload_family_photo(name)
);

create policy "Users can delete their own family photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'family-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);
