-- SAADAA NPD OS - Role hierarchy cleanup
-- Run AFTER SETUP.sql, SETUP-02-spec-sheet.sql, and SETUP-03-weekly-plan.sql.
--
-- Current app auth is email-only/localStorage-backed, not Supabase Auth.
-- Keep RLS disabled on app tables so the anon client can read/write through
-- the app, and enforce practical permissions in the UI.

-- 1. Make the app tables consistent with the existing no-RLS auth model.
alter table public.profiles             disable row level security;
alter table public.styles               disable row level security;
alter table public.inventory_rows       disable row level security;
alter table public.audit_log            disable row level security;
alter table public.style_measurements   disable row level security;
alter table public.weekly_plans         disable row level security;
alter table public.weekly_plan_fabrics  disable row level security;

-- 2. The app creates profile IDs directly, so profiles cannot depend on auth.users.
alter table public.profiles drop constraint if exists profiles_id_fkey;

-- 3. Storage writes must also work with the anon client.
drop policy if exists "spec_images_insert" on storage.objects;
drop policy if exists "spec_images_update" on storage.objects;
drop policy if exists "spec_images_delete" on storage.objects;

create policy "spec_images_insert" on storage.objects
  for insert with check (bucket_id = 'spec-images');

create policy "spec_images_update" on storage.objects
  for update using (bucket_id = 'spec-images');

create policy "spec_images_delete" on storage.objects
  for delete using (bucket_id = 'spec-images');

-- 4. Clear the old person-specific Sadiq flag; checker role now carries maker
-- access plus approval/date-editing power in the app.
alter table public.profiles
  add column if not exists is_sadiqji boolean not null default false;

update public.profiles
set is_sadiqji = false;

-- 5. Apply the current hierarchy.
-- Admin in the UI maps to the existing DB role "founder".
insert into public.profiles (id, email, full_name, role)
select gen_random_uuid(), v.email, v.full_name, v.role
from (values
  ('website@saadaa.in',    'Website',    'founder'),
  ('mahesh@saadaa.in',     'Mahesh',     'founder'),
  ('akshay@saadaa.in',     'Akshay',     'founder'),
  ('sadiq@saadaa.in',      'Sadiq',      'checker'),
  ('pushpendra@saadaa.in', 'Pushpendra', 'checker'),
  ('npd@saadaa.in',        'NPD',        'maker')
) as v(email, full_name, role)
where not exists (
  select 1 from public.profiles p where lower(p.email) = v.email
);

update public.profiles
set
  role = case lower(email)
    when 'website@saadaa.in'    then 'founder'
    when 'mahesh@saadaa.in'     then 'founder'
    when 'akshay@saadaa.in'     then 'founder'
    when 'sadiq@saadaa.in'      then 'checker'
    when 'pushpendra@saadaa.in' then 'checker'
    when 'npd@saadaa.in'        then 'maker'
    else 'viewer'
  end,
  full_name = case lower(email)
    when 'website@saadaa.in'    then 'Website'
    when 'mahesh@saadaa.in'     then 'Mahesh'
    when 'akshay@saadaa.in'     then 'Akshay'
    when 'sadiq@saadaa.in'      then 'Sadiq'
    when 'pushpendra@saadaa.in' then 'Pushpendra'
    when 'npd@saadaa.in'        then 'NPD'
    else full_name
  end;

-- Verify the hierarchy.
select email, full_name, role
from public.profiles
order by
  case role
    when 'founder' then 1
    when 'checker' then 2
    when 'maker' then 3
    else 4
  end,
  email;
