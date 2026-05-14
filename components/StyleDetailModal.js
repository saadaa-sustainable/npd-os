'use client'

import { useState, useEffect } from 'react'
import { getStyle, getAuditLog, approveStyle, rejectStyle, deleteStyle, STAGES } from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import { useRouter } from 'next/navigation'

const STAGE_BADGE = {
  'Style Creation':      'badge-blue',
  'Silhouette Approval': 'badge-purple',
  'Fit Check':           'badge-yellow',
  'RFP':                 'badge-orange',
  'Inventory Planning':  'badge-green',
}

export default function StyleDetailModal({ styleId, user, onClose, onRefresh }) {
  const [style, setStyle]   = useState(null)
  const [audit, setAudit]   = useState([])
  const [loading, setLoading] = useState(true)
  const [rejectReason, setRejectReason] = useState('')
  const [showReject, setShowReject] = useState(false)
  const toast  = useToast()
  const router = useRouter()

  useEffect(() => {
    Promise.all([getStyle(styleId), getAuditLog(styleId)])
      .then(([s, a]) => { setStyle(s); setAudit(a) })
      .finally(() => setLoading(false))
  }, [styleId])

  const canApprove = ['founder','checker'].includes(user?.role) && style?.approval_status === 'pending'
  const canEdit    = ['founder','maker'].includes(user?.role)
  const canDelete  = user?.role === 'founder'

  const handleApprove = async () => {
    try {
      await approveStyle(style.id, user.id)
      toast('Approved and advanced to next stage ✓', 'success')
      onRefresh?.(); onClose()
    } catch(e) { toast(e.message, 'error') }
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) { toast('Please provide a reason', 'error'); return }
    try {
      await rejectStyle(style.id, user.id, rejectReason)
      toast('Sent back for revision', 'info')
      onRefresh?.(); onClose()
    } catch(e) { toast(e.message, 'error') }
  }

  const handleDelete = async () => {
    if (!confirm('Permanently delete this style?')) return
    try {
      await deleteStyle(style.id)
      toast('Style deleted', 'info')
      onRefresh?.(); onClose()
    } catch(e) { toast(e.message, 'error') }
  }

  const formatDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'

  const stageIdx = style ? STAGES.indexOf(style.stage) : -1

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-lg">
        <div className="modal-head">
          <div>
            <div className="modal-title">{loading ? 'Loading…' : style?.name}</div>
            <div className="modal-sub">{style?.style_code} · {style?.stage}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <div className="modal-body"><div className="spinner-wrap"><div className="spinner"/></div></div>
        ) : style ? (
          <>
            <div className="modal-body">
              {/* Fields grid */}
              <div className="form-grid" style={{ marginBottom: 20 }}>
                {[
                  ['Style Code', <span className="td-code">{style.style_code || '—'}</span>],
                  ['Stage', <span className={`badge ${STAGE_BADGE[style.stage] || 'badge-grey'}`}>{style.stage}</span>],
                  ['Gender', style.gender || '—'],
                  ['Category', style.category || '—'],
                  ['Fabric', style.fabric_platform || '—'],
                  ['Priority', style.priority || '—'],
                  ['Season', style.season || '—'],
                  ['Collection', style.collection || '—'],
                  ['Maker', style.maker?.full_name || '—'],
                  ['Checker', style.checker?.full_name || 'Unassigned'],
                  ['Approval', <span className={`badge ${style.approval_status === 'approved' ? 'badge-green' : style.approval_status === 'rejected' ? 'badge-red' : 'badge-yellow'}`}>{style.approval_status}</span>],
                  ['Created', formatDate(style.created_at)],
                ].map(([label, val]) => (
                  <div key={label} className="form-group">
                    <div className="form-label">{label}</div>
                    <div style={{ color: 'var(--t1)', marginTop: 4, fontSize: 13 }}>{val}</div>
                  </div>
                ))}
              </div>

              {style.brief && (
                <div style={{ marginBottom: 16 }}>
                  <div className="form-label" style={{ marginBottom: 6 }}>Product Brief</div>
                  <div style={{ background: 'var(--raised)', borderRadius: 'var(--r-sm)', padding: '12px 14px', fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>{style.brief}</div>
                </div>
              )}

              {style.rejection_reason && (
                <div style={{ marginBottom: 16, background: 'var(--red-10)', border: '1px solid rgba(255,107,107,.2)', borderRadius: 'var(--r-sm)', padding: '12px 14px' }}>
                  <div className="form-label" style={{ color: 'var(--red)', marginBottom: 4 }}>Rejection Reason</div>
                  <div style={{ fontSize: 13, color: 'var(--t1)' }}>{style.rejection_reason}</div>
                </div>
              )}

              {style.ref_link && (
                <div style={{ marginBottom: 16 }}>
                  <div className="form-label" style={{ marginBottom: 6 }}>Reference Link</div>
                  <a href={style.ref_link} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">Open ↗</a>
                </div>
              )}

              {/* Pipeline progress */}
              <div style={{ marginBottom: 20 }}>
                <div className="form-label" style={{ marginBottom: 8 }}>Pipeline Progress</div>
                <div style={{ display: 'flex', border: '1px solid var(--border-dim)', borderRadius: 'var(--r)', overflow: 'hidden' }}>
                  {STAGES.map((st, i) => (
                    <div key={st} style={{
                      flex: 1, padding: '10px 6px', textAlign: 'center',
                      background: i < stageIdx ? 'var(--green-10)' : i === stageIdx ? 'var(--primary-10)' : 'transparent',
                      borderRight: i < 4 ? '1px solid var(--border-dim)' : '',
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: i < stageIdx ? 'var(--green)' : i === stageIdx ? 'var(--primary)' : 'var(--t3)' }}>
                        {i < stageIdx ? '✓' : i === stageIdx ? '◉' : i + 1}
                      </div>
                      <div style={{ fontSize: 9, color: i <= stageIdx ? 'var(--t1)' : 'var(--t3)', marginTop: 2, fontWeight: 600 }}>
                        {st.split(' ')[0].toUpperCase()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reject form inline */}
              {showReject && (
                <div style={{ marginBottom: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Reason for rejection <span className="req">*</span></label>
                    <textarea className="form-textarea" value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Give the maker clear guidance on what to fix…" />
                  </div>
                </div>
              )}

              {/* Audit */}
              {audit.length > 0 && (
                <div>
                  <div className="form-label" style={{ marginBottom: 8 }}>Audit Trail</div>
                  {audit.slice(0, 6).map(e => (
                    <div key={e.id} className="audit-entry">
                      <div className="audit-dot" />
                      <div>
                        <div className="audit-action">{e.action}</div>
                        <div className="audit-meta">{e.profiles?.full_name || '—'} · {formatDate(e.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-foot">
              {canApprove && !showReject && (
                <>
                  <button className="btn btn-success" onClick={handleApprove}>✓ Approve</button>
                  <button className="btn btn-danger" onClick={() => setShowReject(true)}>✕ Reject</button>
                </>
              )}
              {showReject && (
                <>
                  <button className="btn btn-ghost" onClick={() => setShowReject(false)}>Cancel</button>
                  <button className="btn btn-danger" onClick={handleReject}>Confirm Rejection</button>
                </>
              )}
              {canEdit && !showReject && (
                <button className="btn btn-ghost" onClick={() => router.push(`/styles/new?id=${style.id}`)}>Edit</button>
              )}
              {canDelete && !showReject && (
                <button className="btn btn-danger" onClick={handleDelete} style={{ marginRight: 'auto' }}>Delete</button>
              )}
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <div className="modal-body"><div className="empty-state"><div className="empty-icon">⚠️</div><div className="empty-text">Style not found</div></div></div>
        )}
      </div>
    </div>
  )
}
