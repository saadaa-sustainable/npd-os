'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import { useToast } from '@/components/Toast'
import {
  getWeeklyPlans, deleteWeeklyPlan, supabase,
} from '@/lib/supabase'

const STATUS_BADGE = {
  draft:     'badge-grey',
  submitted: 'badge-blue',
  approved:  'badge-green',
  rejected:  'badge-red',
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function WeeklyPlanPage() {
  const user  = useRequireAuth()
  const toast = useToast()
  const [plans, setPlans]       = useState([])
  const [counts, setCounts]     = useState({})   // { planId: { fabrics, items } }
  const [loading, setLoading]   = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch]     = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await getWeeklyPlans()
      setPlans(data)
      const c = {}
      await Promise.all(data.map(async p => {
        const { data: rows } = await supabase
          .from('weekly_plan_fabrics')
          .select('items')
          .eq('weekly_plan_id', p.id)
        const fabricCount = rows?.length || 0
        const itemCount = (rows || []).reduce(
          (acc, r) => acc + (Array.isArray(r.items) ? r.items.length : 0), 0,
        )
        c[p.id] = { fabrics: fabricCount, items: itemCount }
      }))
      setCounts(c)
    } catch (e) { toast(e.message, 'error') }
    finally    { setLoading(false) }
  }

  useEffect(() => {
    if (!user) return
    ;(async () => { await load() })()
  }, [user])

  if (!user) return null

  const canCreate = ['founder','maker'].includes(user.role)

  const filtered = plans.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false
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
        <select className="select-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {['draft','submitted','approved','rejected'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="spinner-wrap"><div className="spinner"/></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {['Week Start (Mon)','Week End (Mon)','Fabrics','Items','Status','Created By','Approved By',''].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 48, color: 'var(--t3)' }}>
                    {plans.length === 0 ? 'No weekly plans yet. Click + New Weekly Plan to start.' : 'No plans match your filters.'}
                  </td></tr>
                ) : filtered.map(p => {
                  const c = counts[p.id] || { fabrics: 0, items: 0 }
                  return (
                    <tr key={p.id} onClick={() => window.location.assign(`/weekly-plan/new?id=${p.id}`)}>
                      <td className="td-primary">{fmtDate(p.week_start_date)}</td>
                      <td>{fmtDate(p.week_end_date)}</td>
                      <td><span className="td-code">{c.fabrics}</span></td>
                      <td><span className="td-code">{c.items}</span></td>
                      <td><span className={`badge ${STATUS_BADGE[p.status] || 'badge-grey'}`}>{p.status}</span></td>
                      <td className="td-muted">{p.creator?.full_name?.split(' ')[0] || '—'}</td>
                      <td className="td-muted">{p.approver?.full_name?.split(' ')[0] || '—'}</td>
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
