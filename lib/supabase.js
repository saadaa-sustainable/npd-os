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

export function generateStyleCode(name) {
  if (!name) return ''
  const words = name.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean)
  const skip = new Set(['a','an','the','and','or','of','for','in','with','on','saadaa'])

  let prefix = 'SD'
  if (words.includes('men') && !words.includes('women')) prefix = 'SM'

  const meaningful = words.filter(w => !skip.has(w) && w !== 'women' && w !== 'men' && w !== 'unisex')
  let code = prefix
  for (const w of meaningful.slice(0, 3)) {
    const consonants = w.replace(/[aeiou]/gi, '').toUpperCase()
    code += consonants.slice(0, 2) || w[0].toUpperCase()
  }
  return code.slice(0, 8)
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
