'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import {
  getStyle, createStyle, updateStyle, addAuditLog,
  generateStyleCode, CATEGORY_OPTIONS,
  getMeasurements, replaceMeasurements, uploadSpecImage,
} from '@/lib/supabase'
import { useToast } from '@/components/Toast'

const DEFAULT_SIZES = [
  { label: 'XS',  code: 'XS'  },
  { label: 'S',   code: 'S'   },
  { label: 'M',   code: 'M'   },
  { label: 'L',   code: 'L'   },
  { label: 'XL',  code: 'XL'  },
  { label: 'XXL', code: 'XXL' },
  { label: '3XL', code: '3XL' },
  { label: '4XL', code: '4XL' },
]

const STYLE_TAGS = ['CASUAL','FORMAL','SPORT','LOUNGE','PARTY']

const EMPTY_FORM = {
  // existing
  name: '', style_code: '', priority: '', gender: '', category: '',
  fabric_platform: '', season: '', collection: '', silhouette: '',
  brief: '', checker_notes: '',
  // new — spec sheet header
  product_description: '', product_attribute: '', fabrication: '',
  trimmings: '', washcare: '', base_size: '', style_tag: '',
  front_image_url: '', back_image_url: '',
  ref_image_urls: [],
}

function NewStyleInner() {
  const user   = useRequireAuth(['founder','maker'])
  const router = useRouter()
  const toast  = useToast()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')

  const [form, setForm]       = useState(EMPTY_FORM)
  const [sizes, setSizes]     = useState(DEFAULT_SIZES)
  const [rows, setRows]       = useState([])      // measurement rows
  const [frontFile, setFront] = useState(null)
  const [backFile,  setBack]  = useState(null)
  const [refFiles,  setRefFiles] = useState([])   // pending mood-board files (not yet uploaded)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    if (!editId) return
    (async () => {
      const s = await getStyle(editId)
      setForm({
        name: s.name || '', style_code: s.style_code || '', priority: s.priority || '',
        gender: s.gender || '', category: s.category || '', fabric_platform: s.fabric_platform || '',
        season: s.season || '', collection: s.collection || '', silhouette: s.silhouette || '',
        brief: s.brief || '', checker_notes: s.checker_notes || '',
        product_description: s.product_description || '', product_attribute: s.product_attribute || '',
        fabrication: s.fabrication || '', trimmings: s.trimmings || '',
        washcare: s.washcare || '', base_size: s.base_size || '', style_tag: s.style_tag || '',
        front_image_url: s.front_image_url || '', back_image_url: s.back_image_url || '',
        ref_image_urls: Array.isArray(s.ref_image_urls) ? s.ref_image_urls : [],
      })
      if (Array.isArray(s.sizes) && s.sizes.length) setSizes(s.sizes)
      const m = await getMeasurements(editId)
      setRows(m.map(r => ({
        label: r.label, hindi_label: r.hindi_label || '',
        tolerance: r.tolerance || '', values: r.values || {},
      })))
    })()
  }, [editId])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const onNameChange = e => {
    const name = e.target.value
    set('name', name)
    if (!editId) set('style_code', generateStyleCode(name))
  }

  // ── size set helpers ────────────────────────────────────────
  const setSizeLabel = (i, label) => setSizes(s => s.map((x, idx) => idx === i ? { ...x, label } : x))
  const setSizeCode  = (i, code)  => setSizes(s => s.map((x, idx) => idx === i ? { ...x, code  } : x))
  const removeSize   = (i)        => setSizes(s => s.filter((_, idx) => idx !== i))
  const addSize      = ()         => setSizes(s => [...s, { label: '', code: '' }])

  // ── measurement row helpers ─────────────────────────────────
  const addRow = () => setRows(r => [...r, { label: '', hindi_label: '', tolerance: '', values: {} }])
  const removeRow = i => setRows(r => r.filter((_, idx) => idx !== i))
  const moveRow = (i, dir) => setRows(r => {
    const j = i + dir
    if (j < 0 || j >= r.length) return r
    const copy = r.slice()
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    return copy
  })
  const setRowField = (i, k, v) => setRows(r => r.map((x, idx) => idx === i ? { ...x, [k]: v } : x))
  const setRowValue = (i, sizeLabel, v) => setRows(r => r.map((x, idx) => {
    if (idx !== i) return x
    const values = { ...x.values }
    if (v === '' || v == null) delete values[sizeLabel]
    else values[sizeLabel] = v
    return { ...x, values }
  }))

  const handleSubmit = async e => {
    e.preventDefault()
    const { name, priority, gender, category, fabric_platform } = form
    if (!name || !priority || !gender || !category || !fabric_platform) {
      toast('Please fill all required fields', 'error'); return
    }
    setSaving(true)
    try {
      const cleanSizes = sizes.filter(s => s.label?.trim()).map(s => ({
        label: s.label.trim(), code: (s.code || s.label).trim(),
      }))
      const cleanRows = rows.filter(r => r.label?.trim())

      const basePayload = { ...form, sizes: cleanSizes }

      let styleId = editId
      if (editId) {
        await updateStyle(editId, { ...basePayload, approval_status: 'pending' })
      } else {
        const created = await createStyle({
          ...basePayload, maker_id: user.id,
          stage: 'Style Creation', approval_status: 'pending',
        })
        styleId = created.id
      }

      // Upload images (if new files selected), then patch URLs onto the style.
      const updates = {}
      if (frontFile) updates.front_image_url = await uploadSpecImage(frontFile, styleId, 'front')
      if (backFile)  updates.back_image_url  = await uploadSpecImage(backFile,  styleId, 'back')
      if (refFiles.length) {
        const newUrls = await Promise.all(
          refFiles.map(f => uploadSpecImage(f, styleId, 'ref'))
        )
        updates.ref_image_urls = [...(form.ref_image_urls || []), ...newUrls.filter(Boolean)]
      } else {
        // No new files but the user may have removed some existing ones; persist current list.
        updates.ref_image_urls = form.ref_image_urls || []
      }
      if (Object.keys(updates).length) await updateStyle(styleId, updates)

      await replaceMeasurements(styleId, cleanRows)

      await addAuditLog(
        styleId,
        editId ? `Style updated by ${user.full_name}` : `Style created by ${user.full_name}`,
        user.id,
      )
      toast(editId ? 'Style updated and resubmitted for approval ✓' : 'Style created and submitted for approval ✓', 'success')
      setTimeout(() => router.push('/styles'), 800)
    } catch(err) { toast(err.message, 'error') }
    finally { setSaving(false) }
  }

  if (!user) return null
  const catOptions = form.gender ? (CATEGORY_OPTIONS[form.gender] || []) : []

  return (
    <AppShell title={editId ? 'Edit Style' : 'New Style'} subtitle={editId ? 'Update and resubmit for approval' : 'Initiate a new style into the pipeline'}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <a href="/styles" className="btn btn-ghost btn-sm" style={{ marginBottom: 20, display: 'inline-flex' }}>← Back to Styles</a>

        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="card-body">
              <div className="form-grid">

                {/* ── Basic Information ─────────────────────────── */}
                <div className="form-section-head">Basic Information</div>

                <div className="form-group form-full">
                  <label className="form-label">Product Name <span className="req">*</span></label>
                  <input className="form-input" value={form.name} onChange={onNameChange} placeholder="e.g. Saadaa Airy Linen Flared Shirt Dress" />
                  <div className="form-hint">Use the full descriptive name — style code is auto-generated from this</div>
                </div>

                <div className="form-group">
                  <label className="form-label">SKU Code (auto)</label>
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
                  <select className="form-select" value={form.gender} onChange={e => { set('gender', e.target.value); set('category', '') }}>
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

                <div className="form-group">
                  <label className="form-label">Style Tag</label>
                  <select className="form-select" value={form.style_tag} onChange={e => set('style_tag', e.target.value)}>
                    <option value="">Select…</option>
                    {STYLE_TAGS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Base Size Range</label>
                  <input className="form-input" value={form.base_size} onChange={e => set('base_size', e.target.value)} placeholder="e.g. XS – 4XL" />
                </div>

                {/* ── Spec Sheet — Product Details ──────────────── */}
                <div className="form-section-head">Spec Sheet — Product Details</div>

                <div className="form-group form-full">
                  <label className="form-label">Product Description</label>
                  <input className="form-input" value={form.product_description} onChange={e => set('product_description', e.target.value)} placeholder="e.g. Airy Linen Flared Shirt Dress" />
                </div>

                <div className="form-group form-full">
                  <label className="form-label">Product Attribute</label>
                  <input className="form-input" value={form.product_attribute} onChange={e => set('product_attribute', e.target.value)} placeholder="e.g. Casual fit with 3/4 sleeve, 2 pockets" />
                </div>

                <div className="form-group">
                  <label className="form-label">Fabrication</label>
                  <input className="form-input" value={form.fabrication} onChange={e => set('fabrication', e.target.value)} placeholder="e.g. Cotton Flax 80 – 20" />
                </div>

                <div className="form-group">
                  <label className="form-label">Washcare Label</label>
                  <input className="form-input" value={form.washcare} onChange={e => set('washcare', e.target.value)} placeholder="e.g. Cotton Linen Blend" />
                </div>

                <div className="form-group form-full">
                  <label className="form-label">Trimmings</label>
                  <input className="form-input" value={form.trimmings} onChange={e => set('trimmings', e.target.value)} placeholder="e.g. Thread, fabric, 4 Hole Chalk Button" />
                </div>

                {/* ── Front / Back images ───────────────────────── */}
                <div className="form-section-head">Front & Back Images</div>

                <ImageField
                  side="front"
                  url={form.front_image_url}
                  file={frontFile}
                  onFile={setFront}
                  onClearUrl={() => set('front_image_url', '')}
                />
                <ImageField
                  side="back"
                  url={form.back_image_url}
                  file={backFile}
                  onFile={setBack}
                  onClearUrl={() => set('back_image_url', '')}
                />

                {/* ── Size set ─────────────────────────────────── */}
                <div className="form-section-head">Size Set</div>

                <div className="form-full" style={{ overflowX: 'auto', border: '1px solid var(--border-dim)', borderRadius: 8, padding: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '8px 6px' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Size Label</th>
                        <th style={thStyle}>Ecommerce Portal Code</th>
                        <th style={{ ...thStyle, width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sizes.map((s, i) => (
                        <tr key={i}>
                          <td><input className="form-input" style={{ padding: '6px 10px', fontSize: 13 }} value={s.label} onChange={e => setSizeLabel(i, e.target.value)} placeholder="XS" /></td>
                          <td><input className="form-input" style={{ padding: '6px 10px', fontSize: 13 }} value={s.code}  onChange={e => setSizeCode(i, e.target.value)}  placeholder="XS or 28" /></td>
                          <td><button type="button" className="btn btn-ghost btn-xs" onClick={() => removeSize(i)} title="Remove size">✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={addSize}>+ Add size</button>
                  <div className="form-hint" style={{ marginTop: 6 }}>The sizes here become the columns in the measurement table below.</div>
                </div>

                {/* ── Measurements ─────────────────────────────── */}
                <div className="form-section-head">Measurements</div>

                <div className="form-full" style={{ overflowX: 'auto', border: '1px solid var(--border-dim)', borderRadius: 8, padding: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '6px 4px', minWidth: 800 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: 30 }}>#</th>
                        <th style={thStyle}>Measurement</th>
                        <th style={thStyle}>Hindi Label</th>
                        <th style={{ ...thStyle, width: 100 }}>Tolerance</th>
                        {sizes.filter(s => s.label?.trim()).map(s => (
                          <th key={s.label} style={{ ...thStyle, width: 80, textAlign: 'center' }}>{s.label}</th>
                        ))}
                        <th style={{ ...thStyle, width: 60 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr><td colSpan={5 + sizes.filter(s => s.label?.trim()).length} style={{ textAlign: 'center', color: 'var(--t3)', padding: '20px 0', fontSize: 13 }}>No measurements yet — click <em>+ Add row</em> below.</td></tr>
                      )}
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td style={{ color: 'var(--t3)', fontSize: 12, textAlign: 'center' }}>{i + 1}</td>
                          <td><input className="form-input" style={tdInput} value={r.label} onChange={e => setRowField(i, 'label', e.target.value)} placeholder="e.g. Full Length" /></td>
                          <td><input className="form-input" style={tdInput} value={r.hindi_label} onChange={e => setRowField(i, 'hindi_label', e.target.value)} placeholder="हिंदी (optional)" /></td>
                          <td><input className="form-input" style={tdInput} value={r.tolerance} onChange={e => setRowField(i, 'tolerance', e.target.value)} placeholder="0.5 / -" /></td>
                          {sizes.filter(s => s.label?.trim()).map(s => (
                            <td key={s.label}>
                              <input
                                className="form-input"
                                style={{ ...tdInput, textAlign: 'center' }}
                                value={r.values[s.label] ?? ''}
                                onChange={e => setRowValue(i, s.label, e.target.value)}
                                placeholder="—"
                              />
                            </td>
                          ))}
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => moveRow(i, -1)} title="Move up">↑</button>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => moveRow(i,  1)} title="Move down" style={{ marginLeft: 2 }}>↓</button>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => removeRow(i)} title="Remove row" style={{ marginLeft: 2 }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={addRow}>+ Add row</button>
                  <div className="form-hint" style={{ marginTop: 6 }}>Values are in inches. Leave a cell blank if the measurement doesn’t apply to that size.</div>
                </div>

                {/* ── Design + Submission ──────────────────────── */}
                <div className="form-section-head">Design Details</div>

                <div className="form-group form-full">
                  <label className="form-label">Silhouette / Fit Direction</label>
                  <input className="form-input" value={form.silhouette} onChange={e => set('silhouette', e.target.value)} placeholder="e.g. Relaxed straight fit, mid-rise, cropped at ankle" />
                </div>

                <div className="form-group form-full">
                  <label className="form-label">Reference Images / Mood Board</label>
                  <RefImages
                    urls={form.ref_image_urls}
                    files={refFiles}
                    onRemoveUrl={u => set('ref_image_urls', form.ref_image_urls.filter(x => x !== u))}
                    onRemoveFile={i => setRefFiles(fs => fs.filter((_, idx) => idx !== i))}
                    onAddFiles={files => setRefFiles(fs => [...fs, ...files])}
                  />
                  <div className="form-hint">Images are auto-resized to ~1600px and re-encoded as JPEG before upload.</div>
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

const thStyle = {
  textAlign: 'left',
  fontFamily: 'var(--font-mono)',
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  color: 'var(--t2)',
  textTransform: 'uppercase',
  padding: '4px 4px',
}

const tdInput = { padding: '6px 8px', fontSize: 13 }

function ImageField({ side, url, file, onFile, onClearUrl }) {
  const preview = file ? URL.createObjectURL(file) : url
  return (
    <div className="form-group">
      <label className="form-label">{side === 'front' ? 'Front Image' : 'Back Image'}</label>
      <div style={{
        border: '1px dashed var(--border)', borderRadius: 8, padding: 12,
        display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
        background: 'var(--raised)',
      }}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`${side} preview`} style={{ maxHeight: 220, maxWidth: '100%', objectFit: 'contain', borderRadius: 4 }} />
        ) : (
          <div style={{ color: 'var(--t3)', fontSize: 12, padding: '40px 0' }}>No {side} image yet</div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
            {preview ? 'Replace' : 'Choose file'}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => onFile(e.target.files?.[0] || null)}
            />
          </label>
          {preview && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { onFile(null); onClearUrl() }}
            >Remove</button>
          )}
        </div>
      </div>
    </div>
  )
}

function RefImages({ urls, files, onRemoveUrl, onRemoveFile, onAddFiles }) {
  const tiles = [
    ...urls.map(u => ({ key: u, src: u, kind: 'url', value: u })),
    ...files.map((f, i) => ({ key: `f-${i}`, src: URL.createObjectURL(f), kind: 'file', value: i })),
  ]
  return (
    <div style={{
      display: 'grid', gap: 10,
      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
      border: '1px dashed var(--border)', borderRadius: 8, padding: 10,
      background: 'var(--raised)',
    }}>
      {tiles.map(t => (
        <div key={t.key} style={{ position: 'relative', aspectRatio: '1', borderRadius: 6, overflow: 'hidden', background: 'var(--surface)' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <button
            type="button"
            onClick={() => t.kind === 'url' ? onRemoveUrl(t.value) : onRemoveFile(t.value)}
            title="Remove"
            style={{
              position: 'absolute', top: 4, right: 4,
              width: 24, height: 24, borderRadius: '50%',
              border: 'none', cursor: 'pointer',
              background: 'rgba(9,9,12,.78)', color: '#fff',
              fontSize: 12, lineHeight: '24px', padding: 0,
            }}
          >✕</button>
        </div>
      ))}
      <label style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        aspectRatio: '1', borderRadius: 6, cursor: 'pointer',
        border: '1px dashed var(--border)', background: 'var(--surface)',
        color: 'var(--t2)', fontSize: 12, fontWeight: 600, letterSpacing: 0.5,
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
            if (picked.length) onAddFiles(picked)
            e.target.value = ''
          }}
        />
      </label>
    </div>
  )
}

export default function NewStylePage() {
  return <Suspense><NewStyleInner /></Suspense>
}
