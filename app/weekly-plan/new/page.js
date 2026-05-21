'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import { useToast } from '@/components/Toast'
import {
  getWeeklyPlan, getWeeklyPlanFabrics,
  createWeeklyPlan, updateWeeklyPlan,
  upsertWeeklyPlanFabric, deleteWeeklyPlanFabric,
  uploadWeeklyPlanImage,
  canEditWeeklyPlanDates,
  getMondayOf, addDays, toISODate,
  CATEGORY_OPTIONS,
} from '@/lib/supabase'

const ITEM_STATUS_BADGE = {
  draft:     'badge-grey',
  submitted: 'badge-blue',
  approved:  'badge-green',
  rejected:  'badge-red',
  cancelled: 'badge-orange',
}

const DEMOGRAPHIC_OPTIONS = [
  'Casual', 'Smart Casual', 'Festive Wear', 'Ethnic',
  'Formal', 'Semi-Formal', 'Athleisure', 'Undergarments',
]
const ADD_NEW = '__add_new__'

function localKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2)
}

// Each item is a single style cut from the parent fabric, with its
// own reference photos, reference links, and approval status.
const emptyItem = () => ({
  key: localKey(),
  status: 'draft',
  silhouette: '',
  gender: '',
  category: '',
  demographic_type: '',
  photos: [],          // UI shape: [{ url?, file? }]
  ref_links: [''],
  rejection_reason: '',
})

const emptyFabric = () => ({
  key: localKey(),
  id: null,            // DB id; null = not yet saved
  name: '',
  items: [emptyItem()],
})

function hydrateItem(raw) {
  return {
    key:              raw.id || localKey(),
    status:           raw.status           || 'draft',
    silhouette:       raw.silhouette       || '',
    gender:           raw.gender           || '',
    category:         raw.category         || '',
    demographic_type: raw.demographic_type || '',
    photos:    Array.isArray(raw.photos)    ? raw.photos.map(u => ({ url: u })) : [],
    ref_links: Array.isArray(raw.ref_links) && raw.ref_links.length ? raw.ref_links : [''],
    rejection_reason: raw.rejection_reason || '',
  }
}

function hydrateFabric(row) {
  const items = Array.isArray(row.items) && row.items.length > 0
    ? row.items.map(hydrateItem)
    : [emptyItem()]
  return {
    key:   row.id,
    id:    row.id,
    name:  row.name || '',
    items,
  }
}

