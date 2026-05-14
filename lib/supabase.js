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
