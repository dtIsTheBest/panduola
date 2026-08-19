begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(28);

select has_table(
  'public',
  'ai_request_usage',
  'ai_request_usage table exists'
);

select columns_are(
  'public',
  'ai_request_usage',
  array[
    'request_id',
    'actor_hash',
    'actor_type',
    'usage_date',
    'created_at'
  ],
  'usage table contains only quota metadata'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = 'public.ai_request_usage'::regclass
  ),
  'RLS is enabled and forced'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'ai_request_usage'
  ),
  0,
  'quota table has no client policies'
);

select has_index(
  'public',
  'ai_request_usage',
  'ai_request_usage_actor_day_idx',
  'actor/day lookup index exists'
);

select has_index(
  'public',
  'ai_request_usage',
  'ai_request_usage_date_idx',
  'usage date cleanup index exists'
);

select ok(
  (
    select not prosecdef
    from pg_catalog.pg_proc
    where oid = (
      'public.reserve_ai_request_quota'
      || '(text,text,uuid,integer)'
    )::regprocedure
  ),
  'quota function is SECURITY INVOKER'
);

select ok(
  not has_table_privilege('anon', 'public.ai_request_usage', 'SELECT')
    and not has_table_privilege('anon', 'public.ai_request_usage', 'INSERT')
    and not has_table_privilege('anon', 'public.ai_request_usage', 'UPDATE')
    and not has_table_privilege('anon', 'public.ai_request_usage', 'DELETE')
    and not has_table_privilege('anon', 'public.ai_request_usage', 'TRUNCATE')
    and not has_table_privilege('authenticated', 'public.ai_request_usage', 'SELECT')
    and not has_table_privilege('authenticated', 'public.ai_request_usage', 'INSERT')
    and not has_table_privilege('authenticated', 'public.ai_request_usage', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.ai_request_usage', 'DELETE')
    and not has_table_privilege('authenticated', 'public.ai_request_usage', 'TRUNCATE'),
  'browser roles cannot read or write quota rows'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.reserve_ai_request_quota(text,text,uuid,integer)',
    'EXECUTE'
  ) and not has_function_privilege(
    'authenticated',
    'public.reserve_ai_request_quota(text,text,uuid,integer)',
    'EXECUTE'
  ),
  'browser roles cannot execute quota RPC'
);

select ok(
  has_table_privilege('service_role', 'public.ai_request_usage', 'SELECT')
    and has_table_privilege('service_role', 'public.ai_request_usage', 'INSERT')
    and not has_table_privilege('service_role', 'public.ai_request_usage', 'UPDATE')
    and not has_table_privilege('service_role', 'public.ai_request_usage', 'DELETE')
    and not has_table_privilege('service_role', 'public.ai_request_usage', 'TRUNCATE')
    and not has_table_privilege('service_role', 'public.ai_request_usage', 'REFERENCES')
    and not has_table_privilege('service_role', 'public.ai_request_usage', 'TRIGGER')
    and has_function_privilege(
      'service_role',
      'public.reserve_ai_request_quota(text,text,uuid,integer)',
      'EXECUTE'
    ),
  'service role has the minimal quota surface'
);

set local role service_role;

select throws_ok(
  $$
    select * from public.reserve_ai_request_quota(
      'INVALID',
      'guest',
      '00000000-0000-4000-8000-000000000001',
      2
    )
  $$,
  '22023',
  'actor_hash must be a 64 character lowercase hex digest',
  'invalid actor hash is rejected'
);

select throws_ok(
  $$
    select * from public.reserve_ai_request_quota(
      repeat('a', 64),
      'admin',
      '00000000-0000-4000-8000-000000000001',
      2
    )
  $$,
  '22023',
  'actor_type must be guest or user',
  'invalid actor type is rejected'
);

select throws_ok(
  $$
    select * from public.reserve_ai_request_quota(
      repeat('a', 64),
      'guest',
      '00000000-0000-4000-8000-000000000001',
      0
    )
  $$,
  '22023',
  'daily_limit must be between 1 and 1000',
  'zero daily limit is rejected'
);

select results_eq(
  $$
    select allowed, duplicate, daily_limit, remaining
    from public.reserve_ai_request_quota(
      repeat('a', 64),
      'guest',
      '00000000-0000-4000-8000-000000000001',
      2
    )
  $$,
  $$values (true, false, 2, 1)$$,
  'first request consumes one quota unit'
);

select results_eq(
  $$
    select allowed, duplicate, daily_limit, remaining
    from public.reserve_ai_request_quota(
      repeat('a', 64),
      'guest',
      '00000000-0000-4000-8000-000000000001',
      2
    )
  $$,
  $$values (false, true, 2, 1)$$,
  'same request id is rejected without another charge'
);

select results_eq(
  $$
    select allowed, duplicate, daily_limit, remaining
    from public.reserve_ai_request_quota(
      repeat('a', 64),
      'guest',
      '00000000-0000-4000-8000-000000000002',
      2
    )
  $$,
  $$values (true, false, 2, 0)$$,
  'request at the limit consumes the last unit'
);

