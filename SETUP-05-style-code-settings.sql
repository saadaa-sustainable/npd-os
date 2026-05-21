-- ═══════════════════════════════════════════════════════════════
-- SAADAA NPD OS — Style Code Settings migration
-- Run AFTER SETUP.sql, SETUP-02-spec-sheet.sql, SETUP-03-weekly-plan.sql,
-- and SETUP-04-role-hierarchy.sql.
--
-- Style Code format (7 letters, no separators):
--   S + <gender:1> + <fabric:2> + <silhouette:1> + <suffix:AA-ZZ>
--   Example: SDCOSAA  →  Saadaa + Women(D) + Cotton(CO) + Shirt(S) + 1st of bucket
--
-- Data model — three tables:
--   • style_code_settings  → gender + silhouette codes (1 letter each)
--   • fibers               → reference library of textile fibers and their
--                            industry-standard codes (CO, LI, HE, CMD, …).
--                            Used in the Composition column on a fabric;
--                            NOT used directly in the style code.
--   • fabrics              → the actual fabric library used by the brand
--                            (POPLIN, COTTON FLAX 85/15, RAYON VISCOSE TWILL,
--                            …). Each has a 2-letter code (A–Z) for the
--                            style code, plus a free-text composition.
--
-- The trailing AA–ZZ suffix is unique PER (gender, fabric, silhouette)
-- bucket and is computed at save time by scanning existing
-- styles.style_code values (max 676 codes per bucket).
--
-- Only Admin (role='founder') can edit these rules — enforced in the UI,
-- consistent with the existing no-RLS auth model.
-- ═══════════════════════════════════════════════════════════════


-- ── BLOCK 0: Safe re-run — drop prior designs ──────────────────
drop table if exists public.style_code_counter cascade;
drop table if exists public.style_code_settings cascade;
drop table if exists public.fabrics cascade;
drop table if exists public.fibers  cascade;

-- The old styles.fabric_platform check restricted values to
-- ('Woven','Knit','Denim','Terry/Fleece'). The new model stores the
-- fabric name (POPLIN, COTTON FLAX 85/15, …) in that same column, so
-- we drop the constraint.
alter table public.styles drop constraint if exists styles_fabric_platform_check;


-- ── BLOCK 1: style_code_settings (gender + silhouette) ─────────
create table public.style_code_settings (
  id          uuid default gen_random_uuid() primary key,
  segment     text not null
              check (segment in ('gender','silhouette')),
  value       text not null,
  code        text not null
              check (char_length(code) = 1 and code ~ '^[A-Z]$'),
  sort_order  integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (segment, code)
);

alter table public.style_code_settings disable row level security;

create unique index style_code_settings_segment_value_idx
  on public.style_code_settings (segment, lower(value));

create index style_code_settings_segment_idx
  on public.style_code_settings (segment, sort_order, value);


-- ── BLOCK 2: fibers (reference library for compositions) ───────
create table public.fibers (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  code        text not null
              check (char_length(code) between 2 and 4 and code ~ '^[A-Z]+$'),
  sort_order  integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.fibers disable row level security;

create unique index fibers_name_idx on public.fibers (lower(name));
create unique index fibers_code_idx on public.fibers (code);


-- ── BLOCK 3: fabrics (used in the style code) ──────────────────
-- `code` is NULLABLE so admin can seed historical fabric names and
-- assign codes later via the Style Code Settings UI. Fabrics with a
-- NULL code are visible in the settings list but NOT selectable in
-- New Style (since they can't generate a style code).
create table public.fabrics (
  id           uuid default gen_random_uuid() primary key,
  name         text not null,
  composition  text,
  code         text
               check (code is null or (char_length(code) = 2 and code ~ '^[A-Z]{2}$')),
  sort_order   integer default 0,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.fabrics disable row level security;

create unique index fabrics_name_idx on public.fabrics (lower(name));
create unique index fabrics_code_idx on public.fabrics (code) where code is not null;


-- ── BLOCK 4: Seed — Gender (fixed by spec) ─────────────────────
insert into public.style_code_settings (segment, value, code, sort_order) values
  ('gender', 'Women',  'D', 1),
  ('gender', 'Men',    'M', 2),
  ('gender', 'Unisex', 'U', 3);

-- Silhouette — empty; admin defines via UI.


-- ── BLOCK 5: Seed — Fibers (industry-standard codes) ───────────
insert into public.fibers (name, code, sort_order) values
  ('Cotton',             'CO',  1),
  ('Flax / Linen',       'LI',  2),
  ('Hemp',               'HE',  3),
  ('Viscose Rayon',      'CV',  4),
  ('Modal',              'CMD', 5),
  ('Lyocell',            'CLY', 6),
  ('Cupro',              'CUP', 7),
  ('Nylon',              'PA',  8),
  ('Elastane / Spandex', 'EL',  9);


-- ── BLOCK 6: Seed — Fabrics from historical data (codes blank) ─
-- Deduplicated from the historical FABRIC_NAME / FABRIC_COMPOSITION
-- usage log. Admin assigns 2-letter codes via the Style Code Settings
-- UI before these fabrics can be selected for new styles.
insert into public.fabrics (name, composition, sort_order) values
  ('Rayon Viscose Twill',   '100% Viscose',                                1),
  ('100% Cotton 20s',       '100% Cotton',                                 2),
  ('100% Cotton',           '100% Cotton',                                 3),
  ('100% Cotton Flat Knit', '100% Cotton',                                 4),
  ('100% Linen',            '100% Linen',                                  5),
  ('11LC',                  '55% Linen 45% Cotton',                        6),
  ('Cotton 60s Cambric',    '100% Cotton 60s Cambric',                     7),
  ('Cotton Flax (85/15)',   '85% Combed Cotton 15% Linen',                 8),
  ('CS Lycra',              '4% Lycra, 71% Cotton, 25% Polyester',         9),
  ('Interlock Knit',        '100% Cotton',                                10),
  ('Linen Blend',           '55% Linen 45% Cotton',                       11),
  ('Oscar Satin Lycra',     '98% Cotton & 2% Elastane',                   12),
  ('Pique Knit',            '100% Cotton',                                13),
  ('Poplin',                '100% Cotton',                                14),
  ('Single Jersey Knit',    '100% Cotton',                                15),
  ('Tencel',                '67% Viscose, 27% Nylon, 6% Spandex',         16),
  ('Triblend',              '65% Cotton 25% Excel 10% Linen',             17),
  ('Viscose Linen Blend',   '51% Viscose 38% Cotton 11% Linen',           18),
  ('Cotton Fleece (Top/Inner)',
   'Top Surface - 100% Cotton & Inner Fleece - 60% Cotton 40% Poly',      19);


-- ── Verify ─────────────────────────────────────────────────────
select segment, value, code, sort_order
  from public.style_code_settings
  order by segment, sort_order, value;

select name, code, sort_order
  from public.fibers
  order by sort_order, name;

select name, code, composition, sort_order
  from public.fabrics
  order by sort_order, name;
