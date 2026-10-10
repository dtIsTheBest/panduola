begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select set_config('storage.allow_delete_query', 'true', true);
select no_plan();

select has_table('public', 'community_comments', 'community comments table exists');
select has_table('public', 'family_photo_items', 'family photo metadata table exists');

select columns_are(
  'public',
  'community_comments',
  array['id', 'user_id', 'nickname', 'content', 'created_at'],
  'comment table contains only required private columns'
);

select columns_are(
  'public',
  'family_photo_items',
  array[
    'id',
    'user_id',
    'status',
    'object_path',
    'caption',
    'mime_type',
    'width',
    'height',
    'byte_size',
    'created_at'
  ],
  'photo table contains constrained metadata only'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = 'public.community_comments'::regclass
  ),
  'comment table enables and forces RLS'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = 'public.family_photo_items'::regclass
  ),
  'photo table enables and forces RLS'
);

select ok(
  not has_table_privilege('anon', 'public.community_comments', 'SELECT')
    and not has_table_privilege('authenticated', 'public.community_comments', 'SELECT')
    and not has_table_privilege('authenticated', 'public.community_comments', 'INSERT')
    and not has_table_privilege('authenticated', 'public.community_comments', 'DELETE'),
  'browser roles cannot access private comment rows directly'
);

select ok(
  not has_table_privilege('anon', 'public.family_photo_items', 'SELECT')
    and not has_table_privilege('authenticated', 'public.family_photo_items', 'SELECT')
    and not has_table_privilege('authenticated', 'public.family_photo_items', 'INSERT')
    and not has_table_privilege('authenticated', 'public.family_photo_items', 'DELETE'),
  'browser roles cannot access private photo metadata directly'
);

select ok(
  has_function_privilege('anon', 'public.list_community_comments(integer)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.list_community_comments(integer)', 'EXECUTE'),
  'anonymous and authenticated users can list public comments'
);

select ok(
  not has_function_privilege('anon', 'public.create_community_comment(text,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.delete_community_comment(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.create_community_comment(text,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.delete_community_comment(uuid)', 'EXECUTE'),
  'only authenticated users can create or delete comments'
);

select ok(
  not has_function_privilege('anon', 'public.list_own_family_photos(integer)', 'EXECUTE')
    and not has_function_privilege(
      'anon',
      'public.reserve_own_family_photo(text,text,text,integer,integer,bigint)',
      'EXECUTE'
    )
    and has_function_privilege('authenticated', 'public.list_own_family_photos(integer)', 'EXECUTE')
    and has_function_privilege(
      'authenticated',
      'public.reserve_own_family_photo(text,text,text,integer,integer,bigint)',
      'EXECUTE'
    ),
  'photo RPC surface is authenticated only'
);

select ok(
  (
    select bool_and(prosecdef)
    from pg_catalog.pg_proc
    where oid in (
      'public.list_community_comments(integer)'::regprocedure,
      'public.create_community_comment(text,text)'::regprocedure,
      'public.delete_community_comment(uuid)'::regprocedure,
      'public.list_own_family_photos(integer)'::regprocedure,
      'public.reserve_own_family_photo(text,text,text,integer,integer,bigint)'::regprocedure,
      'public.finalize_own_family_photo(uuid)'::regprocedure,
      'public.cancel_own_family_photo(uuid)'::regprocedure,
      'public.delete_own_family_photo(uuid)'::regprocedure,
      'public.can_upload_family_photo(text)'::regprocedure
    )
  ),
  'all community RPCs are security definer functions'
);

select ok(
  (
    select bool_and(
      pg_catalog.array_to_string(proconfig, ',') like '%search_path=""%'
    )
    from pg_catalog.pg_proc
    where oid in (
      'public.list_community_comments(integer)'::regprocedure,
      'public.create_community_comment(text,text)'::regprocedure,
      'public.delete_community_comment(uuid)'::regprocedure,
      'public.list_own_family_photos(integer)'::regprocedure,
      'public.reserve_own_family_photo(text,text,text,integer,integer,bigint)'::regprocedure,
      'public.finalize_own_family_photo(uuid)'::regprocedure,
      'public.cancel_own_family_photo(uuid)'::regprocedure,
      'public.delete_own_family_photo(uuid)'::regprocedure,
      'public.can_upload_family_photo(text)'::regprocedure
    )
  ),
  'all security definer RPCs pin an empty search path'
);

