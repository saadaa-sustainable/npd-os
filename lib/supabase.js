import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Copy .env.local.example → .env.local, fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart `npm run dev`.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

// ── Auth helpers (no Supabase Auth — email-only, localStorage-backed) ──

export const ALLOWED_EMAIL_DOMAIN = 'saadaa.in'
const SESSION_KEY = 'saadaa.session'

export function isAllowedEmail(email) {
  return typeof email === 'string' && email.trim().toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)
}

function deriveName(email) {
  return email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Looks up profile by email; creates one with role='viewer' if it doesn't exist.
// Returns the profile row.
export async function signInWithEmail(rawEmail) {
  const email = rawEmail.trim().toLowerCase()
  if (!isAllowedEmail(email)) {
    throw new Error(`Only @${ALLOWED_EMAIL_DOMAIN} email addresses can sign in.`)
  }

  const { data: existing, error: selErr } = await supabase
    .from('profiles')
    .select('*')
    .ilike('email', email)
    .maybeSingle()
  if (selErr) throw selErr

  let profile = existing
  if (!profile) {
    const { data: created, error: insErr } = await supabase
      .from('profiles')
      .insert([{ id: crypto.randomUUID(), email, full_name: deriveName(email), role: 'viewer' }])
      .select()
      .single()
    if (insErr) throw insErr
    profile = created
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id: profile.id, email: profile.email }))
  }
  return profile
}

export async function signOut() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(SESSION_KEY)
}

export function getStoredSession() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// Re-reads the profile from DB for the stored session (so role changes propagate on refresh).
export async function getCurrentUser() {
  const stored = getStoredSession()
  if (!stored?.id) return null
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', stored.id)
    .maybeSingle()
  if (!data) {
    if (typeof window !== 'undefined') window.localStorage.removeItem(SESSION_KEY)
    return null
  }
  return data
}

// Legacy export kept for callers (login page useEffect): truthy if there's a stored session.
export async function getSession() {
  return getStoredSession()
}

// ── Profile ───────────────────────────────────────────────────

export async function getAllUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at')
  if (error) throw error
  return data
}

export async function updateUserRole(userId, role) {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)
  if (error) throw error
}

// ── Styles ────────────────────────────────────────────────────

