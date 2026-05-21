'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import { useToast } from '@/components/Toast'
import {
  getWeeklyPlan, getWeeklyPlanEntries,
  createWeeklyPlan, updateWeeklyPlan,
  upsertWeeklyPlanEntry, deleteWeeklyPlanEntry,
  uploadWeeklyPlanImage,
  canEditWeeklyPlanDates,
  getMondayOf, addDays, toISODate,
  CATEGORY_OPTIONS,
} from '@/lib/supabase'

const STATUS_BADGE = {
  draft:     'badge-grey',
  submitted: 'badge-blue',
  approved:  'badge-green',
  rejected:  'badge-red',
}

const DEMOGRAPHIC_OPTIONS = [
  'Casual', 'Smart Casual', 'Festive Wear', 'Ethnic',
  'Formal', 'Semi-Formal', 'Athleisure', 'Undergarments',
]
const ADD_NEW = '__add_new__'

const emptyFabric = () => ({
  key: cryptoRandom(),
  name: '',
  photos: [],       // [{ url?: string, file?: File }]
  ref_links: [''],  // start with one empty input for UX
})

const emptyEntry = () => ({
  id: null,
  silhouette: '',
  gender: '',
  category: '',
  demographic_type: '',
  fabrics: [emptyFabric()],
})

function cryptoRandom() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2)
}

// Hydrate raw DB fabrics ([{ name, photos:[url], ref_links:[url] }])
// into UI-shape with { key, name, photos:[{url}], ref_links:[string] }.
function hydrateFabrics(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [emptyFabric()]
  return raw.map(f => ({
    key: f.id || cryptoRandom(),
    name: f.name || '',
    photos: Array.isArray(f.photos) ? f.photos.map(u => ({ url: u })) : [],
    ref_links: Array.isArray(f.ref_links) && f.ref_links.length ? f.ref_links : [''],
  }))
}