select ok(
  not has_function_privilege('anon', 'public.delete_own_family_photo(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.cancel_own_family_photo(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.delete_own_family_photo(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.cancel_own_family_photo(uuid)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.finalize_own_family_photo(uuid)', 'EXECUTE'),
  'photo finalize cancel and delete RPC grants are authenticated only'
);

select is(
  (
    select count(*)::integer
    from storage.buckets
    where id = 'family-photos'
      and public = false
      and file_size_limit = 5242880
      and allowed_mime_types = array['image/webp']::text[]
  ),
  1,
  'family photo bucket is private and restricted to five MiB WebP files'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'Users can read their own family photos',
        'Users can upload their own family photos',
        'Users can delete their own family photos'
      )
  ),
  3,
  'storage has separate select insert and delete policies'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like '%family photos%'
      and cmd = 'UPDATE'
  ),
  0,
  'family photo objects cannot be updated or overwritten'
);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'parent-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'parent-b@example.test');

create temporary table community_test_context (
  context_key text primary key,
  context_id uuid not null
) on commit drop;
grant select, insert on table community_test_context to authenticated;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$select count(*)::bigint from public.list_community_comments(50)$$,
  $$values (0::bigint)$$,
  'anonymous visitors can read an empty public wall'
);

select throws_ok(
  $$select * from public.create_community_comment('Guest', 'Not allowed')$$,
  '42501',
  null::text,
  'anonymous visitors cannot create comments'
);

select throws_ok(
  $$select * from public.list_own_family_photos(24)$$,
  '42501',
  null::text,
  'anonymous visitors cannot list private photos'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select nickname, content, can_delete
    from public.create_community_comment(' Parent A ', ' First suggestion ')
  $$,
  $$values ('Parent A'::text, 'First suggestion'::text, true)$$,
  'comment creation trims input and returns an owner DTO'
);

insert into community_test_context (context_key, context_id)
select 'comment-a', comments.id
from public.list_community_comments(50) as comments
where comments.nickname = 'Parent A';

select results_eq(
  $$
    select comments.nickname, comments.content, comments.can_delete
    from public.list_community_comments(50) as comments
  $$,
  $$values ('Parent A'::text, 'First suggestion'::text, true)$$,
  'comment author sees delete permission'
);

select results_eq(
  $$
    select to_jsonb(comments) ? 'user_id', to_jsonb(comments) ? 'email'
    from public.list_community_comments(50) as comments
  $$,
  $$values (false, false)$$,
  'public comment DTO contains no user id or email'
);

select throws_ok(
  $$select * from public.community_comments$$,
  '42501',
  null::text,
  'authenticated users cannot bypass the comment RPC'
);

select throws_ok(
  $$select * from public.create_community_comment(repeat('n', 21), 'content')$$,
  '22023',
  'nickname must contain 1 to 20 characters',
  'nickname length is enforced by the RPC'
);

select throws_ok(
  $$select * from public.create_community_comment(E'\t\n', 'content')$$,
  '22023',
  'nickname must contain 1 to 20 characters',
  'tab and newline only nickname is rejected'
);

select throws_ok(
  $$select * from public.create_community_comment('Parent A', E'\r\n\t')$$,
  '22023',
  'comment must contain 1 to 300 characters',
  'tab and newline only comment is rejected'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select results_eq(
  $$
    select comments.nickname, comments.content, comments.can_delete
    from public.list_community_comments(50) as comments
  $$,
  $$values ('Parent A'::text, 'First suggestion'::text, false)$$,
  'anonymous visitors see an explicit false delete flag'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

insert into community_test_context (context_key, context_id)
select 'photo-a', photos.id
from public.reserve_own_family_photo(
  '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
  ' Family day ',
  'image/webp',
  1280,
  960,
  2048
) as photos;

insert into community_test_context (context_key, context_id)
select 'photo-unuploaded', photos.id
from public.reserve_own_family_photo(
  '11111111-1111-4111-8111-111111111111/abababab-abab-4bab-8bab-abababababab.webp',
  '',
  'image/webp',
  100,
  100,
  1000
) as photos
where photos.allowed;

select results_eq(
  $$
    select count(*)::bigint
    from public.finalize_own_family_photo(
      (select context_id from community_test_context where context_key = 'photo-unuploaded')
    )
  $$,
  $$values (0::bigint)$$,
  'photo metadata cannot be finalized before its Storage object exists'
);

select results_eq(
  $$
    select deleted
    from public.cancel_own_family_photo(
      (select context_id from community_test_context where context_key = 'photo-unuploaded')
    )
  $$,
  $$values (true)$$,
  'an unuploaded pending reservation can be cancelled'
);

select results_eq(
  $$
    select public.can_upload_family_photo(
      '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
    )
  $$,
  $$values (true)$$,
  'reserved object path is authorized for upload'
);

select throws_ok(
  $$
    select * from public.reserve_own_family_photo(
      '22222222-2222-4222-8222-222222222222/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
      '',
      'image/webp',
      100,
      100,
      1000
    )
  $$,
  '22023',
  'photo path must use the authenticated user directory and a UUID webp name',
  'user A cannot create metadata under user B directory'
);

select throws_ok(
  $$select * from public.family_photo_items$$,
  '42501',
  null::text,
  'authenticated users cannot bypass the photo RPC'
);

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'family-photos',
      '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
      '11111111-1111-4111-8111-111111111111'
    )
  $$,
  'user A can insert an object only in their folder'
);

