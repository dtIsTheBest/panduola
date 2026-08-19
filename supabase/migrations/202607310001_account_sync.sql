create table public.user_snapshots (
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  schema_version integer not null
    check (schema_version > 0),
  payload jsonb not null
    check (jsonb_typeof(payload) = 'object')
    -- The client enforces the exact 2 MiB canonical JSON contract. This
    -- independent guard limits the stored jsonb value without rendering text.
    check (pg_column_size(payload) <= 4194304),
  payload_hash text not null
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  revision bigint not null default 1
    check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by_device uuid not null,
  created_at timestamptz not null default now(),
  check (updated_at >= created_at)
);

alter table public.user_snapshots enable row level security;
alter table public.user_snapshots force row level security;

create policy "Authenticated users can read their own snapshot"
on public.user_snapshots
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Authenticated users can create their own snapshot"
on public.user_snapshots
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Authenticated users can update their own snapshot"
on public.user_snapshots
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.user_snapshots from public, anon, authenticated;
grant select, insert, update on table public.user_snapshots to authenticated;

create or replace function public.compare_and_swap_user_snapshot(
  expected_revision bigint,
  new_schema_version integer,
  new_payload jsonb,
  new_payload_hash text,
  new_updated_by_device uuid
)
returns table (
  succeeded boolean,
  revision bigint,
  payload_hash text,
  updated_at timestamptz,
  updated_by_device uuid
)
language sql
volatile
security invoker
set search_path = ''
as $$
  with updated_snapshot as (
    update public.user_snapshots
    set
      schema_version = new_schema_version,
      payload = new_payload,
      payload_hash = new_payload_hash,
      revision = public.user_snapshots.revision + 1,
      updated_at = now(),
      updated_by_device = new_updated_by_device
    where user_id = (select auth.uid())
      and public.user_snapshots.revision = expected_revision
    returning
      true as succeeded,
      public.user_snapshots.revision,
      public.user_snapshots.payload_hash,
      public.user_snapshots.updated_at,
      public.user_snapshots.updated_by_device
  )
  select * from updated_snapshot
  union all
  select
    false,
    null::bigint,
    null::text,
    null::timestamptz,
    null::uuid
  where not exists (select 1 from updated_snapshot)
  limit 1;
$$;

revoke all on function public.compare_and_swap_user_snapshot(
  bigint,
  integer,
  jsonb,
  text,
  uuid
) from public, anon, authenticated;
grant execute on function public.compare_and_swap_user_snapshot(
  bigint,
  integer,
  jsonb,
  text,
  uuid
) to authenticated;