function WeeklyPlanFormInner() {
  const user   = useRequireAuth()
  const toast  = useToast()
  const search = useSearchParams()
  const editId = search.get('id')

  // Default dates: this week's Monday → next Monday.
  const initialMon = getMondayOf(new Date())
  const [plan, setPlan] = useState({
    week_start_date: toISODate(initialMon),
    week_end_date:   toISODate(addDays(initialMon, 7)),
  })
  const [fabrics, setFabrics]    = useState([emptyFabric()])
  const [removedIds, setRemoved] = useState([])     // fabric DB IDs to delete on save
  const [loading, setLoading]    = useState(false)
  const [saving, setSaving]      = useState(false)

  useEffect(() => {
    if (!editId) return
    ;(async () => {
      setLoading(true)
      try {
        const p   = await getWeeklyPlan(editId)
        const fs  = await getWeeklyPlanFabrics(editId)
        setPlan({
          week_start_date:  p.week_start_date,
          week_end_date:    p.week_end_date,
        })
        setFabrics(fs.length > 0 ? fs.map(hydrateFabric) : [emptyFabric()])
      } catch (err) { toast(err.message, 'error') }
      finally       { setLoading(false) }
    })()
  }, [editId, toast])

  if (!user) return null

  const canEditDates = canEditWeeklyPlanDates(user)
  const canEditItems = ['founder','maker'].includes(user.role)
  const canReview    = ['founder','checker'].includes(user.role)

  // ── plan setters ────────────────────────────────────────────
  const setPlanField = (k, v) => setPlan(p => ({ ...p, [k]: v }))

  // ── fabric setters ──────────────────────────────────────────
  const setFabricField = (fi, k, v) => setFabrics(arr => arr.map((f, i) => i === fi ? { ...f, [k]: v } : f))

  const addFabric    = () => setFabrics(arr => [...arr, emptyFabric()])
  const removeFabric = fi => setFabrics(arr => {
    const target = arr[fi]
    if (target.id) setRemoved(r => [...r, target.id])
    return arr.filter((_, i) => i !== fi)
  })

  // ── items helpers (operate on fabrics[fi].items) ────────────
  const updateItems = (fi, fn) => setFabrics(arr => arr.map((f, i) =>
    i === fi ? { ...f, items: fn(f.items) } : f
  ))
  const addItem    = fi             => updateItems(fi, items => [...items, emptyItem()])
  const removeItem = (fi, ii)       => updateItems(fi, items => items.filter((_, i) => i !== ii))
  const setItemField = (fi, ii, k, v) => updateItems(fi, items => items.map((it, i) =>
    i === ii ? (
      k === 'gender' ? { ...it, gender: v, category: '' } : { ...it, [k]: v }
    ) : it
  ))

  // ── per-item photos ─────────────────────────────────────────
  const addItemPhotos = (fi, ii, files) => updateItems(fi, items => items.map((it, i) =>
    i === ii ? { ...it, photos: [...it.photos, ...files.map(file => ({ file }))] } : it
  ))
  const removeItemPhoto = (fi, ii, pIdx) => updateItems(fi, items => items.map((it, i) =>
    i === ii ? { ...it, photos: it.photos.filter((_, p) => p !== pIdx) } : it
  ))

  // ── per-item ref links ──────────────────────────────────────
  const setItemRefLink    = (fi, ii, lIdx, v) => updateItems(fi, items => items.map((it, i) =>
    i === ii ? { ...it, ref_links: it.ref_links.map((l, j) => j === lIdx ? v : l) } : it
  ))
  const addItemRefLink    = (fi, ii)          => updateItems(fi, items => items.map((it, i) =>
    i === ii ? { ...it, ref_links: [...it.ref_links, ''] } : it
  ))
  const removeItemRefLink = (fi, ii, lIdx)    => updateItems(fi, items => items.map((it, i) =>
    i === ii ? { ...it, ref_links: it.ref_links.filter((_, j) => j !== lIdx) } : it
  ))

  // ── persistence ─────────────────────────────────────────────
  // Persists the entire form. If `targetFi/targetIi/targetStatus` are
  // supplied, the addressed item's status is overridden to `targetStatus`
  // before saving (everyone else keeps their current status).
  const persist = async ({ targetFi = null, targetIi = null, targetStatus = null } = {}) => {
    if (!plan.week_start_date || !plan.week_end_date) {
      toast('Set both week start and end dates', 'error'); return
    }
    if (new Date(plan.week_end_date) <= new Date(plan.week_start_date)) {
      toast('Week end must be after week start', 'error'); return
    }

    setSaving(true)
    try {
      // 1. Upsert the plan (just dates).
      const planPayload = {
        week_start_date: plan.week_start_date,
        week_end_date:   plan.week_end_date,
      }
      let planId = editId
      if (editId) {
        await updateWeeklyPlan(editId, planPayload)
      } else {
        const created = await createWeeklyPlan({ ...planPayload, created_by: user.id })
        planId = created.id
      }

      // 2. Delete removed fabrics.
      await Promise.all(removedIds.map(id => deleteWeeklyPlanFabric(id)))
      setRemoved([])

      // 3. For each fabric: upload pending item photos → upsert row.
      // Mutate the local item.status when the user clicked an action button on
      // a specific item so the UI reflects the change after save.
      let mutatedLocalCopy = null

      for (let i = 0; i < fabrics.length; i++) {
        const f = fabrics[i]

        const itemsClean = await Promise.all(f.items.map(async (it, j) => {
          const photoUrls = await Promise.all(it.photos.map(async p => {
            if (p.url) return p.url
            if (p.file) return await uploadWeeklyPlanImage(p.file, planId, f.key, it.key)
            return null
          }))
          const status = (targetFi === i && targetIi === j && targetStatus) ? targetStatus : it.status
          return {
            id:               it.key,
            status,
            silhouette:       it.silhouette       || '',
            gender:           it.gender           || '',
            category:         it.category         || '',
            demographic_type: it.demographic_type || '',
            photos:           photoUrls.filter(Boolean),
            ref_links:        it.ref_links.map(l => (l || '').trim()).filter(Boolean),
            rejection_reason: it.rejection_reason || '',
          }
        }))

        // Drop wholly-blank item rows so they don't pollute storage.
        const itemsKept = itemsClean.filter(it =>
          it.silhouette || it.gender || it.category || it.demographic_type
          || it.photos.length > 0 || it.ref_links.length > 0
        )

        // Skip wholly-blank fabrics silently.
        if (!f.name && itemsKept.length === 0) continue

        await upsertWeeklyPlanFabric({
          id:             f.id || undefined,
          weekly_plan_id: planId,
          name:           f.name || '',
          items:          itemsKept,
          sort_order:     i,
        })

        // Track local mutation so we can update React state without a refetch.
        if (targetFi === i && targetIi !== null && targetStatus) {
          mutatedLocalCopy = mutatedLocalCopy || fabrics.map(x => ({ ...x, items: x.items.slice() }))
          if (mutatedLocalCopy[i]?.items?.[targetIi]) {
            mutatedLocalCopy[i].items[targetIi] = {
              ...mutatedLocalCopy[i].items[targetIi],
              status: targetStatus,
            }
          }
        }
      }

      if (mutatedLocalCopy) setFabrics(mutatedLocalCopy)

      const successMsg = !targetStatus ? 'Plan saved ✓'
        : targetStatus === 'submitted' ? 'Item submitted for approval ✓'
        : targetStatus === 'cancelled' ? 'Item cancelled / on hold'
        : targetStatus === 'draft'     ? 'Item saved as draft ✓'
        : targetStatus === 'approved'  ? 'Item approved'
        : targetStatus === 'rejected'  ? 'Item rejected'
        : 'Saved ✓'
      toast(successMsg, targetStatus === 'cancelled' ? 'info' : 'success')
    } catch (err) { toast(err.message, 'error') }
    finally       { setSaving(false) }
  }

  if (loading) return (
    <AppShell title="Weekly Plan" subtitle="Loading…">
      <div className="spinner-wrap"><div className="spinner"/></div>
    </AppShell>
  )

  return (
    <AppShell
      title={editId ? 'Edit Weekly Plan' : 'New Weekly Plan'}
      subtitle="One plan per Monday-to-Monday window"
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <a href="/weekly-plan" className="btn btn-ghost btn-sm" style={{ marginBottom: 20, display: 'inline-flex' }}>← Back to Weekly Plans</a>

        {/* ── Plan header ───────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700 }}>Week Window</div>
              {!canEditDates && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t3)' }}>
                  Only admins and checkers can edit week dates
                </span>
              )}
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Week Start (Monday)</label>
                <input
                  type="date"
                  className="form-input"
                  value={plan.week_start_date}
                  disabled={!canEditDates}
                  onChange={e => {
                    const v = e.target.value
                    setPlanField('week_start_date', v)
                    if (v) setPlanField('week_end_date', toISODate(addDays(new Date(v + 'T00:00:00'), 7)))
                  }}
                />
                <div className="form-hint">Defaulted to this Monday. Editable by admins and checkers.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Week End (Next Monday)</label>
                <input
                  type="date"
                  className="form-input"
                  value={plan.week_end_date}
                  disabled={!canEditDates}
                  onChange={e => setPlanField('week_end_date', e.target.value)}
                />
                <div className="form-hint">Auto-set to start + 7 days. Override if needed.</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Fabrics (major unit) ──────────────────────────── */}
        {fabrics.map((f, fi) => (
          <FabricCard
            key={f.key}
            index={fi}
            fabric={f}
            canRemove={fabrics.length > 1}
            canEditItems={canEditItems}
            canReview={canReview}
            saving={saving}
            onSetField={(k, v) => setFabricField(fi, k, v)}
            onRemove={() => removeFabric(fi)}
            onAddItem={() => addItem(fi)}
            onRemoveItem={ii => removeItem(fi, ii)}
            onSetItemField={(ii, k, v) => setItemField(fi, ii, k, v)}
            onAddItemPhotos={(ii, files) => addItemPhotos(fi, ii, files)}
            onRemoveItemPhoto={(ii, pIdx) => removeItemPhoto(fi, ii, pIdx)}
            onSetItemRefLink={(ii, lIdx, v) => setItemRefLink(fi, ii, lIdx, v)}
            onAddItemRefLink={ii => addItemRefLink(fi, ii)}
            onRemoveItemRefLink={(ii, lIdx) => removeItemRefLink(fi, ii, lIdx)}
            onItemAction={(ii, status) => persist({ targetFi: fi, targetIi: ii, targetStatus: status })}
          />
        ))}

        {canEditItems && (
          <button type="button" className="btn btn-primary" onClick={addFabric} style={{ marginTop: 4 }}>
            + Add Fabric
          </button>
        )}
      </div>
    </AppShell>
  )
}