select results_eq(
  $$
    select deleted, object_path
    from public.cancel_own_family_photo(
      (select context_id from community_test_context where context_key = 'photo-a')
    )
  $$,
  $$values (false, null::text)$$,
  'an uploaded object prevents reservation cancellation and orphaning'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'family-photos',
      '11111111-1111-4111-8111-111111111111/not-a-uuid.webp',
      '11111111-1111-4111-8111-111111111111'
    )
  $$,
  '42501',
  null::text,
  'user A cannot upload an unreserved or malformed object path'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'family-photos',
      '22222222-2222-4222-8222-222222222222/dddddddd-dddd-4ddd-8ddd-dddddddddddd.webp',
      '11111111-1111-4111-8111-111111111111'
    )
  $$,
  '42501',
  null::text,
  'user A cannot insert an object in user B folder'
);

select results_eq(
  $$
    select object_path, caption, mime_type, width, height, byte_size
    from public.finalize_own_family_photo(
      (select context_id from community_test_context where context_key = 'photo-a')
    )
  $$,
  $$
    values (
      '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'::text,
      'Family day'::text,
      'image/webp'::text,
      1280,
      960,
      2048::bigint
    )
  $$,
  'user A finalizes uploaded photo metadata'
);

select results_eq(
  $$select count(*)::bigint from public.list_own_family_photos(24)$$,
  $$values (1::bigint)$$,
  'user A lists only ready photo metadata'
);

insert into community_test_context (context_key, context_id)
select 'photo-recover', photos.id
from public.reserve_own_family_photo(
  '11111111-1111-4111-8111-111111111111/acacacac-acac-4cac-8cac-acacacacacac.webp',
  'Recovered upload',
  'image/webp',
  640,
  480,
  1500
) as photos
where photos.allowed;

insert into storage.objects (bucket_id, name, owner_id)
values (
  'family-photos',
  '11111111-1111-4111-8111-111111111111/acacacac-acac-4cac-8cac-acacacacacac.webp',
  '11111111-1111-4111-8111-111111111111'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.list_own_family_photos(24) as photos
    where photos.object_path =
      '11111111-1111-4111-8111-111111111111/acacacac-acac-4cac-8cac-acacacacacac.webp'
  $$,
  $$values (1::bigint)$$,
  'listing recovers an upload interrupted before finalize'
);

delete from storage.objects
where bucket_id = 'family-photos'
  and name = '11111111-1111-4111-8111-111111111111/acacacac-acac-4cac-8cac-acacacacacac.webp';

select results_eq(
  $$select count(*)::bigint from public.list_own_family_photos(24)$$,
  $$values (1::bigint)$$,
  'listing removes metadata left after an interrupted Storage-first delete'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '22222222-2222-4222-8222-222222222222',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select comments.nickname, comments.content, comments.can_delete
    from public.list_community_comments(50) as comments
  $$,
  $$values ('Parent A'::text, 'First suggestion'::text, false)$$,
  'other users can read public comments without delete permission'
);

select results_eq(
  $$
    select public.delete_community_comment(context_id)
    from community_test_context
    where context_key = 'comment-a'
  $$,
  $$values (false)$$,
  'user B cannot delete user A comment'
);

select results_eq(
  $$select count(*)::bigint from public.list_own_family_photos(24)$$,
  $$values (0::bigint)$$,
  'user B cannot list user A photo metadata'
);

select results_eq(
  $$
    select deleted, object_path
    from public.delete_own_family_photo(
      (select context_id from community_test_context where context_key = 'photo-a')
    )
  $$,
  $$values (false, null::text)$$,
  'user B cannot delete user A photo metadata'
);

