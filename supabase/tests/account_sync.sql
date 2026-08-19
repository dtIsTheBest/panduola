begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

select has_table(
  'public',
  'user_snapshots',
  'user_snapshots table exists'
);

select ok(
  (
    select count(*) = 1
    from pg_constraint
    where conrelid = 'public.user_snapshots'::regclass
      and contype = 'p'
  ),
  'user_snapshots has one primary key'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'public.user_snapshots'::regclass
  ),
  'RLS is enabled and forced'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_snapshots'
  ),
  3,
  'SELECT, INSERT, and UPDATE have separate policies'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_snapshots'
      and cmd = 'DELETE'
  ),
  0,
  'DELETE has no policy'
);

select ok(
  (
    select not prosecdef
    from pg_proc
    where oid = (
      'public.compare_and_swap_user_snapshot'
      || '(bigint,integer,jsonb,text,uuid)'
    )::regprocedure
  ),
  'CAS function is SECURITY INVOKER'
);

select ok(
  (
    select position(
      'user_id' in pg_get_function_identity_arguments(oid)
    ) = 0
    from pg_proc
    where oid = (
      'public.compare_and_swap_user_snapshot'
      || '(bigint,integer,jsonb,text,uuid)'
    )::regprocedure
  ),
  'CAS function does not accept user_id'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.compare_and_swap_user_snapshot(bigint,integer,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'authenticated can execute CAS'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.compare_and_swap_user_snapshot(bigint,integer,jsonb,text,uuid)',
    'EXECUTE'
  ),
  'anon cannot execute CAS'
);

select ok(
  has_table_privilege('authenticated', 'public.user_snapshots', 'SELECT')
    and has_table_privilege('authenticated', 'public.user_snapshots', 'INSERT')
    and has_table_privilege('authenticated', 'public.user_snapshots', 'UPDATE'),
  'authenticated has only the required write surface'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.user_snapshots',
    'DELETE'
  ),
  'authenticated cannot delete snapshots'
);

insert into auth.users (id, email)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'parent-a@example.test'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'parent-b@example.test'
  );

insert into public.user_snapshots (
  user_id,
  schema_version,
  payload,
  payload_hash,
  updated_by_device
)
values (
  '22222222-2222-4222-8222-222222222222',
  2,
  '{"schemaVersion":2,"categories":[],"links":[]}'::jsonb,
  repeat('b', 64),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select * from public.user_snapshots$$,
  '42501',
  null::text,
  'anon cannot read snapshots'
);

select throws_ok(
  $$
    insert into public.user_snapshots (
      schema_version,
      payload,
      payload_hash,
      updated_by_device
    )
    values (
      2,
      '{"schemaVersion":2,"categories":[],"links":[]}'::jsonb,
      repeat('c', 64),
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    )
  $$,
  '42501',
  null::text,
  'anon cannot create snapshots'
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

select lives_ok(
  $$
    insert into public.user_snapshots (
      schema_version,
      payload,
      payload_hash,
      updated_by_device
    )
    values (
      2,
      '{"schemaVersion":2,"categories":[],"links":[]}'::jsonb,
      repeat('a', 64),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  $$,
  'user A can create their own snapshot'
);

select results_eq(
  $$select user_id from public.user_snapshots order by user_id$$,
  $$
    values (
      '11111111-1111-4111-8111-111111111111'::uuid
    )
  $$,
  'user A can only read their own snapshot'
);

select throws_ok(
  $$
    insert into public.user_snapshots (
      user_id,
      schema_version,
      payload,
      payload_hash,
      updated_by_device
    )
    values (
      '22222222-2222-4222-8222-222222222222',
      2,
      '{"schemaVersion":2,"categories":[],"links":[]}'::jsonb,
      repeat('d', 64),
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    )
  $$,
  '42501',
  null::text,
  'user A cannot insert a snapshot for user B'
);

select results_eq(
  $$
    update public.user_snapshots
    set payload_hash = repeat('e', 64)
    where user_id = '22222222-2222-4222-8222-222222222222'
    returning user_id
  $$,
  $$select null::uuid where false$$,
  'user A cannot update user B'
);

select throws_ok(
  $$
    delete from public.user_snapshots
    where user_id = '11111111-1111-4111-8111-111111111111'
  $$,
  '42501',
  null::text,
  'user A cannot delete their snapshot'
);

select results_eq(
  $$
    select succeeded, revision
    from public.compare_and_swap_user_snapshot(
      1,
      2,
      '{"schemaVersion":2,"categories":[],"links":[{"id":"first"}]}'::jsonb,
      repeat('f', 64),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  $$,
  $$values (true, 2::bigint)$$,
  'CAS succeeds with the expected revision'
);

select results_eq(
  $$
    select succeeded, revision, payload_hash
    from public.compare_and_swap_user_snapshot(
      1,
      2,
      '{"schemaVersion":2,"categories":[],"links":[{"id":"stale"}]}'::jsonb,
      repeat('0', 64),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  $$,
  $$values (false, null::bigint, null::text)$$,
  'a second CAS with the stale revision reports conflict'
);

select results_eq(
  $$
    select revision, payload_hash, payload->'links'->0->>'id'
    from public.user_snapshots
  $$,
  $$values (2::bigint, repeat('f', 64), 'first'::text)$$,
  'the stale CAS does not overwrite the winning snapshot'
);

select throws_ok(
  $$
    select *
    from public.compare_and_swap_user_snapshot(
      2,
      2,
      '{"schemaVersion":2,"categories":[],"links":[]}'::jsonb,
      'invalid-hash',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  $$,
  '23514',
  null::text,
  'invalid payload hashes are rejected'
);

select results_eq(
  $$select revision, payload_hash from public.user_snapshots$$,
  $$values (2::bigint, repeat('f', 64))$$,
  'failed CAS leaves the current snapshot unchanged'
);

select throws_ok(
  $$
    insert into public.user_snapshots (
      schema_version,
      payload,
      payload_hash,
      updated_by_device
    )
    values (
      2,
      '{"schemaVersion":2,"categories":[],"links":[]}'::jsonb,
      repeat('1', 64),
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    )
  $$,
  '23505',
  null::text,
  'creating a second snapshot for the same user loses the race'
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
  $$select user_id from public.user_snapshots order by user_id$$,
  $$
    values (
      '22222222-2222-4222-8222-222222222222'::uuid
    )
  $$,
  'user B can only read their own snapshot'
);

select results_eq(
  $$
    update public.user_snapshots
    set payload_hash = repeat('2', 64)
    where user_id = '11111111-1111-4111-8111-111111111111'
    returning user_id
  $$,
  $$select null::uuid where false$$,
  'user B cannot update user A'
);

select results_eq(
  $$
    select succeeded, revision
    from public.compare_and_swap_user_snapshot(
      0,
      2,
      '{"schemaVersion":2,"categories":[],"links":[]}'::jsonb,
      repeat('3', 64),
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    )
  $$,
  $$values (false, null::bigint)$$,
  'zero expected revision is a non-destructive conflict'
);

select * from finish();
rollback;