// ─── Fabric card (parent container, just name + items) ─────────
function FabricCard({
  index, fabric, canRemove, canEditItems, canReview, saving,
  onSetField, onRemove,
  onAddItem, onRemoveItem, onSetItemField,
  onAddItemPhotos, onRemoveItemPhoto,
  onSetItemRefLink, onAddItemRefLink, onRemoveItemRefLink,
  onItemAction,
}) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: 6,
            background: 'var(--primary-10)', color: 'var(--primary)',
            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
          }}>{index + 1}</span>
          Fabric
        </div>
        {canEditItems && canRemove && (
          <button type="button" className="btn btn-ghost btn-xs" onClick={onRemove} title="Remove fabric">✕ Remove fabric</button>
        )}
      </div>

      <div className="card-body">
        <div className="form-grid">

          <div className="form-group form-full">
            <label className="form-label">Fabric Name</label>
            <input className="form-input" value={fabric.name}
              onChange={e => onSetField('name', e.target.value)}
              placeholder="e.g. Cotton Flax 80/20" />
          </div>

          {/* ── Items under this fabric ─────────────────────── */}
          <div className="form-section-head">Items in this fabric</div>

          <div className="form-full" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {fabric.items.map((it, ii) => (
              <ItemRow
                key={it.key}
                index={ii}
                item={it}
                canRemove={fabric.items.length > 1}
                canEditItems={canEditItems}
                canReview={canReview}
                saving={saving}
                onSetField={(k, v) => onSetItemField(ii, k, v)}
                onRemove={() => onRemoveItem(ii)}
                onAddPhotos={files => onAddItemPhotos(ii, files)}
                onRemovePhoto={pIdx => onRemoveItemPhoto(ii, pIdx)}
                onSetRefLink={(lIdx, v) => onSetItemRefLink(ii, lIdx, v)}
                onAddRefLink={() => onAddItemRefLink(ii)}
                onRemoveRefLink={lIdx => onRemoveItemRefLink(ii, lIdx)}
                onAction={status => onItemAction(ii, status)}
              />
            ))}

            {canEditItems && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onAddItem}>
                + Add Item
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Item row (style cut from this fabric, with own refs) ──────
function ItemRow({
  index, item, canRemove, canEditItems, canReview, saving,
  onSetField, onRemove,
  onAddPhotos, onRemovePhoto,
  onSetRefLink, onAddRefLink, onRemoveRefLink,
  onAction,
}) {
  const catOptions = item.gender ? (CATEGORY_OPTIONS[item.gender] || []) : []
  const [demoCustom, setDemoCustom] = useState(
    !!item.demographic_type && !DEMOGRAPHIC_OPTIONS.includes(item.demographic_type)
  )

  const isCancelled  = item.status === 'cancelled'
  const isApproved   = item.status === 'approved'
  const isSubmitted  = item.status === 'submitted'

  // Approved/submitted/cancelled items are locked for makers.
  // Cancelled items show a Re-open action that returns them to draft.
  const showSaveDraft = !isApproved && !isCancelled
  const showSubmit    = canEditItems && (item.status === 'draft' || item.status === 'rejected')
  const showCancel    = canEditItems && !isCancelled
  const showReopen    = canEditItems && isCancelled
  const showApprove   = canReview && isSubmitted
  const showReject    = canReview && isSubmitted

  const inputDisabled = !canEditItems || isApproved || isSubmitted || isCancelled

  return (
    <div style={{
      border: '1px solid var(--border-dim)', borderRadius: 10, padding: 14,
      background: isCancelled ? 'var(--surface)' : 'var(--raised)',
      opacity: isCancelled ? 0.65 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700,
          letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t3)',
        }}>Item {index + 1}</span>
        <span className={`badge ${ITEM_STATUS_BADGE[item.status] || 'badge-grey'}`}>{item.status}</span>
        {canEditItems && canRemove && item.status === 'draft' && (
          <button type="button" className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }} onClick={onRemove} title="Remove item">✕</button>
        )}
      </div>

      {item.status === 'rejected' && item.rejection_reason && (
        <div style={{
          marginBottom: 12, padding: '8px 12px',
          background: 'var(--red-10)', border: '1px solid rgba(201,69,69,.2)',
          borderRadius: 'var(--r-sm)', fontSize: 11.5, color: 'var(--red)',
        }}>
          <strong>Rejected:</strong> {item.rejection_reason}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Silhouette</label>
          <input className="form-input" value={item.silhouette}
            disabled={inputDisabled}
            onChange={e => onSetField('silhouette', e.target.value)}
            placeholder="e.g. Relaxed straight, cropped at ankle" />
        </div>

        <div className="form-group">
          <label className="form-label">Gender</label>
          <select className="form-select" value={item.gender}
            disabled={inputDisabled}
            onChange={e => onSetField('gender', e.target.value)}>
            <option value="">Select…</option>
            {['Women','Men','Unisex'].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Category</label>
          <select className="form-select" value={item.category}
            disabled={inputDisabled || !item.gender}
            onChange={e => onSetField('category', e.target.value)}>
            <option value="">{item.gender ? 'Select…' : 'Select gender first'}</option>
            {catOptions.map(o => <option key={o}>{o}</option>)}
          </select>
        </div>

        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Demographic Type</label>
          <select
            className="form-select"
            value={demoCustom ? ADD_NEW : item.demographic_type}
            disabled={inputDisabled}
            onChange={e => {
              const v = e.target.value
              if (v === ADD_NEW) { setDemoCustom(true); onSetField('demographic_type', '') }
              else               { setDemoCustom(false); onSetField('demographic_type', v) }
            }}>
            <option value="">Select…</option>
            {DEMOGRAPHIC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            <option value={ADD_NEW}>+ Add new…</option>
          </select>
          {demoCustom && (
            <input className="form-input" style={{ marginTop: 6 }}
              value={item.demographic_type}
              disabled={inputDisabled}
              onChange={e => onSetField('demographic_type', e.target.value)}
              placeholder="Type a new demographic…" autoFocus />
          )}
        </div>

        {/* ── Reference Photos (per item) ────────────────── */}
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Reference Photos</label>
          <PhotoGrid
            photos={item.photos}
            disabled={inputDisabled}
            onAdd={onAddPhotos}
            onRemove={onRemovePhoto}
          />
          <div className="form-hint">Add as many as you like. Each is auto-resized to ~1600px and re-encoded as JPEG.</div>
        </div>

        {/* ── Reference Links (per item) ────────────────── */}
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label className="form-label">Reference Links</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {item.ref_links.map((link, lIdx) => (
              <div key={lIdx} style={{ display: 'flex', gap: 6 }}>
                <input className="form-input" value={link}
                  disabled={inputDisabled}
                  onChange={e => onSetRefLink(lIdx, e.target.value)}
                  placeholder="Pinterest / competitor URL…"
                  style={{ flex: 1 }} />
                {!inputDisabled && item.ref_links.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => onRemoveRefLink(lIdx)}>✕</button>
                )}
              </div>
            ))}
            {!inputDisabled && (
              <button type="button" className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-start' }} onClick={onAddRefLink}>
                + Add Link
              </button>
            )}
          </div>
        </div>

      </div>

      {/* ── Per-item action bar ───────────────────────────── */}
      <div style={{
        marginTop: 14, paddingTop: 12,
        borderTop: '1px solid var(--border-dim)',
        display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap',
      }}>
        {showCancel && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={saving}
            onClick={() => onAction('cancelled')}
            title="Hold / Cancel this style (universal exit per the doc)"
          >Cancel / Hold</button>
        )}
        {showReopen && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={saving}
            onClick={() => onAction('draft')}
            title="Re-open this style — moves it back to draft"
          >Re-open</button>
        )}
        {showSaveDraft && canEditItems && !isCancelled && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={saving}
            onClick={() => onAction('draft')}
          >{saving ? 'Saving…' : 'Save Draft'}</button>
        )}
        {showSubmit && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saving}
            onClick={() => onAction('submitted')}
          >{saving ? 'Submitting…' : 'Submit for Approval'}</button>
        )}
        {showReject && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={saving}
            onClick={() => onAction('rejected')}
          >Reject</button>
        )}
        {showApprove && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={saving}
            onClick={() => onAction('approved')}
          >Approve</button>
        )}
      </div>
    </div>
  )
}