select results_eq(
  $$
    select name
    from storage.objects
    where bucket_id = 'family-photos'
  $$,
  $$select null::text where false$$,
  'user B cannot read user A storage object'
);

select results_eq(
  $$
    delete from storage.objects
    where bucket_id = 'family-photos'
      and name = '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
    returning name
  $$,
  $$select null::text where false$$,
  'user B cannot delete user A storage object'
);

reset role;

insert into public.family_photo_items (
  user_id,
  object_path,
  caption,
  mime_type,
  width,
  height,
  byte_size
)
select
  '11111111-1111-4111-8111-111111111111'::uuid,
  '11111111-1111-4111-8111-111111111111/' || gen_random_uuid()::text || '.webp',
  '',
  'image/webp',
  100,
  100,
  1000
from generate_series(1, 23);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select results_eq(
  $$
    select allowed
    from public.reserve_own_family_photo(
      '11111111-1111-4111-8111-111111111111/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.webp',
      '',
      'image/webp',
      100,
      100,
      1000
    )
  $$,
  $$values (false)$$,
  'the twenty fifth photo is rejected atomically'
);

select results_eq(
  $$
    select public.delete_community_comment(context_id)
    from community_test_context
    where context_key = 'comment-a'
  $$,
  $$values (true)$$,
  'comment author can delete their own comment'
);

select results_eq(
  $$
    select deleted, object_path
    from public.delete_own_family_photo(
      (select context_id from community_test_context where context_key = 'photo-a')
    )
  $$,
  $$values (false, null::text)$$,
  'ready metadata cannot be deleted while its Storage object still exists'
);

select results_eq(
  $$
    delete from storage.objects
    where bucket_id = 'family-photos'
      and name = '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'
    returning name
  $$,
  $$
    values (
      '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'::text
    )
  $$,
  'photo owner can delete their own storage object'
);

select results_eq(
  $$
    select deleted, object_path
    from public.delete_own_family_photo(
      (select context_id from community_test_context where context_key = 'photo-a')
    )
  $$,
  $$
    values (
      true,
      '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp'::text
    )
  $$,
  'photo owner can delete metadata after deleting the Storage object'
);

insert into community_test_context (context_key, context_id)
select 'photo-cancel', photos.id
from public.reserve_own_family_photo(
  '11111111-1111-4111-8111-111111111111/ffffffff-ffff-4fff-8fff-ffffffffffff.webp',
  '',
  'image/webp',
  100,
  100,
  1000
) as photos
where photos.allowed;

select results_eq(
  $$
    select deleted, object_path
    from public.cancel_own_family_photo(
      (select context_id from community_test_context where context_key = 'photo-cancel')
    )
  $$,
  $$
    values (
      true,
      '11111111-1111-4111-8111-111111111111/ffffffff-ffff-4fff-8fff-ffffffffffff.webp'::text
    )
  $$,
  'photo owner can cancel a pending reservation'
);

reset role;

