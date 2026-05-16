-- ═══════════════════════════════════════════════════════════════
-- SAADAA NPD OS — Migration 02: Spec Sheet (Tab 1 — Measurement Sheet)
-- Run AFTER SETUP.sql, in Supabase → SQL Editor.
-- ═══════════════════════════════════════════════════════════════


-- ── BLOCK 1: EXTEND styles TABLE ────────────────────────────────

alter table public.styles
  add column if not exists product_description text,
  add column if not exists product_attribute   text,
  add column if not exists fabrication         text,
  add column if not exists trimmings           text,
  add column if not exists washcare            text,
  add column if not exists base_size           text,
  add column if not exists style_tag           text,      -- CASUAL / FORMAL / SPORT etc.
  add column if not exists front_image_url     text,
  add column if not exists back_image_url      text,
  add column if not exists sizes               jsonb default '[]'::jsonb;
  -- sizes shape: [{"label":"XS","code":"28"}, {"label":"S","code":"30"}, ...]


-- ── BLOCK 2: style_measurements TABLE ───────────────────────────

create table if not exists public.style_measurements (
  id           uuid default gen_random_uuid() primary key,
  style_id     uuid not null references public.styles(id) on delete cascade,
  sort_order   integer not null default 0,
  label        text not null,
  hindi_label  text,                       -- for tailor-facing Hindi view
  tolerance    text,                       -- "0.25", "0.5", "-", or null
  values       jsonb not null default '{}'::jsonb,
  -- values shape, keyed by size label: {"XS": 45.75, "S": 46, ...}
  created_at   timestamptz default now()
);

create index if not exists style_measurements_style_id_idx
  on public.style_measurements (style_id, sort_order);


-- ── BLOCK 3: RLS for style_measurements ─────────────────────────

alter table public.style_measurements enable row level security;

create policy "meas_select" on public.style_measurements
  for select using (auth.role() = 'authenticated');

create policy "meas_insert" on public.style_measurements
  for insert with check (get_my_role() in ('founder','maker','checker'));

create policy "meas_update" on public.style_measurements
  for update using  (get_my_role() in ('founder','maker','checker'));

create policy "meas_delete" on public.style_measurements
  for delete using  (get_my_role() in ('founder','maker'));


-- ── BLOCK 4: spec-images STORAGE BUCKET ─────────────────────────
-- Run this in Supabase → Storage if you prefer the UI. Or via SQL:

insert into storage.buckets (id, name, public)
values ('spec-images', 'spec-images', true)
on conflict (id) do nothing;

-- Public read (so <img src=...> works without signed URLs).
-- Authenticated users can write/delete their uploads.
create policy "spec_images_read"
  on storage.objects for select
  using (bucket_id = 'spec-images');

create policy "spec_images_insert"
  on storage.objects for insert
  with check (bucket_id = 'spec-images' and auth.role() = 'authenticated');

create policy "spec_images_update"
  on storage.objects for update
  using (bucket_id = 'spec-images' and auth.role() = 'authenticated');

create policy "spec_images_delete"
  on storage.objects for delete
  using (bucket_id = 'spec-images' and auth.role() = 'authenticated');


-- ── VERIFICATION ────────────────────────────────────────────────

-- New columns present?
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'styles'
  and column_name in (
    'product_description','product_attribute','fabrication','trimmings',
    'washcare','base_size','style_tag','front_image_url','back_image_url','sizes'
  )
order by column_name;

-- style_measurements table present?
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'style_measurements';

-- Bucket present?
select id, name, public from storage.buckets where id = 'spec-images';