// ─── Photo grid ────────────────────────────────────────────────
function PhotoGrid({ photos, disabled, onAdd, onRemove }) {
  return (
    <div style={{
      display: 'grid', gap: 10,
      gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
      border: '1px dashed var(--border)', borderRadius: 8, padding: 10,
      background: 'var(--surface)',
    }}>
      {photos.map((p, i) => {
        const src = p.url || (p.file ? URL.createObjectURL(p.file) : null)
        return (
          <div key={i} style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', background: 'var(--raised)' }}>
            {src && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
            {!disabled && (
              <button type="button" onClick={() => onRemove(i)} title="Remove"
                style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 22, height: 22, borderRadius: '50%',
                  border: 'none', cursor: 'pointer',
                  background: 'rgba(9,9,12,.78)', color: '#fff',
                  fontSize: 11, lineHeight: '22px', padding: 0,
                }}>✕</button>
            )}
          </div>
        )
      })}
      {!disabled && (
        <label style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          aspectRatio: '1', borderRadius: 6, cursor: 'pointer',
          border: '1px dashed var(--border)', background: 'var(--raised)',
          color: 'var(--t2)', fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
          textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
        }}>
          + Add
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              const picked = Array.from(e.target.files || [])
              if (picked.length) onAdd(picked)
              e.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}

export default function WeeklyPlanFormPage() {
  return <Suspense><WeeklyPlanFormInner /></Suspense>
}