insert into public.family_photo_items (
  user_id,
  status,
  object_path,
  caption,
  mime_type,
  width,
  height,
  byte_size,
  created_at
)
values (
  '11111111-1111-4111-8111-111111111111',
  'pending',
  '11111111-1111-4111-8111-111111111111/adadadad-adad-4dad-8dad-adadadadadad.webp',
  '',
  'image/webp',
  100,
  100,
  1000,
  now() - interval '2 hours'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

insert into community_test_context (context_key, context_id)
select 'photo-after-stale', photos.id
from public.reserve_own_family_photo(
  '11111111-1111-4111-8111-111111111111/aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae.webp',
  '',
  'image/webp',
  100,
  100,
  1000
) as photos
where photos.allowed;

select results_eq(
  $$
    select public.can_upload_family_photo(
      '11111111-1111-4111-8111-111111111111/adadadad-adad-4dad-8dad-adadadadadad.webp'
    )
  $$,
  $$values (false)$$,
  'a stale unuploaded reservation is reclaimed before applying the quota'
);

select results_eq(
  $$
    select deleted
    from public.cancel_own_family_photo(
      (select context_id from community_test_context where context_key = 'photo-after-stale')
    )
  $$,
  $$values (true)$$,
  'reservation after stale cleanup can be cancelled normally'
);

reset role;

create temporary table photo_concurrent_results (
  allowed boolean not null
) on commit drop;

do $$
declare
  v_connection_string text :=
    'host=host.docker.internal port=54322 '
    || 'dbname=postgres user=postgres password=postgres';
  v_backend_pid_1 integer;
  v_backend_pid_2 integer;
begin
  perform extensions.dblink_connect('photo_setup', v_connection_string);
  perform extensions.dblink_exec(
    'photo_setup',
    $query$
      delete from auth.users
      where id = '33333333-3333-4333-8333-333333333333';
      insert into auth.users (id, email)
      values (
        '33333333-3333-4333-8333-333333333333',
        'parent-c@example.test'
      );
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
      select
        '33333333-3333-4333-8333-333333333333'::uuid,
        'ready',
        '33333333-3333-4333-8333-333333333333/' || gen_random_uuid()::text || '.webp',
        '',
        'image/webp',
        100,
        100,
        1000
      from generate_series(1, 23)
    $query$
  );
  perform extensions.dblink_disconnect('photo_setup');

  perform extensions.dblink_connect('photo_reserve_1', v_connection_string);
  perform extensions.dblink_connect('photo_reserve_2', v_connection_string);
  select pid into v_backend_pid_1
  from extensions.dblink(
    'photo_reserve_1',
    'select pg_catalog.pg_backend_pid()'
  ) as result(pid integer);
  select pid into v_backend_pid_2
  from extensions.dblink(
    'photo_reserve_2',
    'select pg_catalog.pg_backend_pid()'
  ) as result(pid integer);

  -- Hold the exact lock used by the RPC so both requests reach the tested
  -- serialization point before either can count or insert.
  perform pg_catalog.pg_advisory_lock(
    pg_catalog.hashtextextended(
      'family-photo:33333333-3333-4333-8333-333333333333',
      0
    )
  );
  perform extensions.dblink_send_query(
    'photo_reserve_1',
    $query$
      with claims as materialized (
        select
          set_config(
            'request.jwt.claim.sub',
            '33333333-3333-4333-8333-333333333333',
            false
          ),
          set_config(
            'request.jwt.claims',
            '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
            false
          )
      )
      select reservation.allowed
      from claims
      cross join lateral public.reserve_own_family_photo(
        '33333333-3333-4333-8333-333333333333/33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp',
        '',
        'image/webp',
        100,
        100,
        1000
      ) as reservation
    $query$
  );
  perform extensions.dblink_send_query(
    'photo_reserve_2',
    $query$
      with claims as materialized (
        select
          set_config(
            'request.jwt.claim.sub',
            '33333333-3333-4333-8333-333333333333',
            false
          ),
          set_config(
            'request.jwt.claims',
            '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
            false
          )
      )
      select reservation.allowed
      from claims
      cross join lateral public.reserve_own_family_photo(
        '33333333-3333-4333-8333-333333333333/33333333-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
        '',
        'image/webp',
        100,
        100,
        1000
      ) as reservation
    $query$
  );

  for v_attempt in 1..500 loop
    exit when (
      select count(*)
      from pg_catalog.pg_locks
      where locktype = 'advisory'
        and not granted
        and pid in (v_backend_pid_1, v_backend_pid_2)
    ) >= 2;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
  if (
    select count(*)
    from pg_catalog.pg_locks
    where locktype = 'advisory'
      and not granted
      and pid in (v_backend_pid_1, v_backend_pid_2)
  ) < 2 then
    raise exception 'concurrent photo reservations did not reach the RPC lock';
  end if;
  perform pg_catalog.pg_advisory_unlock(
    pg_catalog.hashtextextended(
      'family-photo:33333333-3333-4333-8333-333333333333',
      0
    )
  );
end;
$$;

insert into photo_concurrent_results
select *
from extensions.dblink_get_result('photo_reserve_1') as result(allowed boolean);

insert into photo_concurrent_results
select *
from extensions.dblink_get_result('photo_reserve_2') as result(allowed boolean);

do $$
begin
  perform 1
  from extensions.dblink_get_result('photo_reserve_1') as result(allowed boolean);
  perform 1
  from extensions.dblink_get_result('photo_reserve_2') as result(allowed boolean);
end;
$$;

select is(
  (
    select count(*)::integer
    from photo_concurrent_results
    where allowed
  ),
  1,
  'two concurrent reservations at count twenty three produce one winner'
);

select is(
  (
    select count(*)::integer
    from public.family_photo_items
    where user_id = '33333333-3333-4333-8333-333333333333'
  ),
  24,
  'concurrent reservations persist no more than twenty four rows'
);

do $$
begin
  perform extensions.dblink_exec(
    'photo_reserve_1',
    $query$
      delete from auth.users
      where id = '33333333-3333-4333-8333-333333333333'
    $query$
  );
  perform extensions.dblink_disconnect('photo_reserve_1');
  perform extensions.dblink_disconnect('photo_reserve_2');
end;
$$;

create temporary table photo_upload_cancel_result (
  deleted boolean not null
) on commit drop;

do $$
declare
  v_connection_string text :=
    'host=host.docker.internal port=54322 '
    || 'dbname=postgres user=postgres password=postgres';
  v_cancel_pid integer;
begin
  perform extensions.dblink_connect('photo_upload', v_connection_string);
  perform extensions.dblink_connect('photo_cancel', v_connection_string);
  perform extensions.dblink_exec(
    'photo_upload',
    'set storage.allow_delete_query = ''true'''
  );

  perform extensions.dblink_exec(
    'photo_upload',
    $query$
      delete from auth.users
      where id = '44444444-4444-4444-8444-444444444444';
      insert into auth.users (id, email)
      values (
        '44444444-4444-4444-8444-444444444444',
        'parent-d@example.test'
      );
      insert into public.family_photo_items (
        id,
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
        '44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '44444444-4444-4444-8444-444444444444',
        'pending',
        '44444444-4444-4444-8444-444444444444/44444444-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
        '',
        'image/webp',
        100,
        100,
        1000
      )
    $query$
  );

  perform extensions.dblink_exec('photo_upload', 'begin');
  perform extensions.dblink_exec(
    'photo_upload',
    $query$
      set local role authenticated;
      set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
      set local request.jwt.claims =
        '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}'
    $query$
  );
  perform extensions.dblink_exec(
    'photo_upload',
    $query$
      insert into storage.objects (bucket_id, name, owner_id)
      values (
        'family-photos',
        '44444444-4444-4444-8444-444444444444/44444444-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
        '44444444-4444-4444-8444-444444444444'
      )
    $query$
  );

  perform extensions.dblink_exec('photo_cancel', 'set role authenticated');
  select pid into v_cancel_pid
  from extensions.dblink(
    'photo_cancel',
    'select pg_catalog.pg_backend_pid()'
  ) as result(pid integer);
  perform extensions.dblink_send_query(
    'photo_cancel',
    $query$
      with claims as materialized (
        select
          set_config(
            'request.jwt.claim.sub',
            '44444444-4444-4444-8444-444444444444',
            false
          ),
          set_config(
            'request.jwt.claims',
            '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
            false
          )
      )
      select cancellation.deleted
      from claims
      cross join lateral public.cancel_own_family_photo(
        '44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      ) as cancellation
    $query$
  );

  for v_attempt in 1..500 loop
    exit when exists (
      select 1
      from pg_catalog.pg_locks
      where locktype = 'advisory'
        and not granted
        and pid = v_cancel_pid
    );
    perform pg_catalog.pg_sleep(0.01);
  end loop;
  if not exists (
    select 1
    from pg_catalog.pg_locks
    where locktype = 'advisory'
      and not granted
      and pid = v_cancel_pid
  ) then
    raise exception 'cancel did not wait for the in-flight Storage upload lock';
  end if;

  perform extensions.dblink_exec('photo_upload', 'commit');
end;
$$;

insert into photo_upload_cancel_result
select *
from extensions.dblink_get_result('photo_cancel') as result(deleted boolean);

select results_eq(
  $$select deleted from photo_upload_cancel_result$$,
  $$values (false)$$,
  'concurrent cancel waits for upload and cannot orphan the committed object'
);

select is(
  (
    select count(*)::integer
    from public.family_photo_items as photos
    join storage.objects as objects
      on objects.bucket_id = 'family-photos'
     and objects.name = photos.object_path
     and objects.owner_id = photos.user_id::text
    where photos.id = '44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and photos.status = 'pending'
  ),
  1,
  'upload and cancel race retains both quota metadata and its object'
);

do $$
begin
  perform 1
  from extensions.dblink_get_result('photo_cancel') as result(deleted boolean);
  perform extensions.dblink_exec('photo_cancel', 'reset role');
  perform extensions.dblink_exec(
    'photo_upload',
    $query$
      delete from storage.objects
      where bucket_id = 'family-photos'
        and name = '44444444-4444-4444-8444-444444444444/44444444-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp';
      delete from auth.users
      where id = '44444444-4444-4444-8444-444444444444'
    $query$
  );
  perform extensions.dblink_disconnect('photo_upload');
  perform extensions.dblink_disconnect('photo_cancel');
end;
$$;

select * from finish();
rollback;
