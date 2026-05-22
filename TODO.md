# TODO — Style Code Generator Rewrite (max 5–7 chars, schema-driven)

## Step 1 — Capture current legacy behavior
- [x] Reviewed existing admin rules UI: `app/admin/style-code-settings/page.js`
- [x] Reviewed generator + decoder-adjacent logic: `lib/supabase.js` (composeStyleCodeSegments + generateNextStyleCode)
- [x] Reviewed style creation flow: `app/styles/new/page.js` (loads rules + uses generateNextStyleCode on save)
- [x] Reviewed DB migration: `SETUP-05-style-code-settings.sql`

## Step 2 — Implement new “style code schema” (data + API)
- [ ] Add new Supabase/DB-backed helpers in `lib/supabase.js`:
  - [ ] `getStyleCodeSchema()` / `getStyleCodeTables()` (lookup tables + rows)
  - [ ] `generateStyleCodeFromSchema({ selections })` (max 5–6 chars, mostly letters)
  - [ ] `decodeStyleCode({ style_code })` (position-by-position explanation for checker/viewer)
- [ ] Keep legacy generator working until full cutover (older styles decodeable).

## Step 3 — Database migration for schema tables + versioning
- [ ] Create/adjust migration script(s):
  - [ ] New tables for schema + lookup tables + lookup rows
  - [ ] Add version field on `styles` (or a stable mapping approach) so decode works after edits
- [ ] Decide whether to drop the old `style_code_settings` system or keep it for legacy decode.

## Step 4 — Rewrite Admin UI (“Excel-like rules”)
- [ ] Replace current fixed cards (Gender/Silhouette/Fabric) with:
  - [ ] Schema positions editor (N positions, type per position)
  - [ ] Lookup tables editor (rows: semantic values mapped to code characters)
  - [ ] (Optional) counter position editor (alphabet + uniqueness strategy)
- [ ] Ensure maker-friendly UX with clear column labels and validation (A–Z/0–9)

## Step 5 — Rewrite Maker “New Style” flow
- [ ] Load schema + lookup tables
- [ ] Replace gender/silhouette/fabric dropdowns with schema-driven selectors
- [ ] Generate preview position-by-position
- [ ] On save, call `generateStyleCodeFromSchema()` and enforce length <= 6

## Step 6 — Checker/Viewer deep understanding
- [ ] Update pages where style_code is displayed to show decoded explanation:
  - [ ] approvals / styles list / style detail modal (whichever exists)
- [ ] Add a lightweight “Decode” tooltip/modal using `decodeStyleCode()`

## Step 7 — Cutover + verification
- [ ] Run migrations
- [ ] Validate:
  - [ ] Code always length 5–6
  - [ ] Codes mostly letters (digits only if configured)
  - [ ] Uniqueness/collision avoidance works for counter positions
  - [ ] Decoder output matches generator for old + new styles

## Step 8 — Cleanup
- [ ] Remove dead legacy code paths only after successful migration
