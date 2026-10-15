begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'parenting_notes', 'parenting notes table exists');
select has_table('public', 'parenting_note_images', 'parenting note image metadata table exists');

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = 'public.parenting_notes'::regclass
  ),
  'parenting notes enable and force RLS'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = 'public.parenting_note_images'::regclass
  ),
  'parenting note images enable and force RLS'
);

select is(
  (
    select count(*)::integer
    from storage.buckets
    where id = 'parenting-note-images'
      and public = false
      and file_size_limit = 5242880
      and allowed_mime_types = array['image/webp']::text[]
  ),
  1,
  'parenting note image bucket is private and WebP only'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like '%parenting note objects%'
  ),
  3,
  'parenting note Storage has select insert and delete policies'
);

select ok(
  not has_table_privilege('anon', 'public.parenting_notes', 'SELECT')
    and has_table_privilege('authenticated', 'public.parenting_notes', 'SELECT')
    and has_table_privilege('authenticated', 'public.parenting_notes', 'INSERT')
    and has_table_privilege('authenticated', 'public.parenting_notes', 'UPDATE')
    and has_table_privilege('authenticated', 'public.parenting_notes', 'DELETE'),
  'only authenticated users receive parenting note table privileges'
);

select ok(
  not has_function_privilege('anon', 'public.recover_own_parenting_note_images()', 'EXECUTE')
    and has_function_privilege(
      'authenticated',
      'public.recover_own_parenting_note_images()',
      'EXECUTE'
    ),
  'only authenticated users can recover interrupted note image uploads'
);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'notes-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'notes-b@example.test')
on conflict (id) do nothing;

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
    insert into public.parenting_notes (id, title, content)
    values (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'Parent A note',
      'Private content'
    )
  $$,
  'user A can create their own private note'
);

select lives_ok(
  $$
    insert into public.parenting_note_images (
      id,
      note_id,
      object_path,
      mime_type,
      width,
      height,
      byte_size,
      sort_order
    )
    values (
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
      'image/webp',
      1200,
      900,
      1024,
      0
    )
  $$,
  'user A can reserve image metadata for their own note'
);

select lives_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'parenting-note-images',
      '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp',
      '11111111-1111-4111-8111-111111111111'
    )
  $$,
  'user A can upload only a reserved note image object'
);

select public.recover_own_parenting_note_images();

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
  $$select count(*)::bigint from public.parenting_notes$$,
  $$values (0::bigint)$$,
  'user B cannot read user A notes'
);

select results_eq(
  $$select count(*)::bigint from public.parenting_note_images$$,
  $$values (0::bigint)$$,
  'user B cannot read user A note image metadata'
);

select results_eq(
  $$
    select count(*)::bigint
    from storage.objects
    where bucket_id = 'parenting-note-images'
  $$,
  $$values (0::bigint)$$,
  'user B cannot read user A private note objects'
);

select throws_ok(
  $$
    insert into public.parenting_notes (user_id, title, content)
    values (
      '11111111-1111-4111-8111-111111111111',
      'Forged note',
      'Not allowed'
    )
  $$,
  '42501',
  null::text,
  'user B cannot create a note for user A'
);

select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'parenting-note-images',
      '11111111-1111-4111-8111-111111111111/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp',
      '22222222-2222-4222-8222-222222222222'
    )
  $$,
  '42501',
  null::text,
  'user B cannot upload into user A note directory'
);

delete from public.parenting_notes
where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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
  $$select count(*)::bigint from public.parenting_notes$$,
  $$values (1::bigint)$$,
  'user B cannot delete user A note'
);

reset role;

select * from finish();
rollback;
