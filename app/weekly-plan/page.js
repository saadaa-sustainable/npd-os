'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import { useToast } from '@/components/Toast'
import {
  getWeeklyPlans, deleteWeeklyPlan, supabase,
} from '@/lib/supabase'

const STATUS_KEYS = ['draft','submitted','approved','rejected','cancelled']

const STATUS_DOT_COLOR = {
  draft:     'var(--t3)',
  submitted: 'var(--blue)',
  approved:  'var(--green)',
  rejected:  'var(--red)',
  cancelled: 'var(--orange)',
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function emptyRollup() {
  return Object.fromEntries(STATUS_KEYS.map(s => [s, 0]))
}

export default function WeeklyPlanPage() {
  const user  = useRequireAuth()
  const toast = useToast()
  const [plans, setPlans]       = useState([])
  const [stats, setStats]       = useState({})   // { planId: { fabrics, items, rollup } }
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getWeeklyPlans()
      setPlans(data)
      const s = {}
      await Promise.all(data.map(async p => {
        const { data: rows } = await supabase
          .from('weekly_plan_fabrics')
          .select('items')
          .eq('weekly_plan_id', p.id)
        const fabricCount = rows?.length || 0
        const rollup = emptyRollup()
        let itemCount = 0
        for (const r of rows || []) {
          if (!Array.isArray(r.items)) continue
          for (const it of r.items) {
            itemCount++
            const k = it.status && STATUS_KEYS.includes(it.status) ? it.status : 'draft'
            rollup[k]++
          }
        }
        s[p.id] = { fabrics: fabricCount, items: itemCount, rollup }
      }))
      setStats(s)
    } catch (e) { toast(e.message, 'error') }
    finally    { setLoading(false) }
  }, [toast])

  useEffect(() => {
    if (!user) return
    ;(async () => { await load() })()
  }, [user, load])

  if (!user) return null

  const canCreate = ['founder','maker','checker'].includes(user.role)

  const filtered = plans.filter(p => {
    if (search) {
      const h = `${p.week_start_date} ${p.week_end_date} ${p.creator?.full_name || ''}`.toLowerCase()
      if (!h.includes(search.toLowerCase())) return false
    }
    return true
  })

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Delete this weekly plan and all its fabrics? This cannot be undone.')) return
    try { await deleteWeeklyPlan(id); toast('Plan deleted', 'info'); load() }
    catch (err) { toast(err.message, 'error') }
  }

  return (
    <AppShell title="Weekly Plan" subtitle="Mon-to-Mon planning, organised by fabric">
      {canCreate && (
        <div style={{ position: 'fixed', top: 14, right: 28, zIndex: 30 }}>
          <a href="/weekly-plan/new" className="btn btn-primary btn-sm">
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            New Weekly Plan
          </a>
        </div>
      )}

      <div className="filter-bar">
        <div className="search-wrap">
          <svg className="search-icon" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input className="search-input" placeholder="Search by date or creator…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="spinner-wrap"><div className="spinner"/></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {['Week Start (Mon)','Week End (Mon)','Fabrics','Items','Item Statuses','Created By',''].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 48, color: 'var(--t3)' }}>
                    {plans.length === 0 ? 'No weekly plans yet. Click + New Weekly Plan to start.' : 'No plans match your search.'}
                  </td></tr>
                ) : filtered.map(p => {
                  const st = stats[p.id] || { fabrics: 0, items: 0, rollup: emptyRollup() }
                  return (
                    <tr key={p.id} onClick={() => window.location.assign(`/weekly-plan/new?id=${p.id}`)}>
                      <td className="td-primary">{fmtDate(p.week_start_date)}</td>
                      <td>{fmtDate(p.week_end_date)}</td>
                      <td><span className="td-code">{st.fabrics}</span></td>
                      <td><span className="td-code">{st.items}</span></td>
                      <td>
                        <RollupPills rollup={st.rollup} />
                      </td>
                      <td className="td-muted">{p.creator?.full_name?.split(' ')[0] || '—'}</td>
                      <td onClick={e => e.stopPropagation()}>
                        {user.role === 'founder' && (
                          <button className="btn btn-xs btn-danger" onClick={e => handleDelete(e, p.id)} title="Delete plan">✕</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}

function RollupPills({ rollup }) {
  const total = STATUS_KEYS.reduce((a, k) => a + (rollup[k] || 0), 0)
  if (total === 0) return <span className="td-muted">—</span>
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {STATUS_KEYS.map(k => rollup[k] > 0 && (
        <span key={k} title={k} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--t2)',
          padding: '2px 8px', borderRadius: 20,
          background: 'var(--raised)', border: '1px solid var(--border-dim)',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: STATUS_DOT_COLOR[k],
          }} />
          {rollup[k]} {shortLabel(k)}
        </span>
      ))}
    </div>
  )
}

function shortLabel(status) {
  return ({
    draft: 'draft', submitted: 'pending', approved: 'approved',
    rejected: 'rejected', cancelled: 'held',
  })[status] || status
}
