'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import { getStyle, createStyle, updateStyle, addAuditLog, generateStyleCode, CATEGORY_OPTIONS } from '@/lib/supabase'
import { useToast } from '@/components/Toast'

function NewStyleInner() {
  const user   = useRequireAuth(['founder','maker'])
  const router = useRouter()
  const toast  = useToast()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')

  const [form, setForm] = useState({
    name: '', style_code: '', priority: '', gender: '', category: '',
    fabric_platform: '', season: '', collection: '', silhouette: '',
    ref_link: '', brief: '', checker_notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editId) {
      getStyle(editId).then(s => {
        setForm({
          name: s.name || '', style_code: s.style_code || '', priority: s.priority || '',
          gender: s.gender || '', category: s.category || '', fabric_platform: s.fabric_platform || '',
          season: s.season || '', collection: s.collection || '', silhouette: s.silhouette || '',
          ref_link: s.ref_link || '', brief: s.brief || '', checker_notes: s.checker_notes || '',
        })
      })
    }
  }, [editId])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const onNameChange = e => {
    const name = e.target.value
    set('name', name)
    if (!editId) set('style_code', generateStyleCode(name))
  }

  const onGenderChange = e => {
    set('gender', e.target.value)
    set('category', '')
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const { name, priority, gender, category, fabric_platform } = form
    if (!name || !priority || !gender || !category || !fabric_platform) {
      toast('Please fill all required fields', 'error'); return
    }
    setSaving(true)
    try {
      if (editId) {
        await updateStyle(editId, { ...form, approval_status: 'pending' })
        await addAuditLog(editId, `Style updated by ${user.full_name}`, user.id)
        toast('Style updated and resubmitted for approval ✓', 'success')
      } else {
        const created = await createStyle({ ...form, maker_id: user.id, stage: 'Style Creation', approval_status: 'pending' })
        await addAuditLog(created.id, `Style created by ${user.full_name}`, user.id)
        toast('Style created and submitted for approval ✓', 'success')
      }
      setTimeout(() => router.push('/styles'), 800)
    } catch(err) { toast(err.message, 'error') }
    finally { setSaving(false) }
  }

  if (!user) return null
  const catOptions = form.gender ? (CATEGORY_OPTIONS[form.gender] || []) : []

  return (
    <AppShell title={editId ? 'Edit Style' : 'New Style'} subtitle={editId ? 'Update and resubmit for approval' : 'Initiate a new style into the pipeline'}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <a href="/styles" className="btn btn-ghost btn-sm" style={{ marginBottom: 20, display: 'inline-flex' }}>← Back to Styles</a>

        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="card-body">
              <div className="form-grid">
                <div className="form-section-head">Basic Information</div>

                <div className="form-group form-full">
                  <label className="form-label">Product Name <span className="req">*</span></label>
                  <input className="form-input" value={form.name} onChange={onNameChange} placeholder="e.g. Women Cotton Straight Pant" />
                  <div className="form-hint">Use the full descriptive name — style code is auto-generated from this</div>
                </div>

                <div className="form-group">
                  <label className="form-label">Generated Style Code</label>
                  <input className="form-input code-field" value={form.style_code} readOnly placeholder="Auto-generated…" />
                </div>

                <div className="form-group">
                  <label className="form-label">Priority <span className="req">*</span></label>
                  <select className="form-select" value={form.priority} onChange={e => set('priority', e.target.value)}>
                    <option value="">Select…</option>
                    {['High','Medium','Low'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Gender <span className="req">*</span></label>
                  <select className="form-select" value={form.gender} onChange={onGenderChange}>
                    <option value="">Select…</option>
                    {['Women','Men','Unisex'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Category <span className="req">*</span></label>
                  <select className="form-select" value={form.category} onChange={e => set('category', e.target.value)} disabled={!form.gender}>
                    <option value="">{form.gender ? 'Select…' : 'Select gender first'}</option>
                    {catOptions.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Fabric Platform <span className="req">*</span></label>
                  <select className="form-select" value={form.fabric_platform} onChange={e => set('fabric_platform', e.target.value)}>
                    <option value="">Select…</option>
                    {['Woven','Knit','Denim','Terry/Fleece'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Season / Drop</label>
                  <input className="form-input" value={form.season} onChange={e => set('season', e.target.value)} placeholder="e.g. June 2026" />
                </div>

                <div className="form-group">
                  <label className="form-label">Launch Collection</label>
                  <input className="form-input" value={form.collection} onChange={e => set('collection', e.target.value)} placeholder="e.g. Monsoon Edit" />
                </div>

                <div className="form-section-head">Design Details</div>

                <div className="form-group form-full">
                  <label className="form-label">Silhouette / Fit Direction</label>
                  <input className="form-input" value={form.silhouette} onChange={e => set('silhouette', e.target.value)} placeholder="e.g. Relaxed straight fit, mid-rise, cropped at ankle" />
                </div>

                <div className="form-group form-full">
                  <label className="form-label">Reference Images / Mood Board</label>
                  <input className="form-input" value={form.ref_link} onChange={e => set('ref_link', e.target.value)} placeholder="Paste Google Drive or Notion link…" />
                </div>

                <div className="form-group form-full">
                  <label className="form-label">Product Brief</label>
                  <textarea className="form-textarea" value={form.brief} onChange={e => set('brief', e.target.value)} style={{ minHeight: 110 }} placeholder="Product intent, target customer, key design decisions, fabric rationale…" />
                </div>

                <div className="form-section-head">Submission</div>

                <div className="form-group form-full">
                  <label className="form-label">Notes for Checker</label>
                  <input className="form-input" value={form.checker_notes} onChange={e => set('checker_notes', e.target.value)} placeholder="Anything specific the checker should review…" />
                </div>
              </div>
            </div>

            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-dim)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <a href="/styles" className="btn btn-ghost">Cancel</a>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editId ? 'Save Changes' : 'Create Style & Submit for Approval'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  )
}

export default function NewStylePage() {
  return <Suspense><NewStyleInner /></Suspense>
}
