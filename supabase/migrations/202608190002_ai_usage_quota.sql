create table public.ai_request_usage (
  request_id uuid primary key,
  actor_hash text not null
    check (actor_hash ~ '^[0-9a-f]{64}$'),
  actor_type text not null
    check (actor_type in ('guest', 'user')),
  usage_date date not null default (timezone('utc', now()))::date,
  created_at timestamptz not null default now()
);

create index ai_request_usage_actor_day_idx
on public.ai_request_usage (actor_hash, usage_date);

create index ai_request_usage_date_idx
on public.ai_request_usage (usage_date);

alter table public.ai_request_usage enable row level security;
alter table public.ai_request_usage force row level security;

revoke all on table public.ai_request_usage
from public, anon, authenticated, service_role;
grant select, insert on table public.ai_request_usage to service_role;

create or replace function public.reserve_ai_request_quota(
  p_actor_hash text,
  p_actor_type text,
  p_request_id uuid,
  p_daily_limit integer
)
returns table (
  allowed boolean,
  duplicate boolean,
  daily_limit integer,
  remaining integer
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_usage_date date := (timezone('utc', now()))::date;
  v_existing_actor_hash text;
  v_usage_count integer;
begin
  if p_actor_hash is null or p_actor_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'actor_hash must be a 64 character lowercase hex digest';
  end if;
  if p_actor_type is null or p_actor_type not in ('guest', 'user') then
    raise exception using
      errcode = '22023',
      message = 'actor_type must be guest or user';
  end if;
  if p_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'request_id must not be null';
  end if;
  if p_daily_limit is null or p_daily_limit < 1 or p_daily_limit > 1000 then
    raise exception using
      errcode = '22023',
      message = 'daily_limit must be between 1 and 1000';
  end if;

  -- Request lock prevents two actors racing on the globally unique idempotency key.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
  );
  -- Actor/day lock keeps count + insert atomic across Edge Function instances.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_hash || ':' || v_usage_date::text, 0)
  );

  select usage.actor_hash
  into v_existing_actor_hash
  from public.ai_request_usage as usage
  where usage.request_id = p_request_id;

  select count(*)::integer
  into v_usage_count
  from public.ai_request_usage as usage
  where usage.actor_hash = p_actor_hash
    and usage.usage_date = v_usage_date;

  if v_existing_actor_hash is not null then
    return query select
      false,
      true,
      p_daily_limit,
      greatest(p_daily_limit - v_usage_count, 0);
    return;
  end if;

  if v_usage_count >= p_daily_limit then
    return query select false, false, p_daily_limit, 0;
    return;
  end if;

  insert into public.ai_request_usage (
    request_id,
    actor_hash,
    actor_type,
    usage_date
  )
  values (
    p_request_id,
    p_actor_hash,
    p_actor_type,
    v_usage_date
  );

  return query select
    true,
    false,
    p_daily_limit,
    p_daily_limit - v_usage_count - 1;
end;
$$;

revoke all on function public.reserve_ai_request_quota(
  text,
  text,
  uuid,
  integer
) from public, anon, authenticated, service_role;
grant execute on function public.reserve_ai_request_quota(
  text,
  text,
  uuid,
  integer
) to service_role;