function WeeklyPlanFormInner() {
  const user   = useRequireAuth()
  const router = useRouter()
  const toast  = useToast()
  const search = useSearchParams()
  const editId = search.get('id')

  // Initialize dates: this Monday → next Monday.
  const initialMon = getMondayOf(new Date())
  const [plan, setPlan] = useState({
    week_start_date: toISODate(initialMon),
    week_end_date:   toISODate(addDays(initialMon, 7)),
    status: 'draft',
    rejection_reason: '',
    creator: null,
    approver: null,
  })
  const [entries, setEntries]     = useState([emptyEntry()])
  const [removedIds, setRemoved]  = useState([])   // entry IDs to delete on save
  const [loading, setLoading]     = useState(false)
  const [saving, setSaving]       = useState(false)

  useEffect(() => {
    if (!editId) return
    ;(async () => {
      setLoading(true)
      try {
        const p = await getWeeklyPlan(editId)
        const es = await getWeeklyPlanEntries(editId)
        setPlan({
          week_start_date: p.week_start_date,
          week_end_date:   p.week_end_date,
          status:          p.status,
          rejection_reason: p.rejection_reason || '',
          creator:         p.creator,
          approver:        p.approver,
        })
        setEntries(es.length > 0 ? es.map(e => ({
          id: e.id,
          silhouette:       e.silhouette       || '',
          gender:           e.gender           || '',
          category:         e.category         || '',
          demographic_type: e.demographic_type || '',
          fabrics:          hydrateFabrics(e.fabrics),
        })) : [emptyEntry()])
      } catch (err) { toast(err.message, 'error') }
      finally       { setLoading(false) }
    })()
  }, [editId])

  if (!user) return null

  const canEditDates = canEditWeeklyPlanDates(user)
  const canSubmit    = ['founder','maker'].includes(user.role)
  const isReadOnly   = plan.status === 'approved' && user.role !== 'founder'

  // ── plan setters ────────────────────────────────────────────
  const setPlanField = (k, v) => setPlan(p => ({ ...p, [k]: v }))

  // ── entry setters ───────────────────────────────────────────
  const setEntryField = (i, k, v) => setEntries(arr => arr.map((e, idx) => idx === i ? { ...e, [k]: v } : e))

  const addEntry    = () => setEntries(arr => [...arr, emptyEntry()])
  const removeEntry = i => setEntries(arr => {
    const target = arr[i]
    if (target.id) setRemoved(r => [...r, target.id])
    return arr.filter((_, idx) => idx !== i)
  })

  // ── fabric setters ──────────────────────────────────────────
  const updateFabrics = (entryIdx, fn) => setEntries(arr => arr.map((e, idx) =>
    idx === entryIdx ? { ...e, fabrics: fn(e.fabrics) } : e
  ))
  const addFabric    = entryIdx        => updateFabrics(entryIdx, fs => [...fs, emptyFabric()])
  const removeFabric = (entryIdx, fIdx) => updateFabrics(entryIdx, fs => fs.filter((_, i) => i !== fIdx))
  const setFabricField = (entryIdx, fIdx, k, v) => updateFabrics(entryIdx, fs => fs.map((f, i) =>
    i === fIdx ? { ...f, [k]: v } : f
  ))

  // ── photo helpers ───────────────────────────────────────────
  const addPhotos = (entryIdx, fIdx, files) => updateFabrics(entryIdx, fs => fs.map((f, i) =>
    i === fIdx ? { ...f, photos: [...f.photos, ...files.map(file => ({ file }))] } : f
  ))
  const removePhoto = (entryIdx, fIdx, photoIdx) => updateFabrics(entryIdx, fs => fs.map((f, i) =>
    i === fIdx ? { ...f, photos: f.photos.filter((_, p) => p !== photoIdx) } : f
  ))

  // ── ref link helpers ────────────────────────────────────────
  const setRefLink = (entryIdx, fIdx, linkIdx, v) => updateFabrics(entryIdx, fs => fs.map((f, i) =>
    i === fIdx ? { ...f, ref_links: f.ref_links.map((l, j) => j === linkIdx ? v : l) } : f
  ))
  const addRefLink    = (entryIdx, fIdx)             => updateFabrics(entryIdx, fs => fs.map((f, i) =>
    i === fIdx ? { ...f, ref_links: [...f.ref_links, ''] } : f
  ))
  const removeRefLink = (entryIdx, fIdx, linkIdx)    => updateFabrics(entryIdx, fs => fs.map((f, i) =>
    i === fIdx ? { ...f, ref_links: f.ref_links.filter((_, j) => j !== linkIdx) } : f
  ))

  // ── persistence ─────────────────────────────────────────────
  const persist = async (nextStatus) => {
    if (!plan.week_start_date || !plan.week_end_date) {
      toast('Set both week start and end dates', 'error'); return
    }
    if (new Date(plan.week_end_date) <= new Date(plan.week_start_date)) {
      toast('Week end must be after week start', 'error'); return
    }
    setSaving(true)
    try {
      // 1. Upsert the plan.
      const planPayload = {
        week_start_date: plan.week_start_date,
        week_end_date:   plan.week_end_date,
        status:          nextStatus || plan.status,
      }
      let planId = editId
      if (editId) {
        await updateWeeklyPlan(editId, planPayload)
      } else {
        const created = await createWeeklyPlan({ ...planPayload, created_by: user.id })
        planId = created.id
      }

      // 2. Delete removed entries.
      await Promise.all(removedIds.map(id => deleteWeeklyPlanEntry(id)))
      setRemoved([])

      // 3. Upload photos + upsert entries (sequential per entry, parallel within).
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i]
        if (!e.silhouette && !e.gender && !e.category && !e.demographic_type
            && e.fabrics.every(f => !f.name && f.photos.length === 0 && f.ref_links.every(l => !l.trim()))) {
          // Skip wholly-blank entries silently.
          continue
        }

        const fabricsClean = await Promise.all(e.fabrics.map(async (f) => {
          const photoUrls = await Promise.all(f.photos.map(async (p) => {
            if (p.url) return p.url
            if (p.file) return await uploadWeeklyPlanImage(p.file, planId, e.id || `entry-${i}`, f.key)
            return null
          }))
          return {
            id:        f.key,
            name:      f.name || '',
            photos:    photoUrls.filter(Boolean),
            ref_links: f.ref_links.map(l => l.trim()).filter(Boolean),
          }
        }))

        await upsertWeeklyPlanEntry({
          id:               e.id || undefined,
          weekly_plan_id:   planId,
          silhouette:       e.silhouette,
          gender:           e.gender,
          category:         e.category,
          demographic_type: e.demographic_type,
          fabrics:          fabricsClean,
          sort_order:       i,
        })
      }

      toast(nextStatus === 'submitted'
        ? 'Plan submitted for approval ✓'
        : 'Plan saved ✓', 'success')
      setTimeout(() => router.push('/weekly-plan'), 700)
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

        {/* ── Plan header ────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700 }}>Week Window</div>
              <span className={`badge ${STATUS_BADGE[plan.status] || 'badge-grey'}`} style={{ marginLeft: 12 }}>{plan.status}</span>
              {!canEditDates && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t3)' }}>
                  🔒 Only founders & Sadiqji can edit week dates
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
                  disabled={!canEditDates || isReadOnly}
                  onChange={e => {
                    const v = e.target.value
                    setPlanField('week_start_date', v)
                    // auto-adjust end to +7 if user shifts start
                    if (v) setPlanField('week_end_date', toISODate(addDays(new Date(v + 'T00:00:00'), 7)))
                  }}
                />
                <div className="form-hint">Defaulted to this Monday. Editable by founders + Sadiqji.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Week End (Next Monday)</label>
                <input
                  type="date"
                  className="form-input"
                  value={plan.week_end_date}
                  disabled={!canEditDates || isReadOnly}
                  onChange={e => setPlanField('week_end_date', e.target.value)}
                />
                <div className="form-hint">Auto-set to start + 7 days. Override if needed.</div>
              </div>
            </div>

            {plan.rejection_reason && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--red-10)', border: '1px solid rgba(201,69,69,.2)', borderRadius: 'var(--r-sm)', fontSize: 12, color: 'var(--red)' }}>
                <strong>Rejection reason:</strong> {plan.rejection_reason}
              </div>
            )}
          </div>
        </div>

        {/* ── Entries ────────────────────────────────────────── */}
        {entries.map((e, i) => (
          <EntryCard
            key={e.id || `new-${i}`}
            index={i}
            entry={e}
            disabled={isReadOnly}
            onChangeField={(k, v) => setEntryField(i, k, v)}
            onRemove={() => removeEntry(i)}
            onAddFabric={() => addFabric(i)}
            onRemoveFabric={fIdx => removeFabric(i, fIdx)}
            onSetFabricField={(fIdx, k, v) => setFabricField(i, fIdx, k, v)}
            onAddPhotos={(fIdx, files) => addPhotos(i, fIdx, files)}
            onRemovePhoto={(fIdx, pIdx) => removePhoto(i, fIdx, pIdx)}
            onSetRefLink={(fIdx, lIdx, v) => setRefLink(i, fIdx, lIdx, v)}
            onAddRefLink={fIdx => addRefLink(i, fIdx)}
            onRemoveRefLink={(fIdx, lIdx) => removeRefLink(i, fIdx, lIdx)}
          />
        ))}

        {!isReadOnly && (
          <button type="button" className="btn btn-ghost" onClick={addEntry} style={{ marginTop: 4 }}>
            + Add Entry
          </button>
        )}

        {/* ── Footer actions ─────────────────────────────────── */}
        {!isReadOnly && (
          <div style={{ marginTop: 28, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <a href="/weekly-plan" className="btn btn-ghost">Cancel</a>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={saving}
              onClick={() => persist('draft')}
            >{saving ? 'Saving…' : 'Save Draft'}</button>
            {canSubmit && plan.status !== 'submitted' && plan.status !== 'approved' && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => persist('submitted')}
              >{saving ? 'Saving…' : 'Submit for Approval'}</button>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}

// ─── Entry card ────────────────────────────────────────────────
function EntryCard({
  index, entry, disabled,
  onChangeField, onRemove,
  onAddFabric, onRemoveFabric, onSetFabricField,
  onAddPhotos, onRemovePhoto,
  onSetRefLink, onAddRefLink, onRemoveRefLink,
}) {
  const catOptions = entry.gender ? (CATEGORY_OPTIONS[entry.gender] || []) : []
  const [demoCustom, setDemoCustom] = useState(
    entry.demographic_type && !DEMOGRAPHIC_OPTIONS.includes(entry.demographic_type)
  )

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title">Entry {index + 1}</div>
        {!disabled && (
          <button type="button" className="btn btn-ghost btn-xs" onClick={onRemove} title="Remove entry">✕ Remove entry</button>
        )}
      </div>
      <div className="card-body">
        <div className="form-grid">

          <div className="form-group">
            <label className="form-label">Silhouette</label>
            <input className="form-input" value={entry.silhouette}
              disabled={disabled}
              onChange={e => onChangeField('silhouette', e.target.value)}
              placeholder="e.g. Relaxed straight, cropped at ankle" />
          </div>

          <div className="form-group">
            <label className="form-label">Gender</label>
            <select className="form-select" value={entry.gender}
              disabled={disabled}
              onChange={e => { onChangeField('gender', e.target.value); onChangeField('category', '') }}>
              <option value="">Select…</option>
              {['Women','Men','Unisex'].map(o => <option key={o}>{o}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-select" value={entry.category}
              disabled={disabled || !entry.gender}
              onChange={e => onChangeField('category', e.target.value)}>
              <option value="">{entry.gender ? 'Select…' : 'Select gender first'}</option>
              {catOptions.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Demographic Type</label>
            <select
              className="form-select"
              value={demoCustom ? ADD_NEW : entry.demographic_type}
              disabled={disabled}
              onChange={e => {
                const v = e.target.value
                if (v === ADD_NEW) { setDemoCustom(true); onChangeField('demographic_type', '') }
                else               { setDemoCustom(false); onChangeField('demographic_type', v) }
              }}>
              <option value="">Select…</option>
              {DEMOGRAPHIC_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              <option value={ADD_NEW}>+ Add new…</option>
            </select>
            {demoCustom && (
              <input className="form-input" style={{ marginTop: 6 }}
                value={entry.demographic_type}
                disabled={disabled}
                onChange={e => onChangeField('demographic_type', e.target.value)}
                placeholder="Type a new demographic…" autoFocus />
            )}
          </div>

          {/* ── Fabrics ──────────────────────────────────── */}
          <div className="form-section-head">Fabrics</div>

          <div className="form-full" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {entry.fabrics.map((f, fIdx) => (
              <FabricBlock
                key={f.key}
                index={fIdx}
                fabric={f}
                disabled={disabled}
                canRemove={entry.fabrics.length > 1}
                onSetField={(k, v) => onSetFabricField(fIdx, k, v)}
                onRemove={() => onRemoveFabric(fIdx)}
                onAddPhotos={files => onAddPhotos(fIdx, files)}
                onRemovePhoto={pIdx => onRemovePhoto(fIdx, pIdx)}
                onSetRefLink={(lIdx, v) => onSetRefLink(fIdx, lIdx, v)}
                onAddRefLink={() => onAddRefLink(fIdx)}
                onRemoveRefLink={lIdx => onRemoveRefLink(fIdx, lIdx)}
              />
            ))}
            {!disabled && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onAddFabric}>
                + Add Fabric
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Fabric block ──────────────────────────────────────────────
function FabricBlock({
  index, fabric, disabled, canRemove,
  onSetField, onRemove,
  onAddPhotos, onRemovePhoto,
  onSetRefLink, onAddRefLink, onRemoveRefLink,
}) {
  return (
    <div style={{
      border: '1px solid var(--border-dim)', borderRadius: 10, padding: 14,
      background: 'var(--raised)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t3)' }}>
          Fabric {index + 1}
        </span>
        {!disabled && canRemove && (
          <button type="button" className="btn btn-ghost btn-xs" style={{ marginLeft: 'auto' }} onClick={onRemove}>✕</button>
        )}
      </div>

      <div className="form-group" style={{ marginBottom: 12 }}>
        <label className="form-label">Fabric Name</label>
        <input className="form-input" value={fabric.name}
          disabled={disabled}
          onChange={e => onSetField('name', e.target.value)}
          placeholder="e.g. Cotton Flax 80/20" />
      </div>

      {/* ── Photos ───────────────────────────────────────── */}
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label className="form-label">Reference Photos</label>
        <PhotoGrid
          photos={fabric.photos}
          disabled={disabled}
          onAdd={onAddPhotos}
          onRemove={onRemovePhoto}
        />
        <div className="form-hint">Add as many as you like. Each is auto-resized to ~1600px and re-encoded as JPEG.</div>
      </div>

      {/* ── Ref Links ────────────────────────────────────── */}
      <div className="form-group">
        <label className="form-label">Reference Links</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {fabric.ref_links.map((link, lIdx) => (
            <div key={lIdx} style={{ display: 'flex', gap: 6 }}>
              <input className="form-input" value={link}
                disabled={disabled}
                onChange={e => onSetRefLink(lIdx, e.target.value)}
                placeholder="Pinterest / competitor URL…"
                style={{ flex: 1 }} />
              {!disabled && fabric.ref_links.length > 1 && (
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => onRemoveRefLink(lIdx)}>✕</button>
              )}
            </div>
          ))}
          {!disabled && (
            <button type="button" className="btn btn-ghost btn-xs" style={{ alignSelf: 'flex-start' }} onClick={onAddRefLink}>
              + Add Link
            </button>
          )}
        </div>
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
