'use client'

import { useCallback, useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import { approveStyle, rejectStyle, supabase } from '@/lib/supabase'
import { useToast } from '@/components/Toast'

const STAGE_BADGE = {
  'Style Creation':'badge-blue','Silhouette Approval':'badge-purple',
  'Fit Check':'badge-yellow','RFP':'badge-orange','Inventory Planning':'badge-green',
}
const STAGE_NEXT = {
  'Style Creation':'Silhouette Approval','Silhouette Approval':'Fit Check',
  'Fit Check':'RFP','RFP':'Inventory Planning',
}

export default function ApprovalsPage() {
  const user  = useRequireAuth(['founder','checker'])
  const toast = useToast()
  const [tab, setTab]         = useState('pending')
  const [styles, setStyles]   = useState([])
  const [loading, setLoading] = useState(true)
  const [rejectModal, setRejectModal] = useState(null) // styleId
  const [rejectReason, setRejectReason] = useState('')

  const load = useCallback(async (t = tab) => {
    setLoading(true)
    let q = supabase
      .from('styles')
      .select('*, maker:profiles!styles_maker_id_fkey(full_name,email)')
      .order('created_at', { ascending: false })
    if (t === 'pending')  q = q.eq('approval_status','pending')
    if (t === 'approved') q = q.eq('approval_status','approved')
    if (t === 'rejected') q = q.eq('approval_status','rejected')
    const { data } = await q
    setStyles(data || [])
    setLoading(false)
  }, [tab])

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [user, load])

  const switchTab = t => { setTab(t); load(t) }

  const handleApprove = async id => {
    try { await approveStyle(id, user.id); toast('Approved and advanced ✓', 'success'); load() }
    catch(e) { toast(e.message, 'error') }
  }

  const openReject = id => { setRejectModal(id); setRejectReason('') }

  const handleReject = async () => {
    if (!rejectReason.trim()) { toast('Reason required', 'error'); return }
    try {
      await rejectStyle(rejectModal, user.id, rejectReason)
      setRejectModal(null)
      toast('Sent back for revision', 'info')
      load()
    } catch(e) { toast(e.message, 'error') }
  }

  if (!user) return null

  const formatDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short' }) : '—'

  return (
    <AppShell title="Approval Queue" subtitle="Maker-checker workflow">
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Approval Queue</div>
      <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 20 }}>Review and action style submissions from your team.</div>

      <div className="tabs">
        {[['pending','⏳ Pending'],['approved','✅ Approved'],['rejected','❌ Rejected'],['all','All']].map(([id,label]) => (
          <button key={id} className={`tab-item${tab===id?' active':''}`} onClick={() => switchTab(id)}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="spinner-wrap"><div className="spinner"/></div>
      ) : styles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🎉</div>
          <div className="empty-text">Nothing here</div>
          <div className="empty-sub">No {tab} submissions</div>
        </div>
      ) : styles.map(s => {
        const isPending = s.approval_status === 'pending'
        const nextStage = STAGE_NEXT[s.stage]
        return (
          <div key={s.id} className="approval-row">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 80 }}>
              <span className="td-code" style={{ fontSize: 10 }}>{s.style_code || '—'}</span>
              <span className={`badge ${STAGE_BADGE[s.stage] || 'badge-grey'}`} style={{ fontSize: 10 }}>{s.stage}</span>
            </div>
            <div className="approval-info">
              <div className="approval-name">{s.name}</div>
              <div className="approval-meta">
                {s.gender} · {s.category} · {s.fabric_platform}
                {' · '}Maker: <strong>{s.maker?.full_name || s.maker?.email || '—'}</strong>
                {' · '}{formatDate(s.created_at)}
              </div>
              {s.brief && (
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4, fontStyle: 'italic' }}>
                  {s.brief.slice(0,140)}{s.brief.length > 140 ? '…' : ''}
                </div>
              )}
              {s.rejection_reason && (
                <div style={{ marginTop: 6, background: 'var(--red-10)', borderLeft: '3px solid var(--red)', padding: '6px 10px', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--red)' }}>
                  Rejection note: {s.rejection_reason}
                </div>
              )}
            </div>
            <div className="approval-actions">
              {isPending ? (
                <>
                  <button className="btn btn-sm btn-success" onClick={() => handleApprove(s.id)}>
                    ✓ Approve {nextStage ? `→ ${nextStage.split(' ')[0]}` : ''}
                  </button>
                  <button className="btn btn-sm btn-danger" onClick={() => openReject(s.id)}>✕ Reject</button>
                </>
              ) : (
                <span className={`badge ${s.approval_status==='approved'?'badge-green':'badge-red'}`}>{s.approval_status}</span>
              )}
              <a href={`/styles?highlight=${s.id}`} className="btn btn-sm btn-ghost">View</a>
            </div>
          </div>
        )
      })}

      {/* Reject modal */}
      {rejectModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setRejectModal(null)}>
          <div className="modal modal-sm">
            <div className="modal-head">
              <div>
                <div className="modal-title">Reject & Send Back</div>
                <div className="modal-sub">Give the maker clear guidance to revise</div>
              </div>
              <button className="modal-close" onClick={() => setRejectModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Reason <span className="req">*</span></label>
                <textarea className="form-textarea" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                  placeholder="e.g. Fit photos missing. Please upload on-model front + back before resubmitting." />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setRejectModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject}>Confirm Rejection</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