select results_eq(
  $$
    select allowed, duplicate, daily_limit, remaining
    from public.reserve_ai_request_quota(
      repeat('a', 64),
      'guest',
      '00000000-0000-4000-8000-000000000003',
      2
    )
  $$,
  $$values (false, false, 2, 0)$$,
  'request above the limit is rejected'
);

select results_eq(
  $$
    select allowed, duplicate, daily_limit, remaining
    from public.reserve_ai_request_quota(
      repeat('b', 64),
      'user',
      '00000000-0000-4000-8000-000000000001',
      20
    )
  $$,
  $$values (false, true, 20, 20)$$,
  'another actor cannot reuse an existing request id'
);

select results_eq(
  $$
    select allowed, duplicate, daily_limit, remaining
    from public.reserve_ai_request_quota(
      repeat('b', 64),
      'user',
      '00000000-0000-4000-8000-000000000004',
      20
    )
  $$,
  $$values (true, false, 20, 19)$$,
  'another actor receives an independent quota bucket'
);

select is(
  (
    select count(*)::integer
    from public.ai_request_usage
    where actor_hash = repeat('a', 64)
  ),
  2,
  'duplicate and rejected requests create no extra rows'
);

select is(
  (
    select count(*)::integer
    from public.ai_request_usage
    where actor_hash = repeat('b', 64)
  ),
  1,
  'second actor stores only its successful reservation'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'ai_request_usage'
      and column_name in (
        'question',
        'answer',
        'email',
        'ip',
        'user_id'
      )
  ),
  0,
  'quota table stores no prompt, answer, email, IP, or user id'
);

reset role;

create temporary table ai_concurrent_context (
  context_key text primary key,
  context_value text not null
) on commit drop;

insert into ai_concurrent_context (context_key, context_value)
values
  (
    'limit_actor',
    md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text)
  ),
  (
    'request_actor_left',
    md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text)
  ),
  (
    'request_actor_right',
    md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text)
  ),
  ('shared_request_id', gen_random_uuid()::text);

create temporary table ai_concurrent_results (
  allowed boolean,
  duplicate boolean,
  daily_limit integer,
  remaining integer
) on commit drop;

create temporary table ai_request_race_results (
  allowed boolean,
  duplicate boolean,
  daily_limit integer,
  remaining integer
) on commit drop;

do $$
declare
  v_connection_string text :=
    'host=host.docker.internal port=54322 '
    || 'dbname=postgres user=postgres password=postgres';
  v_actor_hash text;
  v_connection_name text;
  v_request_id uuid;
begin
  select context_value
  into v_actor_hash
  from ai_concurrent_context
  where context_key = 'limit_actor';

  perform pg_catalog.pg_advisory_lock(900000001::bigint);
  for v_index in 1..4 loop
    v_connection_name := 'ai_quota_' || v_index;
    v_request_id := gen_random_uuid();
    perform extensions.dblink_connect(v_connection_name, v_connection_string);
    perform extensions.dblink_send_query(
      v_connection_name,
      format(
        $query$
          with gate as materialized (
            select pg_catalog.pg_advisory_xact_lock(900000001::bigint)
          )
          select quota.allowed, quota.duplicate, quota.daily_limit, quota.remaining
          from gate
          cross join lateral public.reserve_ai_request_quota(
            %L,
            'guest',
            %L::uuid,
            2
          ) as quota
        $query$,
        v_actor_hash,
        v_request_id
      )
    );
  end loop;

  for v_attempt in 1..500 loop
    exit when (
      select count(*)
      from pg_catalog.pg_locks
      where locktype = 'advisory'
        and not granted
    ) >= 4;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
  if (
    select count(*)
    from pg_catalog.pg_locks
    where locktype = 'advisory'
      and not granted
  ) < 4 then
    raise exception 'concurrent quota queries did not reach the start gate';
  end if;
  perform pg_catalog.pg_advisory_unlock(900000001::bigint);
end;
$$;

insert into ai_concurrent_results
select *
from extensions.dblink_get_result('ai_quota_1') as result(
  allowed boolean,
  duplicate boolean,
  daily_limit integer,
  remaining integer
);
insert into ai_concurrent_results
select *
from extensions.dblink_get_result('ai_quota_2') as result(
  allowed boolean,
  duplicate boolean,
  daily_limit integer,
  remaining integer
);
insert into ai_concurrent_results
select *
from extensions.dblink_get_result('ai_quota_3') as result(
  allowed boolean,
  duplicate boolean,
  daily_limit integer,
  remaining integer
);
insert into ai_concurrent_results
select *
from extensions.dblink_get_result('ai_quota_4') as result(
  allowed boolean,
  duplicate boolean,
  daily_limit integer,
  remaining integer
);

do $$
begin
  for v_index in 1..4 loop
    perform 1
    from extensions.dblink_get_result('ai_quota_' || v_index) as result(
      allowed boolean,
      duplicate boolean,
      daily_limit integer,
      remaining integer
    );
  end loop;
