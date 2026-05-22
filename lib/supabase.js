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

// ── Style Code Builder ────────────────────────────────────────
//
// Replaces the prior gender/silhouette rules table. Admin defines the
// style code one row at a time in an Excel-style UI; each row is either
// a fixed character (Brand=SAADAA→S), one value of a variable segment
// (Gender→Women=D), or the auto AA-ZZ uniqueness suffix (group="Sequence",
// is_sequence=true).
//
// Generation walks `style_code_builder` ordered by `position`, groups
// rows by `group_name` (order = first appearance), and for each group:
//   - 1 row              → fixed segment, always use that code
//   - is_sequence=true   → compute next AA-ZZ from existing styles
//   - N rows (variable)  → maker selected one of `field` values; use
//                          the matching row's code
//
// `generateStyleCode(name)` is kept as a no-op stub so old imports don't
// break; the real code is produced by `generateNextStyleCode(...)`.

export function generateStyleCode(_name) {
  void _name
  return ''
}

// Returns raw rows ordered by position (lowest first).
export async function getBuilderRows() {
  const { data, error } = await supabase
    .from('style_code_builder')
    .select('*')
    .order('position', { ascending: true })
  if (error) throw error
  return data || []
}

// Returns rows grouped by `group_name`, in the order each group first
// appears. Shape:
//   [{ groupName, isSequence, letters, rows: [{id, field, code, position, ...}, …] }, …]
export async function getBuilderGroups() {
  const rows = await getBuilderRows()
  const byName = new Map()
  const order = []
  for (const row of rows) {
    if (!byName.has(row.group_name)) {
      byName.set(row.group_name, {
        groupName:  row.group_name,
        isSequence: !!row.is_sequence,
        letters:    row.letters,
        rows:       [],
      })
      order.push(row.group_name)
    }
    byName.get(row.group_name).rows.push(row)
  }
  return order.map(g => byName.get(g))
}

function cleanBuilderInput({ group_name, letters, field, code, is_sequence = false }) {
  const cleanGroup = (group_name || '').trim()
  const cleanField = (field || '').trim()
  const rawCode    = (code || '').trim().toUpperCase()
  const cleanLetters = Number(letters)
  if (!cleanGroup) throw new Error('Group is required')
  if (!cleanField) throw new Error('Field is required')
  if (!Number.isInteger(cleanLetters) || cleanLetters < 1 || cleanLetters > 6) {
    throw new Error('Letters must be 1–6')
  }
  if (!is_sequence) {
    if (!/^[A-Z]+$/.test(rawCode)) throw new Error('Code must contain only letters A–Z')
    if (rawCode.length !== cleanLetters) {
      throw new Error(`Code must be exactly ${cleanLetters} letter${cleanLetters === 1 ? '' : 's'} for this row`)
    }
  }
  return {
    group_name:  cleanGroup,
    letters:     cleanLetters,
    field:       cleanField,
    code:        is_sequence ? (rawCode || 'AA-ZZ') : rawCode,
    is_sequence: !!is_sequence,
  }
}

export async function createBuilderRow(payload) {
  const clean = cleanBuilderInput(payload)
  // Auto-assign position at the end unless an explicit one was provided.
  let position = Number(payload.position)
  if (!Number.isInteger(position) || position <= 0) {
    const { data: maxRow } = await supabase
      .from('style_code_builder')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()
    position = (maxRow?.position || 0) + 1
  }
  const { data, error } = await supabase
    .from('style_code_builder')
    .insert([{ ...clean, position }])
    .select()
    .single()
  if (error) throw new Error(
    error.message.includes('duplicate')
      ? 'That field or code is already used in this group.'
      : error.message,
  )
  return data
}

export async function updateBuilderRow(id, patch) {
  const clean = { updated_at: new Date().toISOString() }
  if (patch.group_name !== undefined) clean.group_name = (patch.group_name || '').trim()
  if (patch.field      !== undefined) clean.field      = (patch.field      || '').trim()
  if (patch.is_sequence !== undefined) clean.is_sequence = !!patch.is_sequence
  if (patch.letters    !== undefined) {
    const n = Number(patch.letters)
    if (!Number.isInteger(n) || n < 1 || n > 6) throw new Error('Letters must be 1–6')
    clean.letters = n
  }
  if (patch.code !== undefined) {
    const raw = (patch.code || '').trim().toUpperCase()
    // Sequence rows accept any descriptive label (e.g. "AA-ZZ"); other
    // rows must be exactly `letters` capital letters.
    if (!patch.is_sequence && clean.letters && !/^[A-Z]+$/.test(raw)) {
      throw new Error('Code must contain only letters A–Z')
    }
    clean.code = raw
  }
  const { data, error } = await supabase
    .from('style_code_builder')
    .update(clean)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(
    error.message.includes('duplicate')
      ? 'That field or code is already used in this group.'
      : error.message,
  )
  return data
}

export async function deleteBuilderRow(id) {
  const { error } = await supabase.from('style_code_builder').delete().eq('id', id)
  if (error) throw error
}

