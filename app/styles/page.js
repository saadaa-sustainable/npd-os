'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import StyleDetailModal from '@/components/StyleDetailModal'
import { useRequireAuth } from '@/lib/auth-context'
import { getStyles, approveStyle, rejectStyle, STAGES } from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import { Suspense } from 'react'

const STAGE_BADGE = {
  'Style Creation':'badge-blue','Silhouette Approval':'badge-purple',
  'Fit Check':'badge-yellow','RFP':'badge-orange','Inventory Planning':'badge-green',
}

function StylesInner() {
  const user         = useRequireAuth()
  const searchParams = useSearchParams()
  const toast        = useToast()

  const [styles, setStyles]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [activeStage, setStage] = useState(() => {
    const stageParam = searchParams.get('stage')
    return stageParam ? decodeURIComponent(stageParam) : 'All'
  })
  const [search, setSearch]     = useState('')
  const [gender, setGender]     = useState('')
  const [fabric, setFabric]     = useState('')
  const [priority, setPriority] = useState('')
  const [approvalFilter, setApprovalFilter] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [stageCounts, setStageCounts] = useState({})

  const loadStyles = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getStyles()
      setStyles(data)
      const counts = {}
      STAGES.forEach(s => counts[s] = 0)
      data.forEach(s => { if (counts[s.stage] !== undefined) counts[s.stage]++ })
      setStageCounts(counts)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStyles()
  }, [loadStyles])

  if (!user) return null

  const canCreate  = ['founder','maker','checker'].includes(user.role)
  const canApprove = ['founder','checker'].includes(user.role)

  const filtered = styles.filter(s => {
    if (activeStage !== 'All' && s.stage !== activeStage) return false
    if (gender   && s.gender !== gender)                  return false
    if (fabric   && s.fabric_platform !== fabric)         return false
    if (priority && s.priority !== priority)              return false
    if (approvalFilter && s.approval_status !== approvalFilter) return false
    if (search) {
      const h = `${s.name} ${s.style_code} ${s.category} ${s.season}`.toLowerCase()
      if (!h.includes(search.toLowerCase())) return false
    }
    return true
  })

  const handleApprove = async (e, id) => {
    e.stopPropagation()
    try { await approveStyle(id, user.id); await loadStyles(); toast('Approved ✓', 'success') }
    catch(err) { toast(err.message, 'error') }
  }

  const handleReject = (e, id) => {
    e.stopPropagation()
    const reason = prompt('Reason for rejection:')
    if (!reason) return
    rejectStyle(id, user.id, reason).then(() => { loadStyles(); toast('Sent back for revision', 'info') }).catch(err => toast(err.message, 'error'))
  }

  return (
    <AppShell title="All Styles" subtitle="Complete NPD pipeline">
      {canCreate && (
        <div style={{ position: 'fixed', top: 14, right: 28, zIndex: 30 }}>
          <a href="/styles/new" className="btn btn-primary btn-sm">
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            New Style
          </a>
        </div>
      )}

      {/* Pipeline tabs */}
      <div className="pipeline-bar">
        {['All', ...STAGES].map((stage, i) => (
          <div key={stage} className={`ps${activeStage === stage ? ' active' : ''}`} onClick={() => setStage(stage)}>
            <div className="ps-num">{i === 0 ? '☰' : i}</div>
            <div className="ps-name">{stage === 'All' ? 'All' : stage.split(' ')[0]}</div>
            <div className="ps-count">{stage === 'All' ? styles.length : (stageCounts[stage] || 0)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="search-wrap">
          <svg className="search-icon" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input className="search-input" placeholder="Search name, code, category…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {[
          ['gender', gender, setGender, ['Women','Men','Unisex']],
          ['fabric', fabric, setFabric, ['Woven','Knit','Denim','Terry/Fleece']],
          ['priority', priority, setPriority, ['High','Medium','Low']],
          ['status', approvalFilter, setApprovalFilter, ['pending','approved','rejected']],
        ].map(([label, val, set, opts]) => (
          <select key={label} className="select-filter" value={val} onChange={e => set(e.target.value)}>
            <option value="">All {label.charAt(0).toUpperCase() + label.slice(1)}s</option>
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div className="spinner-wrap"><div className="spinner"/></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {['Code','Style Name','Gender','Category','Fabric','Stage','Priority','Season','Approval','Maker','Progress',''].map(h => <th key={h}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={12} style={{ textAlign: 'center', padding: 48, color: 'var(--t3)' }}>No styles match your filters.</td></tr>
                ) : filtered.map(s => {
                  const stageIdx = STAGES.indexOf(s.stage)
                  const progress = Math.round(((stageIdx + 1) / STAGES.length) * 100)
                  return (
                    <tr key={s.id} onClick={() => setDetailId(s.id)}>
                      <td><span className="td-code">{s.style_code || '—'}</span></td>
                      <td className="td-primary">{s.name}</td>
                      <td>{s.gender || '—'}</td>
                      <td>{s.category || '—'}</td>
                      <td>{s.fabric_platform || '—'}</td>
                      <td><span className={`badge ${STAGE_BADGE[s.stage] || 'badge-grey'}`}>{s.stage}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className={`prio-dot prio-${(s.priority||'').toLowerCase()}`}/>
                          {s.priority || '—'}
                        </div>
                      </td>
                      <td className="td-muted">{s.season || '—'}</td>
                      <td>
                        <span className={`badge ${s.approval_status === 'approved' ? 'badge-green' : s.approval_status === 'rejected' ? 'badge-red' : 'badge-yellow'}`}>
                          {s.approval_status || 'pending'}
                        </span>
                      </td>
                      <td className="td-muted">{s.maker?.full_name?.split(' ')[0] || '—'}</td>
                      <td style={{ minWidth: 80 }}>
                        <div className="progress-track" style={{ width: 80 }}>
                          <div className="progress-fill" style={{ width: `${progress}%` }}/>
                        </div>
                        <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>S{stageIdx+1}/5</div>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 5 }}>
                          {canApprove && s.approval_status === 'pending' && (
                            <>
                              <button className="btn btn-xs btn-success" onClick={e => handleApprove(e, s.id)}>✓</button>
                              <button className="btn btn-xs btn-danger" onClick={e => handleReject(e, s.id)}>✕</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detailId && (
        <StyleDetailModal
          styleId={detailId}
          user={user}
          onClose={() => setDetailId(null)}
          onRefresh={loadStyles}
        />
      )}
    </AppShell>
  )
}

export default function StylesPage() {
  return <Suspense><StylesInner /></Suspense>
}