end;
$$;

select is(
  (
    select count(*)::integer
    from ai_concurrent_results
    where allowed
  ),
  2,
  'four concurrent reservations cannot exceed limit two'
);

select is(
  (
    select count(*)::integer
    from public.ai_request_usage
    where actor_hash = (
      select context_value
      from ai_concurrent_context
      where context_key = 'limit_actor'
    )
  ),
  2,
  'concurrent reservations persist exactly the allowed count'
);

select set_eq(
  $$
    select remaining
    from ai_concurrent_results
    where allowed
  $$,
  $$values (0), (1)$$,
  'serialized winners receive distinct remaining values'
);

do $$
declare
  v_connection_string text :=
    'host=host.docker.internal port=54322 '
    || 'dbname=postgres user=postgres password=postgres';
  v_actor_left text;
  v_actor_right text;
  v_request_id uuid;
begin
  select context_value
  into v_actor_left
  from ai_concurrent_context
  where context_key = 'request_actor_left';
  select context_value
  into v_actor_right
  from ai_concurrent_context
  where context_key = 'request_actor_right';
  select context_value::uuid
  into v_request_id
  from ai_concurrent_context
  where context_key = 'shared_request_id';

  perform pg_catalog.pg_advisory_lock(900000002::bigint);
  perform extensions.dblink_connect('ai_request_1', v_connection_string);
  perform extensions.dblink_connect('ai_request_2', v_connection_string);
  perform extensions.dblink_send_query(
    'ai_request_1',
    format(
      $query$
        with gate as materialized (
          select pg_catalog.pg_advisory_xact_lock(900000002::bigint)
        )
        select quota.allowed, quota.duplicate, quota.daily_limit, quota.remaining
        from gate
        cross join lateral public.reserve_ai_request_quota(
          %L,
          'guest',
          %L::uuid,
          2
        ) as quota
      $query$,
      v_actor_left,
      v_request_id
    )
  );
  perform extensions.dblink_send_query(
    'ai_request_2',
    format(
      $query$
        with gate as materialized (
          select pg_catalog.pg_advisory_xact_lock(900000002::bigint)
        )
        select quota.allowed, quota.duplicate, quota.daily_limit, quota.remaining
        from gate
        cross join lateral public.reserve_ai_request_quota(
          %L,
          'guest',
          %L::uuid,
          2
        ) as quota
      $query$,
      v_actor_right,
      v_request_id
    )
  );

  for v_attempt in 1..500 loop
    exit when (
      select count(*)
      from pg_catalog.pg_locks
      where locktype = 'advisory'
        and not granted
    ) >= 2;
    perform pg_catalog.pg_sleep(0.01);
  end loop;
  if (
    select count(*)
    from pg_catalog.pg_locks
    where locktype = 'advisory'
      and not granted
  ) < 2 then
    raise exception 'request id race did not reach the start gate';
  end if;
  perform pg_catalog.pg_advisory_unlock(900000002::bigint);
end;
$$;

insert into ai_request_race_results
select *
from extensions.dblink_get_result('ai_request_1') as result(
  allowed boolean,
  duplicate boolean,
  daily_limit integer,
  remaining integer
);
insert into ai_request_race_results
select *
from extensions.dblink_get_result('ai_request_2') as result(
  allowed boolean,
  duplicate boolean,
  daily_limit integer,
  remaining integer
);

do $$
begin
  perform 1
  from extensions.dblink_get_result('ai_request_1') as result(
    allowed boolean,
    duplicate boolean,
    daily_limit integer,
    remaining integer
  );
  perform 1
  from extensions.dblink_get_result('ai_request_2') as result(
    allowed boolean,
    duplicate boolean,
    daily_limit integer,
    remaining integer
  );
end;
$$;

select is(
  (
    select count(*)::integer
    from ai_request_race_results
    where allowed
  ),
  1,
  'two actors racing on one request id produce one winner'
);

select is(
  (
    select count(*)::integer
    from ai_request_race_results
    where duplicate
  ),
  1,
  'request id loser receives a duplicate result instead of a unique error'
);

select is(
  (
    select count(*)::integer
    from public.ai_request_usage
    where actor_hash in (
      select context_value
      from ai_concurrent_context
      where context_key in ('request_actor_left', 'request_actor_right')
    )
  ),
  1,
  'shared request id race persists exactly one row'
);

do $$
declare
  v_actor_hashes text;
begin
  select string_agg(quote_literal(context_value), ',')
  into v_actor_hashes
  from ai_concurrent_context
  where context_key <> 'shared_request_id';
  perform extensions.dblink_exec(
    'ai_quota_1',
    'delete from public.ai_request_usage where actor_hash in ('
      || v_actor_hashes
      || ')'
  );
  for v_index in 1..4 loop
    perform extensions.dblink_disconnect('ai_quota_' || v_index);
  end loop;
  perform extensions.dblink_disconnect('ai_request_1');
  perform extensions.dblink_disconnect('ai_request_2');
end;
$$;

select * from finish();
rollback;