// Swap a row with its neighbor in the position ordering. `direction` is
// -1 (up) or +1 (down). Returns silently if there's no neighbor.
export async function moveBuilderRow(id, direction) {
  if (direction !== -1 && direction !== 1) throw new Error('direction must be -1 or +1')
  const { data: cur, error: e1 } = await supabase
    .from('style_code_builder').select('id, position').eq('id', id).single()
  if (e1) throw e1
  const q = supabase.from('style_code_builder').select('id, position')
  const { data: nbrRows, error: e2 } = direction === -1
    ? await q.lt('position', cur.position).order('position', { ascending: false }).limit(1)
    : await q.gt('position', cur.position).order('position', { ascending: true }).limit(1)
  if (e2) throw e2
  const nbr = (nbrRows || [])[0]
  if (!nbr) return
  // Swap positions using a temporary value to avoid the unique-index conflict.
  const TEMP = -Math.abs(cur.position) - 1
  const { error: e3 } = await supabase.from('style_code_builder').update({ position: TEMP }).eq('id', cur.id)
  if (e3) throw e3
  const { error: e4 } = await supabase.from('style_code_builder').update({ position: cur.position }).eq('id', nbr.id)
  if (e4) throw e4
  const { error: e5 } = await supabase.from('style_code_builder').update({ position: nbr.position }).eq('id', cur.id)
  if (e5) throw e5
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

// ── Style Code generation ──────────────────────────────────────

// Generic base-26 helpers (AA-ZZ for width 2, AAA-ZZZ for width 3, …).
function indexToAlpha(n, width) {
  const cap = Math.pow(26, width)
  if (n < 0 || n >= cap) throw new Error(`Sequence bucket exhausted (max ${cap} for width ${width})`)
  let out = ''
  for (let i = width - 1; i >= 0; i--) {
    out += String.fromCharCode(65 + Math.floor(n / Math.pow(26, i)) % 26)
  }
  return out
}
function alphaToIndex(s, width) {
  if (!s || s.length !== width) return -1
  let n = 0
  for (let i = 0; i < width; i++) {
    const c = s.charCodeAt(i) - 65
    if (c < 0 || c > 25) return -1
    n = n * 26 + c
  }
  return n
}

// Walks the builder groups in order and assembles a code pattern. For
// non-sequence segments, uses the maker's selection (or '?' fillers if
// missing). For sequence segments, uses '_' as a Postgres-LIKE wildcard
// in the returned pattern (and exposes its position+width so the caller
// can compute the next value).
//
// `selections` = { [groupName]: fieldValue } from maker dropdowns.
// `groups`     = output of getBuilderGroups().
//
// Returns: { ok, preview, pattern, missing, sequenceStart, sequenceWidth }
//   - preview:   human-friendly string ('SDCOSAA' or 'SDCO??AA' with '?' for missing)
//   - pattern:   PG LIKE pattern ('SDCO__' with '_' as single-char wildcard) for the
//                final code, used to scan existing styles for the next sequence value
export function composeStyleCodeFromBuilder(selections, groups) {
  let preview = ''
  let pattern = ''
  const missing = []
  let sequenceStart = -1
  let sequenceWidth = 0

  for (const g of groups) {
    if (g.isSequence) {
      sequenceStart = preview.length
      sequenceWidth = g.letters
      preview += indexToAlpha(0, g.letters)              // shows AA / AAA / etc.
      pattern += '_'.repeat(g.letters)
    } else if (g.rows.length === 1) {
      const c = g.rows[0].code
      preview += c
      pattern += c
    } else {
      const selVal = (selections[g.groupName] || '').trim()
      const match = g.rows.find(r => r.field.toLowerCase() === selVal.toLowerCase())
      if (match) {
        preview += match.code
        pattern += match.code
      } else {
        preview += '?'.repeat(g.letters)
        pattern += '_'.repeat(g.letters)
        missing.push(g.groupName)
      }
    }
  }

  return { ok: missing.length === 0, preview, pattern, missing, sequenceStart, sequenceWidth }
}

// Produces the final, unique style code from the maker's selections.
// Throws if any variable group has no selection. If the builder has no
// sequence row, returns the deterministic pattern as-is (and downstream
// uniqueness must come from a UNIQUE index on styles.style_code).
export async function generateNextStyleCode(selections) {
  const groups = await getBuilderGroups()
  const { ok, missing, pattern, sequenceStart, sequenceWidth } =
    composeStyleCodeFromBuilder(selections, groups)
  if (!ok) {
    throw new Error(`Cannot generate style code — pick a value for: ${missing.join(', ')}`)
  }
  if (sequenceStart < 0) return pattern                  // no sequence row → done

  const { data, error } = await supabase
    .from('styles')
    .select('style_code')
    .like('style_code', pattern)                         // pattern has '_' wildcards
  if (error) throw error

  let maxIdx = -1
  for (const r of data || []) {
    const code = r.style_code || ''
    if (code.length !== pattern.length) continue
    const seq = code.slice(sequenceStart, sequenceStart + sequenceWidth)
    const idx = alphaToIndex(seq, sequenceWidth)
    if (idx > maxIdx) maxIdx = idx
  }
  const nextSeq = indexToAlpha(maxIdx + 1, sequenceWidth)
  return pattern.slice(0, sequenceStart) + nextSeq + pattern.slice(sequenceStart + sequenceWidth)
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
