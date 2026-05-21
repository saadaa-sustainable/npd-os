-- ═══════════════════════════════════════════════════════════════
-- SAADAA NPD OS — Style Code Settings migration
-- Run AFTER SETUP.sql, SETUP-02-spec-sheet.sql, SETUP-03-weekly-plan.sql,
-- and SETUP-04-role-hierarchy.sql.
--
-- Style Code format (6 letters, no separators):
--   S + <gender:1> + <fabric:1> + <silhouette:1> + <suffix:AA-ZZ>
--   Example: SDCSAA  →  Saadaa + Women(D) + Cotton(C) + Shirt(S) + 1st of bucket
--
-- The suffix is unique PER (gender, fabric, silhouette) bucket and is
-- derived at save time by looking at existing styles in the same bucket
-- (max 676 codes per bucket).
--
-- Only Admin (role='founder') can edit these rules — enforced in the UI,
-- consistent with the existing no-RLS auth model.
-- ═══════════════════════════════════════════════════════════════


-- ── BLOCK 0: Safe re-run — drop the prior 5-segment design ─────
-- An earlier version of this migration used 5 segments + a global
-- counter table. The new design uses 3 segments + per-bucket suffix.
drop table if exists public.style_code_counter cascade;
drop table if exists public.style_code_settings cascade;


-- ── BLOCK 1: Rule table ────────────────────────────────────────
create table public.style_code_settings (
  id          uuid default gen_random_uuid() primary key,
  segment     text not null
              check (segment in ('gender','fabric','silhouette')),
  value       text not null,           -- long-form label shown in dropdowns
  code        text not null            -- short code used inside the style code
              check (char_length(code) = 1 and code ~ '^[A-Z]$'),
  sort_order  integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (segment, code)
);

alter table public.style_code_settings disable row level security;

-- Case-insensitive uniqueness on the long-form label per segment.
-- (Function expressions aren't allowed inside an inline UNIQUE constraint,
-- so this is a separate unique index.)
create unique index style_code_settings_segment_value_idx
  on public.style_code_settings (segment, lower(value));

create index style_code_settings_segment_idx
  on public.style_code_settings (segment, sort_order, value);


-- ── BLOCK 2: Seed defaults ─────────────────────────────────────
-- Gender — fixed by the spec (D=Women, M=Men, U=Unisex). The admin
-- can rename the long-form label but should not change the codes.
insert into public.style_code_settings (segment, value, code, sort_order) values
  ('gender', 'Women',  'D', 1),
  ('gender', 'Men',    'M', 2),
  ('gender', 'Unisex', 'U', 3);

-- Fabric — starter set. Admin can add/edit/delete in the UI.
insert into public.style_code_settings (segment, value, code, sort_order) values
  ('fabric', 'Cotton',       'C', 1),
  ('fabric', 'Linen',        'L', 2),
  ('fabric', 'Denim',        'D', 3),
  ('fabric', 'Knit',         'K', 4),
  ('fabric', 'Woven',        'W', 5),
  ('fabric', 'Terry/Fleece', 'T', 6);

-- Silhouette — empty; admin defines these per product line.


-- ── Verify ─────────────────────────────────────────────────────
select segment, value, code, sort_order
from public.style_code_settings
order by
  case segment
    when 'gender'     then 1
    when 'fabric'     then 2
    when 'silhouette' then 3
  end,
  sort_order, value;
