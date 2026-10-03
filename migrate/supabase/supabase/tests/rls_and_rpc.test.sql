begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-admin@test.invalid', 'test-only', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-student@test.invalid', 'test-only', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'rls-activated@test.invalid', 'test-only', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, username, role, group_id, active)
select '10000000-0000-4000-8000-000000000001', 'rls-admin', 'admin', null, true
union all
select '10000000-0000-4000-8000-000000000002', 'rls-student', 'student', id, true
from public.school_groups where group_name = '1A';

insert into public.subjects (name)
values ('RLS test subject')
on conflict (name) do nothing;

insert into public.schedule (group_id, day, subject_id)
select school_group.id, 'lunes', subject.id
from public.school_groups as school_group
cross join public.subjects as subject
where school_group.group_name in ('1A', '1B')
  and subject.name = 'RLS test subject'
on conflict (group_id, day, subject_id) do nothing;

insert into public.activation_codes (code_hash, group_id)
select repeat('a', 64), id
from public.school_groups
where group_name = '1A';

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
  'rls-second-activation@test.invalid', 'test-only', now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);
insert into public.activation_codes (code_hash, group_id)
select repeat('e', 64), id from public.school_groups where group_name = '1A';
insert into public.activation_codes (code_hash, group_id)
select repeat('f', 64), id from public.school_groups where group_name = '1A';

select ok(
  not has_table_privilege('anon', 'public.profiles', 'select'),
  'anonymous role has no direct profile-table access'
);
select ok(
  not has_function_privilege('anon', 'public.create_activation_code(text,bigint)', 'execute'),
  'anonymous role cannot execute the admin activation-code RPC'
);

set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000002';
set local role authenticated;
select is((select count(*)::integer from public.profiles), 1, 'student reads only own profile');
select is((select count(*)::integer from public.schedule
  where day = 'lunes' and subject_id = (select id from public.subjects where name = 'RLS test subject')),
  1, 'student reads own group schedule');
select is((select count(*)::integer from public.activation_codes), 0, 'student cannot read activation codes');
select throws_ok(
  $$select * from public.create_activation_code(repeat('b', 64), 1)$$,
  '42501', 'administrator_required', 'student cannot create an activation code'
);
select throws_ok(
  $$insert into public.schedule (group_id, day, subject_id)
    select school_group.id, 'martes', subject.id
    from public.school_groups as school_group cross join public.subjects as subject
    where school_group.group_name = '1A' and subject.name = 'RLS test subject'$$,
  '42501', null, 'student cannot write timetable rows'
);

reset role;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*)::integer from public.profiles), 2, 'admin reads all profiles');
select is((select count(*)::integer from public.schedule
  where day = 'lunes' and subject_id = (select id from public.subjects where name = 'RLS test subject')),
  2, 'admin reads schedules for all groups');
select lives_ok(
  $$select * from public.create_activation_code(repeat('d', 64), (select id from public.school_groups where group_name = '1A'))$$,
  'admin can create a hashed activation code'
);
select ok(
  not has_column_privilege('authenticated', 'public.activation_codes', 'code_hash', 'select'),
  'authenticated role cannot select stored code hashes'
);

reset role;
set local role service_role;
select lives_ok(
  $$select * from public.activate_student(repeat('e', 64), '10000000-0000-4000-8000-000000000004', 'activated-student')$$,
  'service-role activation claims code and creates profile'
);
reset role;
select is(
  (select count(*)::integer from public.activation_codes
   where code_hash = repeat('e', 64) and used_at is not null and user_id = '10000000-0000-4000-8000-000000000004'),
  1,
  'activation marks the code used and associates the profile'
);
select throws_ok(
  $$select * from public.activate_student(repeat('f', 64), '10000000-0000-4000-8000-000000000002', 'rls-student')$$,
  '23505', 'profile_already_exists', 'an existing profile cannot be activated again'
);
select is(
  (select count(*)::integer from public.activation_codes
   where code_hash = repeat('f', 64) and active and used_at is null and revoked_at is null),
  1,
  'failed activation leaves its code available'
);
set local role service_role;
select throws_ok(
  $$select * from public.activate_student(repeat('e', 64), '10000000-0000-4000-8000-000000000003', 'second-claim')$$,
  'P0002', 'activation_code_unavailable', 'a used code cannot be claimed twice'
);

select * from finish();
rollback;
