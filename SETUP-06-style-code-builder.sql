-- ═══════════════════════════════════════════════════════════════
-- SAADAA NPD OS — Style Code Builder migration
-- Run AFTER SETUP.sql, SETUP-02, SETUP-03, SETUP-04, SETUP-05.
--
-- This REPLACES the gender/silhouette code logic from SETUP-05.
-- (Fibers + Fabrics tables from SETUP-05 are kept — they're a separate
-- concern for the spec-sheet composition library.)
--
-- New model: ONE flat table that an admin builds row-by-row in an
-- Excel-style UI. Each row defines either:
--   • a fixed character in the code (e.g. Brand = "SAADAA" → "S")
--   • one option for a variable segment (e.g. Gender → "Women"=D, "Men"=M)
--   • the auto-incrementing uniqueness suffix (group "Sequence", is_sequence=true)
--
-- Rows are grouped by the `group_name` column. A group with one row is
-- a fixed segment; a group with N rows is a variable segment where the
-- maker picks one. The order of segments in the final code is the order
-- in which each group first appears (by `position`).
-- ═══════════════════════════════════════════════════════════════


-- ── BLOCK 0: Safe re-run ───────────────────────────────────────
-- Drop the prior gender/silhouette rules table. Fibers + Fabrics stay.
drop table if exists public.style_code_settings cascade;
drop table if exists public.style_code_builder  cascade;


-- ── BLOCK 1: Builder table ─────────────────────────────────────
create table public.style_code_builder (
  id           uuid default gen_random_uuid() primary key,
  position     integer not null,                       -- sort order across all rows
  group_name   text not null,                          -- e.g. "Brand", "Gender", "Fabric"
  letters      integer not null check (letters between 1 and 6),
  field        text not null,                          -- value label shown to maker
                                                       -- ("SAADAA", "Women", "Cotton", "(auto)")
  code         text not null,                          -- letters that go into the style code
                                                       -- ("S", "D", "CO", "AA-ZZ")
  is_sequence  boolean not null default false,         -- true for the auto-incrementing suffix
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.style_code_builder disable row level security;

create unique index style_code_builder_position_idx
  on public.style_code_builder (position);

-- Within a group, each "field" must be unique (so two rows can't both
-- map "Women" to different codes). Codes within a group must also be
-- unique (so D can only mean one thing per group).
create unique index style_code_builder_group_field_idx
  on public.style_code_builder (group_name, lower(field));

create unique index style_code_builder_group_code_idx
  on public.style_code_builder (group_name, code);


-- ── BLOCK 2: Seed — equivalent of the previous SDCSAA system ───
-- Brand(1) + Gender(1) + Fabric(2) + Silhouette(1) + Sequence(2) = 7 letters.
-- Admin can edit any row, add more values per group, or add entirely
-- new groups (e.g. Color, Season) via the Style Code Settings UI.
insert into public.style_code_builder
  (position, group_name, letters, field, code, is_sequence) values
  (1,  'Brand',      1, 'SAADAA', 'S', false),

  (2,  'Gender',     1, 'Women',  'D', false),
  (3,  'Gender',     1, 'Men',    'M', false),
  (4,  'Gender',     1, 'Unisex', 'U', false),

  (5,  'Fabric',     2, 'Cotton',       'CO', false),
  (6,  'Fabric',     2, 'Linen',        'LI', false),
  (7,  'Fabric',     2, 'Denim',        'DN', false),
  (8,  'Fabric',     2, 'Knit',         'KN', false),
  (9,  'Fabric',     2, 'Woven',        'WV', false),
  (10, 'Fabric',     2, 'Terry/Fleece', 'TF', false),

  -- Silhouettes — empty by default; admin defines per product line.
  -- (no rows seeded)

  (99, 'Sequence',   2, '(auto)', 'AA-ZZ', true);


-- ── Verify ─────────────────────────────────────────────────────
select position, group_name, letters, field, code, is_sequence
  from public.style_code_builder
  order by position;
