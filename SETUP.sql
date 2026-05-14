-- ═══════════════════════════════════════════════════════════════
-- SAADAA NPD OS — Complete Supabase Setup SQL
-- Run these blocks IN ORDER in Supabase → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════


-- ── BLOCK 1: TABLES ─────────────────────────────────────────────

-- Profiles (extends auth.users)
create table public.profiles (
  id         uuid references auth.users(id) on delete cascade primary key,
  full_name  text,
  email      text,
  role       text not null default 'viewer'
             check (role in ('founder','checker','maker','viewer')),
  created_at timestamptz default now()
);

-- Styles
create table public.styles (
  id               uuid default gen_random_uuid() primary key,
  name             text not null,
  style_code       text unique,
  priority         text check (priority in ('High','Medium','Low')),
  gender           text check (gender in ('Women','Men','Unisex')),
  category         text,
  fabric_platform  text check (fabric_platform in ('Woven','Knit','Denim','Terry/Fleece')),
  season           text,
  collection       text,
  silhouette       text,
  ref_link         text,
  brief            text,
  checker_notes    text,
  stage            text not null default 'Style Creation'
                   check (stage in ('Style Creation','Silhouette Approval','Fit Check','RFP','Inventory Planning')),
  approval_status  text not null default 'pending'
                   check (approval_status in ('pending','approved','rejected')),
  rejection_reason text,
  maker_id         uuid references public.profiles(id),
  checker_id       uuid references public.profiles(id),
  approved_at      timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- Inventory rows
create table public.inventory_rows (
  id              uuid default gen_random_uuid() primary key,
  style_id        uuid references public.styles(id) on delete cascade,
  colour          text,
  xs              integer default 0,
  s               integer default 0,
  m               integer default 0,
  l               integer default 0,
  xl              integer default 0,
  xxl             integer default 0,
  pcs_per_colour  integer default 0,
  cons_54         text,
  cons_56         text,
  buy_price       text,
  mrp             text,
  created_at      timestamptz default now()
);

-- Audit log
create table public.audit_log (
  id         uuid default gen_random_uuid() primary key,
  style_id   uuid references public.styles(id) on delete cascade,
  action     text not null,
  user_id    uuid references public.profiles(id),
  created_at timestamptz default now()
);


-- ── BLOCK 2: TRIGGERS ───────────────────────────────────────────

-- Auto-create profile on sign-up.
-- Domain gate: only @saadaa.in addresses are permitted. Raising here rolls
-- back the auth.users insert in the same transaction, so a non-@saadaa.in
-- account cannot be created via dashboard, API, or any future signup flow.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  if split_part(lower(new.email), '@', 2) <> 'saadaa.in' then
    raise exception 'Only @saadaa.in email addresses are allowed (got: %)', new.email
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'viewer')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-update updated_at on styles
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger styles_updated_at
  before update on public.styles
  for each row execute procedure update_updated_at();


-- ── BLOCK 3: ROW LEVEL SECURITY ─────────────────────────────────

alter table public.profiles       enable row level security;
alter table public.styles         enable row level security;
alter table public.inventory_rows enable row level security;
alter table public.audit_log      enable row level security;

-- Helper: get current user role
create or replace function get_my_role()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql security definer stable;

-- PROFILES
create policy "profiles_select_all"   on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update_own"   on public.profiles for update using (id = auth.uid());
create policy "profiles_update_admin" on public.profiles for update using (get_my_role() = 'founder');

-- STYLES: all authenticated users can read
create policy "styles_select"  on public.styles for select  using (auth.role() = 'authenticated');
-- Only founder and maker can create
create policy "styles_insert"  on public.styles for insert  with check (get_my_role() in ('founder','maker'));
-- Makers update own; checkers/founders update any (for approval fields)
create policy "styles_update"  on public.styles for update  using (
  get_my_role() = 'founder'
  or (get_my_role() = 'maker' and maker_id = auth.uid())
  or get_my_role() = 'checker'
);
-- Only founder can delete
create policy "styles_delete"  on public.styles for delete  using (get_my_role() = 'founder');

-- INVENTORY
create policy "inv_select" on public.inventory_rows for select using (auth.role() = 'authenticated');
create policy "inv_insert" on public.inventory_rows for insert with check (get_my_role() in ('founder','maker','checker'));
create policy "inv_update" on public.inventory_rows for update using  (get_my_role() in ('founder','maker','checker'));
create policy "inv_delete" on public.inventory_rows for delete using  (get_my_role() in ('founder','maker'));

-- AUDIT LOG
create policy "audit_select" on public.audit_log for select using (auth.role() = 'authenticated');
create policy "audit_insert" on public.audit_log for insert with check (auth.role() = 'authenticated');


-- ── BLOCK 4: CREATE YOUR FOUNDER ACCOUNT ────────────────────────
-- After running the above, go to:
-- Supabase → Authentication → Users → Add user
-- Email: devesh@saadaa.in  |  Password: (choose a strong one)
-- Then run this to set the founder role:

update public.profiles
set role = 'founder', full_name = 'Devesh'
where email = 'devesh@saadaa.in';


-- ── VERIFICATION QUERIES (run to confirm everything worked) ──────

-- Should show all 4 tables:
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;

-- Should show your profile with role = 'founder':
select id, full_name, email, role from public.profiles;
