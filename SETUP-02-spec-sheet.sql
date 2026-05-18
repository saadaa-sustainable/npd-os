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
  add column if not exists ref_image_urls      text[] default '{}',
  add column if not exists sizes               jsonb default '[]'::jsonb,
  -- sizes shape: [{"label":"XS","code":"28"}, {"label":"S","code":"30"}, ...]

  -- Specification Sheet (Tab 2) ──────────────────────────────────
  add column if not exists construction_rows   jsonb default '[]'::jsonb,
  -- [{component, description}, ...]
  add column if not exists spi                 jsonb default '{}'::jsonb,
  -- {seams: "24 - 26", stitches: "26 - 28"}
  add column if not exists label_placement     jsonb default '{}'::jsonb,
  -- {main, size, washcare, vendor_code}  (each a description string)
  add column if not exists fabric_specs        jsonb default '{}'::jsonb,
  -- {fabric, fabric_note, preferred_mill, gsm, dye}
  add column if not exists trim_rows           jsonb default '[]'::jsonb,
  -- [{component, type, supplier, code, size, color, quantity}, ...]

  -- Spec Sheet 1 (detail photos) ─────────────────────────────────
  add column if not exists detail_blocks       jsonb default '[]'::jsonb;
  -- [{left_label, left_image_url, description, right_label, right_image_url}, ...]


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

drop policy if exists "meas_select" on public.style_measurements;
drop policy if exists "meas_insert" on public.style_measurements;
drop policy if exists "meas_update" on public.style_measurements;
drop policy if exists "meas_delete" on public.style_measurements;

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
drop policy if exists "spec_images_read"   on storage.objects;
drop policy if exists "spec_images_insert" on storage.objects;
drop policy if exists "spec_images_update" on storage.objects;
drop policy if exists "spec_images_delete" on storage.objects;

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
    'washcare','base_size','style_tag',
    'front_image_url','back_image_url','ref_image_urls','sizes',
    'construction_rows','spi','label_placement','fabric_specs','trim_rows',
    'detail_blocks'
  )
order by column_name;

-- style_measurements table present?
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'style_measurements';

-- Bucket present?
select id, name, public from storage.buckets where id = 'spec-images';
