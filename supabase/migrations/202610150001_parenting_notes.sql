create table public.parenting_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null
    check (title = btrim(title))
    check (char_length(title) between 1 and 80),
  content text not null
    check (content = btrim(content))
    check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index parenting_notes_user_updated_idx
on public.parenting_notes (user_id, updated_at desc, id desc);

create table public.parenting_note_images (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null,
  user_id uuid not null default auth.uid(),
  status text not null default 'pending'
    check (status in ('pending', 'ready')),
  object_path text not null unique
    check (object_path = btrim(object_path))
    check (char_length(object_path) between 80 and 240)
    check (object_path like user_id::text || '/' || note_id::text || '/%'),
  mime_type text not null
    check (mime_type = 'image/webp'),
  width integer not null
    check (width between 1 and 1920),
  height integer not null
    check (height between 1 and 1920),
  byte_size bigint not null
    check (byte_size between 1 and 5242880),
  sort_order integer not null
    check (sort_order between 0 and 3),
  created_at timestamptz not null default now(),
  foreign key (note_id, user_id)
    references public.parenting_notes (id, user_id) on delete cascade,
  unique (note_id, sort_order)
);

create index parenting_note_images_note_order_idx
on public.parenting_note_images (note_id, sort_order, id);

create or replace function public.enforce_parenting_note_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 0)
  );
  if exists (
    select 1
    from public.parenting_notes as notes
    where notes.id = new.id
      and notes.user_id = new.user_id
  ) then
    return new;
  end if;
  if (
    select pg_catalog.count(*) >= 100
    from public.parenting_notes as notes
    where notes.user_id = new.user_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'parenting note limit exceeded';
  end if;
  return new;
end;
$$;

create or replace function public.touch_parenting_note_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create trigger enforce_parenting_note_limit_before_insert
before insert on public.parenting_notes
for each row execute function public.enforce_parenting_note_limit();

create trigger touch_parenting_note_before_update
before update on public.parenting_notes
for each row execute function public.touch_parenting_note_updated_at();

alter table public.parenting_notes enable row level security;
alter table public.parenting_notes force row level security;
alter table public.parenting_note_images enable row level security;
alter table public.parenting_note_images force row level security;

revoke all on table public.parenting_notes
from public, anon, authenticated, service_role;
revoke all on table public.parenting_note_images
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.parenting_notes
to authenticated;
grant select, insert, update, delete on table public.parenting_note_images
to authenticated;

create policy "Users can read their own parenting notes"
on public.parenting_notes
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create their own parenting notes"
on public.parenting_notes
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update their own parenting notes"
on public.parenting_notes
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete their own parenting notes"
on public.parenting_notes
for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can read their own parenting note images"
on public.parenting_note_images
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "Users can create their own parenting note images"
on public.parenting_note_images
for insert
to authenticated
with check (user_id = (select auth.uid()));

create policy "Users can update their own parenting note images"
on public.parenting_note_images
for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Users can delete their own parenting note images"
on public.parenting_note_images
for delete
to authenticated
using (user_id = (select auth.uid()));

create or replace function public.recover_own_parenting_note_images()
returns void
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('parenting-note-images:' || v_user_id::text, 0)
  );

  update public.parenting_note_images as images
  set status = 'ready'
  where images.user_id = v_user_id
    and images.status = 'pending'
    and exists (
      select 1
      from storage.objects as objects
      where objects.bucket_id = 'parenting-note-images'
        and objects.name = images.object_path
        and objects.owner_id = v_user_id::text
    );

  delete from public.parenting_note_images as images
  where images.user_id = v_user_id
    and not exists (
      select 1
      from storage.objects as objects
      where objects.bucket_id = 'parenting-note-images'
        and objects.name = images.object_path
        and objects.owner_id = v_user_id::text
    )
    and (
      images.status = 'ready'
      or images.created_at < pg_catalog.now() - interval '1 hour'
    );
end;
$$;

revoke all on function public.recover_own_parenting_note_images()
from public, anon, authenticated, service_role;
grant execute on function public.recover_own_parenting_note_images()
to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'parenting-note-images',
  'parenting-note-images',
  false,
  5242880,
  array['image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read their own parenting note objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'parenting-note-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);

create policy "Users can upload reserved parenting note objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'parenting-note-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
  and name ~ (
    '^' || (select auth.uid())::text
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  )
  and exists (
    select 1
    from public.parenting_note_images as images
    where images.user_id = (select auth.uid())
      and images.object_path = name
      and images.status = 'pending'
  )
);

create policy "Users can delete their own parenting note objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'parenting-note-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and owner_id = (select auth.uid())::text
);
