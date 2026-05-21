-- ═══════════════════════════════════════════════════════════════
-- SAADAA NPD OS — Weekly Plan migration
-- Run this AFTER SETUP.sql and SETUP-02-spec-sheet.sql.
-- Hierarchy:  weekly_plan (Mon→Mon)  →  fabrics[]  →  items[] (silhouette/gender/category/demographic)
-- ═══════════════════════════════════════════════════════════════


-- ── BLOCK 0: Drop the old entries-first design (safe re-run) ───
-- The earlier version of this migration had silhouette/gender/category
-- on a `weekly_plan_entries` table with fabrics nested inside. The
-- correct model is the opposite: fabric is the parent, styles are
-- many items per fabric.
drop table if exists public.weekly_plan_entries cascade;


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

-- Fabric is the major unit (a fabric purchase / material identifier).
-- It contains many "items" — one per style cut from this fabric.
-- Reference photos and reference links live PER ITEM (each cut/style
-- has its own visual references), not on the fabric itself.
--
-- `items`: jsonb array of
--   { id, silhouette, gender, category, demographic_type,
--     photos:[url], ref_links:[url], style_code? }
create table if not exists public.weekly_plan_fabrics (
  id              uuid default gen_random_uuid() primary key,
  weekly_plan_id  uuid references public.weekly_plans(id) on delete cascade,
  name            text,
  items           jsonb not null default '[]'::jsonb,
  sort_order      integer default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- If the table was created by an earlier version of this migration with
-- photos/ref_links columns on the fabric, drop them — they live in items now.
alter table public.weekly_plan_fabrics drop column if exists photos;
alter table public.weekly_plan_fabrics drop column if exists ref_links;

create index if not exists wpf_plan_idx
  on public.weekly_plan_fabrics (weekly_plan_id, sort_order);


-- ── BLOCK 3: TRIGGERS (updated_at) ──────────────────────────────

-- Drop pre-existing triggers from earlier migration runs so the
-- file re-runs cleanly.
drop trigger if exists weekly_plans_updated_at on public.weekly_plans;
drop trigger if exists wpf_updated_at          on public.weekly_plan_fabrics;

create trigger weekly_plans_updated_at
  before update on public.weekly_plans
  for each row execute procedure update_updated_at();

create trigger wpf_updated_at
  before update on public.weekly_plan_fabrics
  for each row execute procedure update_updated_at();


-- ── BLOCK 4: ROW LEVEL SECURITY ─────────────────────────────────

alter table public.weekly_plans          enable row level security;
alter table public.weekly_plan_fabrics   enable row level security;

-- Drop pre-existing policies so the file re-runs cleanly.
drop policy if exists "wp_select"   on public.weekly_plans;
drop policy if exists "wp_insert"   on public.weekly_plans;
drop policy if exists "wp_update"   on public.weekly_plans;
drop policy if exists "wp_delete"   on public.weekly_plans;
drop policy if exists "wpf_select"  on public.weekly_plan_fabrics;
drop policy if exists "wpf_insert"  on public.weekly_plan_fabrics;
drop policy if exists "wpf_update"  on public.weekly_plan_fabrics;
drop policy if exists "wpf_delete"  on public.weekly_plan_fabrics;

-- All authenticated users can read.
create policy "wp_select"   on public.weekly_plans          for select using (auth.role() = 'authenticated');
create policy "wpf_select"  on public.weekly_plan_fabrics   for select using (auth.role() = 'authenticated');

-- Founders and makers create plans + fabrics.
create policy "wp_insert"   on public.weekly_plans          for insert with check (get_my_role() in ('founder','maker'));
create policy "wpf_insert"  on public.weekly_plan_fabrics   for insert with check (get_my_role() in ('founder','maker'));

-- Update: founder always, maker on own plans, plus is_sadiqji can update (approvals + dates).
-- RLS is row-level, not column-level — the UI client-side gates date editing to founders+Sadiqji.
create policy "wp_update" on public.weekly_plans for update using (
  get_my_role() = 'founder'
  or (get_my_role() = 'maker' and created_by = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_sadiqji)
);

create policy "wpf_update" on public.weekly_plan_fabrics for update using (
  get_my_role() in ('founder','maker','checker')
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_sadiqji)
);

-- Delete.
create policy "wp_delete"  on public.weekly_plans          for delete using (get_my_role() = 'founder');
create policy "wpf_delete" on public.weekly_plan_fabrics   for delete using (
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