export async function getStyles(filters = {}) {
  let q = supabase
    .from('styles')
    .select('*, maker:profiles!styles_maker_id_fkey(full_name, email)')
    .order('created_at', { ascending: false })

  if (filters.stage)           q = q.eq('stage', filters.stage)
  if (filters.gender)          q = q.eq('gender', filters.gender)
  if (filters.fabric_platform) q = q.eq('fabric_platform', filters.fabric_platform)
  if (filters.priority)        q = q.eq('priority', filters.priority)
  if (filters.approval_status) q = q.eq('approval_status', filters.approval_status)
  if (filters.search)          q = q.ilike('name', `%${filters.search}%`)

  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getStyle(id) {
  const { data, error } = await supabase
    .from('styles')
    .select(`
      *,
      maker:profiles!styles_maker_id_fkey(full_name, email),
      checker:profiles!styles_checker_id_fkey(full_name)
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createStyle(payload) {
  const { data, error } = await supabase
    .from('styles')
    .insert([payload])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateStyle(id, payload) {
  const { data, error } = await supabase
    .from('styles')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteStyle(id) {
  const { error } = await supabase.from('styles').delete().eq('id', id)
  if (error) throw error
}

// ── Stage advancement ─────────────────────────────────────────

const STAGE_PROGRESSION = {
  'Style Creation':      'Silhouette Approval',
  'Silhouette Approval': 'Fit Check',
  'Fit Check':           'RFP',
  'RFP':                 'Inventory Planning',
}

export async function approveStyle(id, checkerId) {
  const style = await getStyle(id)
  const nextStage = STAGE_PROGRESSION[style.stage] ?? style.stage
  const updated = await updateStyle(id, {
    approval_status: 'approved',
    checker_id: checkerId,
    approved_at: new Date().toISOString(),
    stage: nextStage,
  })
  await addAuditLog(id, `Approved at "${style.stage}" → moved to "${nextStage}"`, checkerId)
  return updated
}

export async function rejectStyle(id, checkerId, reason) {
  const updated = await updateStyle(id, {
    approval_status: 'rejected',
    checker_id: checkerId,
    rejection_reason: reason || null,
  })
  await addAuditLog(id, `Rejected: ${reason || 'No reason given'}`, checkerId)
  return updated
}

// ── Inventory ─────────────────────────────────────────────────

export async function getInventoryRows(styleId) {
  const { data, error } = await supabase
    .from('inventory_rows')
    .select('*')
    .eq('style_id', styleId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function upsertInventoryRow(row) {
  const { data, error } = await supabase
    .from('inventory_rows')
    .upsert(row)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteInventoryRow(id) {
  const { error } = await supabase.from('inventory_rows').delete().eq('id', id)
  if (error) throw error
}

// ── Spec sheet: measurements ──────────────────────────────────

export async function getMeasurements(styleId) {
  const { data, error } = await supabase
    .from('style_measurements')
    .select('*')
    .eq('style_id', styleId)
    .order('sort_order')
  if (error) throw error
  return data
}

// Replace all measurement rows for a style. Simple + safe for a form save:
// delete existing, insert new. Called after createStyle/updateStyle.
export async function replaceMeasurements(styleId, rows) {
  const { error: delErr } = await supabase
    .from('style_measurements')
    .delete()
    .eq('style_id', styleId)
  if (delErr) throw delErr

  if (!rows?.length) return []

  const payload = rows.map((r, i) => ({
    style_id:    styleId,
    sort_order:  i,
    label:       r.label,
    hindi_label: r.hindi_label || null,
    tolerance:   r.tolerance || null,
    values:      r.values || {},
  }))

  const { data, error } = await supabase
    .from('style_measurements')
    .insert(payload)
    .select()
  if (error) throw error
  return data
}

// ── Spec sheet: image uploads (Supabase Storage) ──────────────

const SPEC_BUCKET = 'spec-images'

// Client-only: resize a File to a max long-edge dim and re-encode as JPEG.
// Returns a new File. Browser only — relies on createImageBitmap + canvas.
export async function compressImage(file, { maxDim = 1600, quality = 0.85 } = {}) {
  if (!file?.type?.startsWith('image/')) return file
  const bitmap = await createImageBitmap(file)
  let { width, height } = bitmap
  if (Math.max(width, height) > maxDim) {
    if (width >= height) { height = Math.round(height * maxDim / width); width = maxDim }
    else                 { width  = Math.round(width  * maxDim / height); height = maxDim }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality))
  if (!blob) return file
  const base = file.name.replace(/\.[^.]+$/, '') || 'image'
  return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
}

// Uploads a File (after compression) to spec-images/<styleKey>/<prefix>-<timestamp>.jpg
// Returns the public URL. `prefix` is just a filename hint (e.g. 'front', 'back', 'ref').
export async function uploadSpecImage(file, styleKey, prefix) {
  if (!file) return null
  const compressed = await compressImage(file)
  const path = `${styleKey || 'unsaved'}/${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}.jpg`

  const { error: upErr } = await supabase
    .storage
    .from(SPEC_BUCKET)
    .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
  if (upErr) throw upErr

  const { data } = supabase.storage.from(SPEC_BUCKET).getPublicUrl(path)
  return data.publicUrl
}

// ── Weekly Plan ───────────────────────────────────────────────

export function canEditWeeklyPlanDates(user) {
  if (!user) return false
  return ['founder','checker'].includes(user.role)
}

export function isSadiqji(user) {
  return user?.role === 'checker'
}

// Mon-of-week for any given date (timezone-local).
export function getMondayOf(date = new Date()) {
  const d = new Date(date)
  const day = d.getDay()            // 0 = Sun … 6 = Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

// YYYY-MM-DD in local time (avoids the UTC-offset off-by-one from toISOString).
export function toISODate(d) {
  if (!d) return ''
  const x = d instanceof Date ? d : new Date(d)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function getWeeklyPlans() {
  const { data, error } = await supabase
    .from('weekly_plans')
    .select(`
      *,
      creator:profiles!weekly_plans_created_by_fkey(full_name, email),
      approver:profiles!weekly_plans_approved_by_fkey(full_name)
    `)
    .order('week_start_date', { ascending: false })
  if (error) throw error
  return data
}

export async function getWeeklyPlan(id) {
  const { data, error } = await supabase
    .from('weekly_plans')
    .select(`
      *,
      creator:profiles!weekly_plans_created_by_fkey(full_name, email),
      approver:profiles!weekly_plans_approved_by_fkey(full_name)
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createWeeklyPlan(payload) {
  const { data, error } = await supabase
    .from('weekly_plans')
    .insert([payload])
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateWeeklyPlan(id, payload) {
  const { data, error } = await supabase
    .from('weekly_plans')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteWeeklyPlan(id) {
  const { error } = await supabase.from('weekly_plans').delete().eq('id', id)
  if (error) throw error
}

// Fabric is the major unit. Each fabric carries shared reference
// photos + ref links AND many items (silhouette/gender/category/
// demographic) since one fabric purchase typically yields multiple
// styles. Items live in a JSONB column on the fabric row.
export async function getWeeklyPlanFabrics(planId) {
  const { data, error } = await supabase
    .from('weekly_plan_fabrics')
    .select('*')
    .eq('weekly_plan_id', planId)
    .order('sort_order')
    .order('created_at')
  if (error) throw error
  return data
}

export async function upsertWeeklyPlanFabric(row) {
  const payload = { ...row, updated_at: new Date().toISOString() }
  if (!payload.id) delete payload.id
  const { data, error } = await supabase
    .from('weekly_plan_fabrics')
    .upsert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteWeeklyPlanFabric(id) {
  const { error } = await supabase.from('weekly_plan_fabrics').delete().eq('id', id)
  if (error) throw error
}

// Uploads a File to spec-images/weekly-plan-<planId>/<fabricKey>-<itemKey>-<ts>.jpg.
// Reuses the existing `spec-images` bucket + compressImage pipeline.
export async function uploadWeeklyPlanImage(file, planId, fabricKey, itemKey) {
  if (!file) return null
  const compressed = await compressImage(file)
  const path = `weekly-plan-${planId || 'unsaved'}/${fabricKey || 'fabric'}-${itemKey || 'item'}-${Date.now()}-${Math.random().toString(36).slice(2,7)}.jpg`

  const { error: upErr } = await supabase
    .storage
    .from(SPEC_BUCKET)
    .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
  if (upErr) throw upErr

  const { data } = supabase.storage.from(SPEC_BUCKET).getPublicUrl(path)
  return data.publicUrl
}


// ── Audit log ─────────────────────────────────────────────────

export async function addAuditLog(styleId, action, userId) {
  await supabase
    .from('audit_log')
    .insert([{ style_id: styleId, action, user_id: userId }])
}

export async function getAuditLog(styleId) {
  const { data } = await supabase
    .from('audit_log')
    .select('*, profiles(full_name)')
    .eq('style_id', styleId)
    .order('created_at', { ascending: false })
  return data || []
}

// ── Stats (for founder dashboard) ────────────────────────────

export async function getDashboardStats() {
  const [stylesRes, pendingRes] = await Promise.all([
    supabase.from('styles').select('stage, approval_status, season, gender, created_at'),
    supabase.from('styles').select('id').eq('approval_status', 'pending'),
  ])

  const styles = stylesRes.data || []
  const STAGES = ['Style Creation','Silhouette Approval','Fit Check','RFP','Inventory Planning']
  const stageCounts = {}
  STAGES.forEach(s => stageCounts[s] = 0)

  const seasonCounts = {}
  const genderCounts = { Women: 0, Men: 0, Unisex: 0 }
  const monthlyActivity = {}

  styles.forEach(s => {
    if (stageCounts[s.stage] !== undefined) stageCounts[s.stage]++
    if (s.season) seasonCounts[s.season] = (seasonCounts[s.season] || 0) + 1
    if (s.gender) genderCounts[s.gender] = (genderCounts[s.gender] || 0) + 1
    if (s.created_at) {
      const month = s.created_at.slice(0, 7)
      monthlyActivity[month] = (monthlyActivity[month] || 0) + 1
    }
  })

  return {
    total: styles.length,
    pending: (pendingRes.data || []).length,
    stageCounts,
    seasonCounts,
    genderCounts,
    monthlyActivity,
  }
}

// ── Style code generator ──────────────────────────────────────
//
// Style codes are 7 letters, no separators:
//   S + <gender:1> + <fabric:2> + <silhouette:1> + <suffix:AA-ZZ>
//   Example: SDCOSAA -> Saadaa + Women(D) + Cotton(CO) + Shirt(S) + 1st in bucket
//
// Rules for gender/fabric/silhouette are admin-managed in the
// `style_code_settings` table (see SETUP-05). The 2-letter suffix is
// unique per (gender, fabric, silhouette) bucket — 676 codes per bucket.
//
// `generateStyleCode(name)` (legacy, name-based) is kept as a no-op
// stub for any old callers; the real code is produced by
// `generateNextStyleCode(...)` on save.

export const STYLE_CODE_SEGMENTS = ['gender','silhouette']
export const STYLE_CODE_PREFIX   = 'S'
export const STYLE_CODE_LENGTH   = 7

export function generateStyleCode(_name) {
  void _name
  // Deprecated. The new flow generates codes from segments + bucket suffix
  // via `generateNextStyleCode`. Returns '' so callers don't accidentally
  // persist a stale name-derived code.
  return ''
}

// ── Style Code Settings (admin-managed rules) ────────────────

// Returns rules grouped by segment, sorted by sort_order then value.
// Shape: { gender: [{id, value, code, sort_order}, …], fabric: […], silhouette: […] }
export async function getStyleCodeSettings() {
  const { data, error } = await supabase
    .from('style_code_settings')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('value',      { ascending: true })
  if (error) throw error
  const grouped = Object.fromEntries(STYLE_CODE_SEGMENTS.map(s => [s, []]))
  for (const row of data || []) {
    if (grouped[row.segment]) grouped[row.segment].push(row)
  }
  return grouped
}

function validateRuleInput({ segment, value, code }) {
  if (!STYLE_CODE_SEGMENTS.includes(segment)) throw new Error('Invalid segment')
  if (!value || !value.trim()) throw new Error('Value is required')
  if (!code) throw new Error('Short code is required')
  const c = code.trim().toUpperCase()
  if (!/^[A-Z]$/.test(c)) throw new Error('Short code must be a single letter A–Z')
  return c
}

export async function createStyleCodeRule({ segment, value, code, sort_order = 0 }) {
  const cleanCode = validateRuleInput({ segment, value, code })
  const { data, error } = await supabase
    .from('style_code_settings')
    .insert([{ segment, value: value.trim(), code: cleanCode, sort_order: Number(sort_order) || 0 }])
    .select()
    .single()
  if (error) throw new Error(error.message.includes('duplicate') ? 'That value or code already exists for this segment.' : error.message)
  return data
}

export async function updateStyleCodeRule(id, patch) {
  const clean = { updated_at: new Date().toISOString() }
  if (patch.value !== undefined) {
    if (!patch.value.trim()) throw new Error('Value is required')
    clean.value = patch.value.trim()
  }
  if (patch.code !== undefined) {
    const c = (patch.code || '').trim().toUpperCase()
    if (!/^[A-Z]$/.test(c)) throw new Error('Short code must be a single letter A–Z')
    clean.code = c
  }
  if (patch.sort_order !== undefined) clean.sort_order = Number(patch.sort_order) || 0
  const { data, error } = await supabase
    .from('style_code_settings')
    .update(clean)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message.includes('duplicate') ? 'That value or code already exists for this segment.' : error.message)
  return data
}

export async function deleteStyleCodeRule(id) {
  const { error } = await supabase.from('style_code_settings').delete().eq('id', id)
  if (error) throw error
}

// ── Fibers + Fabrics ───────────────────────────────────────────

export async function getFibers() {
  const { data, error } = await supabase
    .from('fibers')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw error
  return data || []
}

function cleanFiberInput({ name, code, sort_order = 0 }) {
  const cleanName = (name || '').trim()
  const cleanCode = (code || '').trim().toUpperCase()
  if (!cleanName) throw new Error('Fiber name is required')
  if (!/^[A-Z]{2,4}$/.test(cleanCode)) throw new Error('Fiber code must be 2-4 letters A-Z')
  return { name: cleanName, code: cleanCode, sort_order: Number(sort_order) || 0 }
}

export async function createFiber(payload) {
  const clean = cleanFiberInput(payload)
  const { data, error } = await supabase.from('fibers').insert([clean]).select().single()
  if (error) throw new Error(error.message.includes('duplicate') ? 'That fiber name or code already exists.' : error.message)
  return data
}

export async function updateFiber(id, patch) {
  const clean = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new Error('Fiber name is required')
    clean.name = patch.name.trim()
  }
  if (patch.code !== undefined) {
    const code = (patch.code || '').trim().toUpperCase()
    if (!/^[A-Z]{2,4}$/.test(code)) throw new Error('Fiber code must be 2-4 letters A-Z')
    clean.code = code
  }
  if (patch.sort_order !== undefined) clean.sort_order = Number(patch.sort_order) || 0

  const { data, error } = await supabase.from('fibers').update(clean).eq('id', id).select().single()
  if (error) throw new Error(error.message.includes('duplicate') ? 'That fiber name or code already exists.' : error.message)
  return data
}

export async function deleteFiber(id) {
  const { error } = await supabase.from('fibers').delete().eq('id', id)
  if (error) throw error
}

export async function getFabrics({ codedOnly = false } = {}) {
  let q = supabase
    .from('fabrics')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (codedOnly) q = q.not('code', 'is', null)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

function cleanFabricInput({ name, composition, code, sort_order = 0 }) {
  const cleanName = (name || '').trim()
  const cleanComposition = (composition || '').trim() || null
  const rawCode = (code || '').trim().toUpperCase()
  if (!cleanName) throw new Error('Fabric name is required')
  if (rawCode && !/^[A-Z]{2}$/.test(rawCode)) throw new Error('Fabric code must be exactly 2 letters A-Z')
  return {
    name: cleanName,
    composition: cleanComposition,
    code: rawCode || null,
    sort_order: Number(sort_order) || 0,
  }
}

export async function createFabric(payload) {
  const clean = cleanFabricInput(payload)
  const { data, error } = await supabase.from('fabrics').insert([clean]).select().single()
  if (error) throw new Error(error.message.includes('duplicate') ? 'That fabric name or code already exists.' : error.message)
  return data
}

export async function updateFabric(id, patch) {
  const clean = { updated_at: new Date().toISOString() }
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new Error('Fabric name is required')
    clean.name = patch.name.trim()
  }
  if (patch.composition !== undefined) clean.composition = (patch.composition || '').trim() || null
  if (patch.code !== undefined) {
    const code = (patch.code || '').trim().toUpperCase()
    if (code && !/^[A-Z]{2}$/.test(code)) throw new Error('Fabric code must be exactly 2 letters A-Z')
    clean.code = code || null
  }
  if (patch.sort_order !== undefined) clean.sort_order = Number(patch.sort_order) || 0

  const { data, error } = await supabase.from('fabrics').update(clean).eq('id', id).select().single()
  if (error) throw new Error(error.message.includes('duplicate') ? 'That fabric name or code already exists.' : error.message)
  return data
}

export async function deleteFabric(id) {
  const { error } = await supabase.from('fabrics').delete().eq('id', id)
  if (error) throw error
}

// Build the 4-letter semantic prefix from the maker's selections.
// Returns `{ ok, prefix, missing }`. Missing letters are rendered as '?'
// in the preview string so the maker sees which dropdowns still need
// values.
export function composeStyleCodeSegments(selections, rules) {
  let prefix = STYLE_CODE_PREFIX
  const missing = []

  const gender = (selections.gender || '').trim()
  const genderMatch = (rules.gender || []).find(r => r.value.toLowerCase() === gender.toLowerCase())
  if (genderMatch) prefix += genderMatch.code
  else { prefix += '?'; missing.push('gender') }

  const fabric = (selections.fabric || '').trim()
  const fabricMatch = (rules.fabric || []).find(r => r.name.toLowerCase() === fabric.toLowerCase())
  if (fabricMatch?.code) prefix += fabricMatch.code
  else { prefix += '??'; missing.push('fabric') }

  const silhouette = (selections.silhouette || '').trim()
  const silhouetteMatch = (rules.silhouette || []).find(r => r.value.toLowerCase() === silhouette.toLowerCase())
  if (silhouetteMatch) prefix += silhouetteMatch.code
  else { prefix += '?'; missing.push('silhouette') }

  return { ok: missing.length === 0, prefix, missing }
}

// Convert 0..675 → 'AA'..'ZZ' (base-26, both letters required).
function indexToSuffix(n) {
  if (n < 0 || n >= 676) throw new Error('Suffix bucket exhausted (676 max per gender+fabric+silhouette)')
  return String.fromCharCode(65 + Math.floor(n / 26)) + String.fromCharCode(65 + (n % 26))
}

// Convert 'AA' → 0, 'AB' → 1, …, 'ZZ' → 675. Returns -1 if not a valid
// 2-letter suffix.
function suffixToIndex(s) {
  if (!s || s.length !== 2) return -1
  const a = s.charCodeAt(0) - 65
  const b = s.charCodeAt(1) - 65
  if (a < 0 || a > 25 || b < 0 || b > 25) return -1
  return a * 26 + b
}

// Looks at existing styles in the same (gender, fabric, silhouette)
// bucket and returns the next AA-ZZ suffix. Reuses gaps from deleted
// styles only above the current high-water mark (we always take max+1).
async function nextBucketSuffix(prefix4) {
  const { data, error } = await supabase
    .from('styles')
    .select('style_code')
    .like('style_code', `${prefix4}%`)
  if (error) throw error
  let maxIdx = -1
  for (const row of data || []) {
    const code = row.style_code || ''
    if (code.length !== STYLE_CODE_LENGTH) continue
    const idx = suffixToIndex(code.slice(5))
    if (idx > maxIdx) maxIdx = idx
  }
  return indexToSuffix(maxIdx + 1)
}

// Produces the final, unique 7-letter style code given the maker's
// selections. Throws if any of gender/fabric/silhouette has no rule.
export async function generateNextStyleCode(selections) {
  const [settings, fabrics] = await Promise.all([
    getStyleCodeSettings(),
    getFabrics(),
  ])
  const rules = { ...settings, fabric: fabrics }
  const { ok, prefix, missing } = composeStyleCodeSegments(selections, rules)
  if (!ok) {
    throw new Error(`Cannot generate style code — missing rule for: ${missing.join(', ')}`)
  }
  const suffix = await nextBucketSuffix(prefix)
  return `${prefix}${suffix}`
}

export const STAGES = [
  'Style Creation',
  'Silhouette Approval',
  'Fit Check',
  'RFP',
  'Inventory Planning',
]

export const CATEGORY_OPTIONS = {
  Women:  ['Top','Bottom','Dress','Innerwear','Outerwear','Accessories'],
  Men:    ['Top','Bottom','Innerwear','Outerwear','Accessories'],
  Unisex: ['Top','Bottom','Innerwear','Outerwear','Accessories'],
}

export const ROLE_PAGES = {
  founder: '/dashboard',
  checker: '/approvals',
  maker:   '/styles',
  viewer:  '/dashboard',
}
