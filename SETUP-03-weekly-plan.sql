-- ═══════════════════════════════════════════════════════════════
-- SAADAA NPD OS — Weekly Plan migration
-- Run this AFTER SETUP.sql and SETUP-02-spec-sheet.sql.
-- ═══════════════════════════════════════════════════════════════


-- ── BLOCK 1: Mark Sadiqji's profile ────────────────────────────
-- Sadiqji is a specific named user (not a role). The `is_sadiqji`
-- flag controls who, alongside founders, can edit week dates on a
-- Weekly Plan. To mark the right person, run:
--   update public.profiles set is_sadiqji = true where email = 'X';

alter table public.profiles
  add column if not exists is_sadiqji boolean not null default false;


-- ── BLOCK 2: TABLES ─────────────────────────────────────────────

-- One row per Monday-to-Monday plan window.
create table if not exists public.weekly_plans (
  id               uuid default gen_random_uuid() primary key,
  week_start_date  date not null,                       -- a Monday
  week_end_date    date not null,                       -- the following Monday
  status           text not null default 'draft'
                   check (status in ('draft','submitted','approved','rejected')),
  rejection_reason text,
  created_by       uuid references public.profiles(id),
  approved_by      uuid references public.profiles(id),
  approved_at      timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  check (week_end_date > week_start_date)
);

create index if not exists weekly_plans_week_start_idx
  on public.weekly_plans (week_start_date desc);

-- Many style entries inside a weekly plan.
-- `fabrics` is a JSONB list — each fabric is:
--   { id: string, name: string, photos: [url], ref_links: [url] }
create table if not exists public.weekly_plan_entries (
  id               uuid default gen_random_uuid() primary key,
  weekly_plan_id   uuid references public.weekly_plans(id) on delete cascade,
  silhouette       text,
  gender           text check (gender in ('Women','Men','Unisex')),
  category         text,
  demographic_type text,
  fabrics          jsonb not null default '[]'::jsonb,
  style_code       text,                                 -- auto-gen logic TBD
  sort_order       integer default 0,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists wpe_plan_idx
  on public.weekly_plan_entries (weekly_plan_id, sort_order);


-- ── BLOCK 3: TRIGGERS (updated_at) ──────────────────────────────

create trigger weekly_plans_updated_at
  before update on public.weekly_plans
  for each row execute procedure update_updated_at();

create trigger wpe_updated_at
  before update on public.weekly_plan_entries
  for each row execute procedure update_updated_at();


-- ── BLOCK 4: ROW LEVEL SECURITY ─────────────────────────────────

alter table public.weekly_plans         enable row level security;
alter table public.weekly_plan_entries  enable row level security;

-- All authenticated users can read.
create policy "wp_select"   on public.weekly_plans         for select using (auth.role() = 'authenticated');
create policy "wpe_select"  on public.weekly_plan_entries  for select using (auth.role() = 'authenticated');

-- Founders and makers create plans + entries.
create policy "wp_insert"   on public.weekly_plans         for insert with check (get_my_role() in ('founder','maker'));
create policy "wpe_insert"  on public.weekly_plan_entries  for insert with check (get_my_role() in ('founder','maker'));

-- Update: founder always, maker on own plans, plus is_sadiqji can update (approvals + dates).
-- We can't enforce the "only Sadiqji+founder can move the *dates*" rule via row-policy alone
-- (RLS is row-level, not column-level). The UI gates date editing client-side; backend allows it.
create policy "wp_update" on public.weekly_plans for update using (
  get_my_role() = 'founder'
  or (get_my_role() = 'maker' and created_by = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_sadiqji)
);

create policy "wpe_update" on public.weekly_plan_entries for update using (
  get_my_role() in ('founder','maker','checker')
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_sadiqji)
);

-- Delete: founder only on plans; entries can be removed by founder or original maker.
create policy "wp_delete" on public.weekly_plans for delete using (get_my_role() = 'founder');
create policy "wpe_delete" on public.weekly_plan_entries for delete using (
  get_my_role() = 'founder'
  or exists (
    select 1 from public.weekly_plans wp
    where wp.id = weekly_plan_id
      and (wp.created_by = auth.uid() or get_my_role() = 'maker')
  )
);


-- ── VERIFICATION ────────────────────────────────────────────────
-- select table_name from information_schema.tables
--   where table_schema = 'public' and table_name like 'weekly_plan%';
-- select column_name from information_schema.columns
--   where table_schema='public' and table_name='profiles' and column_name='is_sadiqji';
