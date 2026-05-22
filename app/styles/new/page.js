'use client'

import { useEffect, useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import {
  getStyle, createStyle, updateStyle, addAuditLog,
  CATEGORY_OPTIONS,
  getMeasurements, replaceMeasurements, uploadSpecImage,
  getStyleCodeSettings, getFabrics, composeStyleCodeSegments, generateNextStyleCode,
} from '@/lib/supabase'
import { useToast } from '@/components/Toast'
import ImageField from './_components/ImageField'
import RefImages from './_components/RefImages'
import { DetailBlock } from './_components/DetailBlocks'
import { TabButton, thStyle, tdInput, tableWrap, rowNum, emptyCell } from './_components/formChrome'

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

const STYLE_TAGS = [
  'Casual', 'Smart Casual', 'Festive Wear', 'Ethnic',
  'Formal', 'Semi-Formal', 'Athleisure', 'Undergarments',
]
const ADD_NEW = '__add_new__'

const EMPTY_FORM = {
  // existing
  name: '', style_code: '', gender: '', category: '',
  fabric_platform: '', season: '', silhouette: '',
  brief: '', checker_notes: '',
  // new — spec sheet header
  product_description: '', product_attribute: '', fabrication: '',
  trimmings: '', washcare: '', base_size: '', style_tag: '',
  front_image_url: '', back_image_url: '',
  ref_image_urls: [],
  // spec sheet (Tab 2)
  construction_rows: [],   // [{component, description}]
  spi: { seams: '', stitches: '' },
  label_placement: { main: '', size: '', washcare: '', vendor_code: '' },
  fabric_specs: { fabric: '', fabric_note: '', preferred_mill: '', gsm: '', dye: '' },
  trim_rows: [],           // [{component, type, supplier, code, size, color, quantity}]
  // spec sheet 1 (detail photos)
  detail_blocks: [],       // [{left_label, left_image_url, description, right_label, right_image_url, left_file?, right_file?}]
}

function NewStyleInner() {
  const user   = useRequireAuth(['founder','maker','checker'])
  const router = useRouter()
  const toast  = useToast()
  const searchParams = useSearchParams()
  const editId = searchParams.get('id')

  const [tab, setTab]         = useState('measurement')  // 'measurement' | 'specification' | 'detail'
  const [headerOpen, setHeaderOpen] = useState(false)     // shared header visibility on Spec tab
  const [tagCustom, setTagCustom]   = useState(false)     // demographic style: typing a custom value?
  const [form, setForm]       = useState(EMPTY_FORM)
  const [sizes, setSizes]     = useState(DEFAULT_SIZES)
  const [rows, setRows]       = useState([])      // measurement rows
  const [frontFile, setFront] = useState(null)
  const [backFile,  setBack]  = useState(null)
  const [refFiles,  setRefFiles] = useState([])   // pending mood-board files (not yet uploaded)
  const [saving, setSaving]   = useState(false)
  const [codeRules, setCodeRules] = useState({ gender: [], fabric: [], silhouette: [] })

  // Load admin-managed style code rules once. Surface failures so the
  // maker can tell the admin if the migration hasn't been run.
  useEffect(() => {
    Promise.all([getStyleCodeSettings(), getFabrics({ codedOnly: true })])
      .then(([settings, fabrics]) => setCodeRules({ ...settings, fabric: fabrics }))
      .catch(err => toast(`Could not load Style Code rules: ${err.message}`, 'error'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Selected fabric's composition — shown as a read-only hint below the
  // fabric dropdown so the maker can see at-a-glance what they picked.
  const selectedFabric = useMemo(
    () => (codeRules.fabric || []).find(f => f.name?.toLowerCase() === form.fabric_platform?.toLowerCase()),
    [codeRules.fabric, form.fabric_platform],
  )

  // Build the auto-preview from current selections. The 4-letter
  // semantic prefix is computed live; the 2-letter AA-ZZ suffix is
  // assigned on save (shown here as 'AA' placeholder).
  const codePreview = useMemo(() => {
    const selections = {
      gender:      form.gender,
      fabric:      form.fabric_platform,
      silhouette:  form.silhouette,
    }
    const { ok, prefix, missing } = composeStyleCodeSegments(selections, codeRules)
    return { ok, text: ok ? `${prefix}AA` : `${prefix}??`, missing }
  }, [form.gender, form.fabric_platform, form.silhouette, codeRules])

  useEffect(() => {
    if (!editId) return
    (async () => {
      const s = await getStyle(editId)
      setForm({
        name: s.name || '', style_code: s.style_code || '',
        gender: s.gender || '', category: s.category || '', fabric_platform: s.fabric_platform || '',
        season: s.season || '', silhouette: s.silhouette || '',
        brief: s.brief || '', checker_notes: s.checker_notes || '',
        product_description: s.product_description || '', product_attribute: s.product_attribute || '',
        fabrication: s.fabrication || '', trimmings: s.trimmings || '',
        washcare: s.washcare || '', base_size: s.base_size || '', style_tag: s.style_tag || '',
        front_image_url: s.front_image_url || '', back_image_url: s.back_image_url || '',
        ref_image_urls: Array.isArray(s.ref_image_urls) ? s.ref_image_urls : [],
        construction_rows: Array.isArray(s.construction_rows) ? s.construction_rows : [],
        spi:              s.spi             && typeof s.spi             === 'object' ? s.spi             : { seams: '', stitches: '' },
        label_placement:  s.label_placement && typeof s.label_placement === 'object' ? s.label_placement : { main: '', size: '', washcare: '', vendor_code: '' },
        fabric_specs:     s.fabric_specs    && typeof s.fabric_specs    === 'object' ? s.fabric_specs    : { fabric: '', fabric_note: '', preferred_mill: '', gsm: '', dye: '' },
        trim_rows:        Array.isArray(s.trim_rows) ? s.trim_rows : [],
        detail_blocks:    Array.isArray(s.detail_blocks) ? s.detail_blocks : [],
      })
      if (Array.isArray(s.sizes) && s.sizes.length) setSizes(s.sizes)
      if (s.style_tag && !STYLE_TAGS.includes(s.style_tag)) setTagCustom(true)
      const m = await getMeasurements(editId)
      setRows(m.map(r => ({
        label: r.label, hindi_label: r.hindi_label || '',
        tolerance: r.tolerance || '', values: r.values || {},
      })))
    })()
  }, [editId])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const onNameChange = e => {
    set('name', e.target.value)
    // Style code is now derived from Gender / Category / Fabric / Silhouette /
    // Style code comes from Gender + Fabric + Silhouette, not product name.
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

  // ── generic list helpers (construction_rows, trim_rows) ─────
  const listSet = (key, fn) => setForm(f => ({ ...f, [key]: fn(f[key]) }))
  const addItem    = (key, init)   => listSet(key, arr => [...arr, init])
  const removeItem = (key, i)      => listSet(key, arr => arr.filter((_, idx) => idx !== i))
  const moveItem   = (key, i, dir) => listSet(key, arr => {
    const j = i + dir
    if (j < 0 || j >= arr.length) return arr
    const copy = arr.slice()
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    return copy
  })
  const setItemField = (key, i, k, v) => listSet(key, arr => arr.map((x, idx) => idx === i ? { ...x, [k]: v } : x))

  // ── nested object setters (spi, label_placement, fabric_specs) ─
  const setNested = (key, subKey, v) => setForm(f => ({ ...f, [key]: { ...f[key], [subKey]: v } }))

  const handleSubmit = async e => {
    e.preventDefault()
    const { name, gender, category, fabric_platform, silhouette } = form
    if (!name || !gender || !category || !fabric_platform || !silhouette) {
      toast('Please fill all required fields (incl. Silhouette)', 'error'); return
    }
    setSaving(true)
    try {
      const cleanSizes = sizes.filter(s => s.label?.trim()).map(s => ({
        label: s.label.trim(), code: (s.code || s.label).trim(),
      }))
      const cleanRows = rows.filter(r => r.label?.trim())

      // Strip File objects from detail_blocks before initial save (they don't serialize).
      const sanitizedBlocks = form.detail_blocks.map(b => ({
        left_label:      b.left_label      || '',
        left_image_url:  b.left_image_url  || '',
        description:     b.description     || '',
        right_label:     b.right_label     || '',
        right_image_url: b.right_image_url || '',
      }))

      // For new styles (or existing ones missing a code), produce a fresh
      // unique style code from the 5 admin-managed segments + counter.
      let nextCode = form.style_code
      if (!nextCode) {
        try {
          nextCode = await generateNextStyleCode({
            gender, fabric: fabric_platform, silhouette,
          })
        } catch (err) {
          toast(err.message, 'error')
          setSaving(false); return
        }
      }

      const basePayload = { ...form, style_code: nextCode, sizes: cleanSizes, detail_blocks: sanitizedBlocks }

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

      // Detail-block images (any block may have a pending left/right File).
      const hasPendingBlockImages = form.detail_blocks.some(b => b.left_file || b.right_file)
      if (hasPendingBlockImages) {
        updates.detail_blocks = await Promise.all(form.detail_blocks.map(async (b, i) => {
          const block = {
            left_label:      b.left_label      || '',
            left_image_url:  b.left_image_url  || '',
            description:     b.description     || '',
            right_label:     b.right_label     || '',
            right_image_url: b.right_image_url || '',
          }
          if (b.left_file)  block.left_image_url  = await uploadSpecImage(b.left_file,  styleId, `detail-${i}-l`)
          if (b.right_file) block.right_image_url = await uploadSpecImage(b.right_file, styleId, `detail-${i}-r`)
          return block
        }))
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

              {/* ── Tab nav ─────────────────────────────────── */}
              <div style={{
                display: 'flex', gap: 2, marginBottom: 24,
                borderBottom: '1px solid var(--border)',
              }}>
                <TabButton active={tab === 'measurement'}   onClick={() => setTab('measurement')}>Measurement Sheet</TabButton>
                <TabButton active={tab === 'specification'} onClick={() => setTab('specification')}>Specification Sheet</TabButton>
                <TabButton active={tab === 'detail'}        onClick={() => setTab('detail')}>Spec Sheet 1</TabButton>
              </div>

              <div className="form-grid">

                {tab !== 'measurement' && (
                  <button
                    type="button"
                    onClick={() => setHeaderOpen(o => !o)}
                    className="form-full"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 16px',
                      background: 'var(--raised)',
                      border: '1px solid var(--border-dim)',
                      borderRadius: 8,
                      cursor: 'pointer', textAlign: 'left',
                      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                      letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t2)',
                      transition: 'background .14s, border-color .14s',
                    }}
                  >
                    <span style={{
                      display: 'inline-block',
                      transform: headerOpen ? 'rotate(0)' : 'rotate(-90deg)',
                      transition: 'transform .15s', fontSize: 13, lineHeight: 1,
                    }}>▾</span>
                    Product Info <span style={{ color: 'var(--t3)', fontWeight: 500 }}>(from Measurement Sheet)</span>
                    <span style={{
                      marginLeft: 'auto', fontSize: 10, color: 'var(--t3)',
                      fontWeight: 500, letterSpacing: 0, textTransform: 'none',
                    }}>{headerOpen ? 'click to hide' : 'click to show'}</span>
                  </button>
                )}

                {(tab === 'measurement' || headerOpen) && <>

                {/* ── Basic Information ─────────────────────────── */}
                <div className="form-section-head">Basic Information</div>

                <div className="form-group form-full">
                  <label className="form-label">Product Name <span className="req">*</span></label>
                  <input className="form-input" value={form.name} onChange={onNameChange} placeholder="e.g. Saadaa Airy Linen Flared Shirt Dress" />
                  <div className="form-hint">Use the full descriptive name. Style code is auto-generated from the fields below.</div>
                </div>

                <div className="form-group">
                  <label className="form-label">Style Code (auto)</label>
                  <input
                    className="form-input code-field"
                    value={form.style_code || codePreview.text}
                    readOnly
                    placeholder="Will auto-generate"
                  />
                  <div className="form-hint" style={{ color: codePreview.ok || form.style_code ? 'var(--t3)' : 'var(--yellow)' }}>
                    {form.style_code
                      ? 'Locked — generated style code.'
                      : codePreview.ok
                        ? 'AA–ZZ suffix assigned on save (unique per product).'
                        : `Missing: ${codePreview.missing.join(', ')}. Configure rules at Admin → Style Code Settings.`}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Gender <span className="req">*</span></label>
                  <select className="form-select" value={form.gender} onChange={e => { set('gender', e.target.value); set('category', '') }}>
                    <option value="">Select…</option>
                    {codeRulesOptions(codeRules.gender, form.gender, ['Women','Men','Unisex']).map(o => <option key={o}>{o}</option>)}
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
                  <label className="form-label">Fabric <span className="req">*</span></label>
                  <select className="form-select" value={form.fabric_platform} onChange={e => set('fabric_platform', e.target.value)}>
                    <option value="">Select…</option>
                    {fabricOptions(codeRules.fabric, form.fabric_platform).map(o => (
                      <option key={o.name} value={o.name}>{o.name}{o.code ? ` (${o.code})` : ''}</option>
                    ))}
                  </select>
                  {selectedFabric?.composition && (
                    <div className="form-hint">Composition: {selectedFabric.composition}</div>
                  )}
                  {!selectedFabric && (codeRules.fabric || []).length === 0 && (
                    <div className="form-hint" style={{ color: 'var(--yellow)' }}>
                      No fabrics with codes yet — ask an admin to assign 2-letter codes in <strong>Style Code Settings</strong>.
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Season / Drop</label>
                  <input className="form-input" value={form.season} onChange={e => set('season', e.target.value)} placeholder="e.g. June 2026" />
                </div>

                <div className="form-group">
                  <label className="form-label">Demographic Styles</label>
                  <select
                    className="form-select"
                    value={tagCustom ? ADD_NEW : form.style_tag}
                    onChange={e => {
                      const v = e.target.value
                      if (v === ADD_NEW) { setTagCustom(true); set('style_tag', '') }
                      else               { setTagCustom(false); set('style_tag', v) }
                    }}
                  >
                    <option value="">Select…</option>
                    {STYLE_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                    <option value={ADD_NEW}>+ Add new…</option>
                  </select>
                  {tagCustom && (
                    <input
                      className="form-input"
                      style={{ marginTop: 6 }}
                      value={form.style_tag}
                      onChange={e => set('style_tag', e.target.value)}
                      placeholder="Type a new demographic style…"
                      autoFocus
                    />
                  )}
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

                </>}

                {tab === 'measurement' && <>

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

                </>}

                {tab === 'specification' && <>

                {/* ── Specification Sheet — Construction ─────── */}
                <div className="form-section-head">Construction</div>

                <div className="form-full" style={tableWrap}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '6px 4px' }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: 30 }}>#</th>
                        <th style={{ ...thStyle, width: 220 }}>Component</th>
                        <th style={thStyle}>Description</th>
                        <th style={{ ...thStyle, width: 70 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.construction_rows.length === 0 && (
                        <tr><td colSpan={4} style={emptyCell}>No components yet — click <em>+ Add component</em> below.</td></tr>
                      )}
                      {form.construction_rows.map((r, i) => (
                        <tr key={i}>
                          <td style={rowNum}>{i + 1}</td>
                          <td><input className="form-input" style={tdInput} value={r.component || ''} onChange={e => setItemField('construction_rows', i, 'component', e.target.value)} placeholder="e.g. Shoulder Finishing" /></td>
                          <td><input className="form-input" style={tdInput} value={r.description || ''} onChange={e => setItemField('construction_rows', i, 'description', e.target.value)} placeholder="e.g. Front & Back bodies stitched together with French Seam" /></td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => moveItem('construction_rows', i, -1)} title="Move up">↑</button>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => moveItem('construction_rows', i,  1)} title="Move down" style={{ marginLeft: 2 }}>↓</button>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => removeItem('construction_rows', i)} title="Remove row" style={{ marginLeft: 2 }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => addItem('construction_rows', { component: '', description: '' })}>+ Add component</button>
                </div>

                {/* ── SPI (Stitch Per Inch) ──────────────────── */}
                <div className="form-section-head">SPI — Stitch Per Inch</div>

                <div className="form-group">
                  <label className="form-label">All Seams</label>
                  <input className="form-input" value={form.spi.seams} onChange={e => setNested('spi', 'seams', e.target.value)} placeholder="e.g. 24 – 26" />
                </div>

                <div className="form-group">
                  <label className="form-label">All Stitches</label>
                  <input className="form-input" value={form.spi.stitches} onChange={e => setNested('spi', 'stitches', e.target.value)} placeholder="e.g. 26 – 28" />
                </div>

                {/* ── Label Placement ────────────────────────── */}
                <div className="form-section-head">Label Placement</div>

                <div className="form-group form-full">
                  <label className="form-label">Main Label</label>
                  <input className="form-input" value={form.label_placement.main} onChange={e => setNested('label_placement', 'main', e.target.value)} placeholder="e.g. Center back of the dress, stitched within back neck collar" />
                </div>

                <div className="form-group form-full">
                  <label className="form-label">Size Label</label>
                  <input className="form-input" value={form.label_placement.size} onChange={e => setNested('label_placement', 'size', e.target.value)} placeholder="e.g. Printed on the main label itself" />
                </div>

                <div className="form-group form-full">
                  <label className="form-label">Washcare Label</label>
                  <input className="form-input" value={form.label_placement.washcare} onChange={e => setNested('label_placement', 'washcare', e.target.value)} placeholder="e.g. Left side of dress bodice, 3 inches below from pocket" />
                </div>

                <div className="form-group form-full">
                  <label className="form-label">Vendor Code Label</label>
                  <input className="form-input" value={form.label_placement.vendor_code} onChange={e => setNested('label_placement', 'vendor_code', e.target.value)} placeholder="e.g. Left side of dress bodice with washcare label" />
                </div>

                {/* ── Fabric Specifications ──────────────────── */}
                <div className="form-section-head">Fabric Specifications</div>

                <div className="form-group">
                  <label className="form-label">Fabric</label>
                  <input className="form-input" value={form.fabric_specs.fabric} onChange={e => setNested('fabric_specs', 'fabric', e.target.value)} placeholder="e.g. Cotton Flax 80 / 20" />
                </div>

                <div className="form-group">
                  <label className="form-label">Color Fastness Note</label>
                  <input className="form-input" value={form.fabric_specs.fabric_note} onChange={e => setNested('fabric_specs', 'fabric_note', e.target.value)} placeholder="e.g. Rubbing / washing / precipitation – 4/5" />
                </div>

                <div className="form-group">
                  <label className="form-label">Preferred Mill</label>
                  <input className="form-input" value={form.fabric_specs.preferred_mill} onChange={e => setNested('fabric_specs', 'preferred_mill', e.target.value)} placeholder="e.g. Malika Arjun (Tamil Nadu)" />
                </div>

                <div className="form-group">
                  <label className="form-label">GSM</label>
                  <input className="form-input" value={form.fabric_specs.gsm} onChange={e => setNested('fabric_specs', 'gsm', e.target.value)} placeholder="e.g. 140" />
                </div>

                <div className="form-group form-full">
                  <label className="form-label">Dye Treatment</label>
                  <input className="form-input" value={form.fabric_specs.dye} onChange={e => setNested('fabric_specs', 'dye', e.target.value)} placeholder="e.g. Mercerized at 16 – 32 °C" />
                </div>

                {/* ── Trim Specifications ────────────────────── */}
                <div className="form-section-head">Trim Specifications</div>

                <div className="form-full" style={tableWrap}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '6px 4px', minWidth: 900 }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, width: 30 }}>#</th>
                        <th style={thStyle}>Component</th>
                        <th style={thStyle}>Trim Type</th>
                        <th style={thStyle}>Supplier</th>
                        <th style={{ ...thStyle, width: 100 }}>Code</th>
                        <th style={{ ...thStyle, width: 100 }}>Size</th>
                        <th style={{ ...thStyle, width: 90 }}>Color</th>
                        <th style={{ ...thStyle, width: 80 }}>Qty</th>
                        <th style={{ ...thStyle, width: 70 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.trim_rows.length === 0 && (
                        <tr><td colSpan={9} style={emptyCell}>No trims yet — click <em>+ Add trim</em> below.</td></tr>
                      )}
                      {form.trim_rows.map((r, i) => (
                        <tr key={i}>
                          <td style={rowNum}>{i + 1}</td>
                          <td><input className="form-input" style={tdInput} value={r.component || ''} onChange={e => setItemField('trim_rows', i, 'component', e.target.value)} placeholder="e.g. Buttons" /></td>
                          <td><input className="form-input" style={tdInput} value={r.type      || ''} onChange={e => setItemField('trim_rows', i, 'type',      e.target.value)} placeholder="e.g. 4 Hole Chalk Button" /></td>
                          <td><input className="form-input" style={tdInput} value={r.supplier  || ''} onChange={e => setItemField('trim_rows', i, 'supplier',  e.target.value)} placeholder="e.g. Goyal Lining House" /></td>
                          <td><input className="form-input" style={tdInput} value={r.code      || ''} onChange={e => setItemField('trim_rows', i, 'code',      e.target.value)} placeholder="—" /></td>
                          <td><input className="form-input" style={tdInput} value={r.size      || ''} onChange={e => setItemField('trim_rows', i, 'size',      e.target.value)} placeholder="e.g. 16 L" /></td>
                          <td><input className="form-input" style={tdInput} value={r.color     || ''} onChange={e => setItemField('trim_rows', i, 'color',     e.target.value)} placeholder="e.g. RAW" /></td>
                          <td><input className="form-input" style={{ ...tdInput, textAlign: 'center' }} value={r.quantity || ''} onChange={e => setItemField('trim_rows', i, 'quantity', e.target.value)} placeholder="—" /></td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => moveItem('trim_rows', i, -1)} title="Move up">↑</button>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => moveItem('trim_rows', i,  1)} title="Move down" style={{ marginLeft: 2 }}>↓</button>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => removeItem('trim_rows', i)} title="Remove row" style={{ marginLeft: 2 }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => addItem('trim_rows', { component: '', type: '', supplier: '', code: '', size: '', color: '', quantity: '' })}>+ Add trim</button>
                </div>

                </>}

                {tab === 'detail' && <>

                {/* ── Spec Sheet 1 — Detail Photos ─────────────── */}
                <div className="form-section-head">Detail Photos</div>

                <div className="form-full" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {form.detail_blocks.length === 0 && (
                    <div style={{
                      border: '1px dashed var(--border)', borderRadius: 8, padding: '32px 20px',
                      textAlign: 'center', color: 'var(--t3)', fontSize: 13, background: 'var(--raised)',
                    }}>
                      No detail blocks yet — click <em>+ Add detail block</em> below to add one.<br/>
                      <span style={{ fontSize: 11, color: 'var(--t3)' }}>Each block has a left photo, a description, and a right photo (e.g. Front / Back, Waistband Out / In).</span>
                    </div>
                  )}

                  {form.detail_blocks.map((b, i) => (
                    <DetailBlock
                      key={i}
                      index={i}
                      block={b}
                      isFirst={i === 0}
                      isLast={i === form.detail_blocks.length - 1}
                      onChange={(k, v) => setItemField('detail_blocks', i, k, v)}
                      onMoveUp={() => moveItem('detail_blocks', i, -1)}
                      onMoveDown={() => moveItem('detail_blocks', i, 1)}
                      onRemove={() => removeItem('detail_blocks', i)}
                    />
                  ))}

                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() => addItem('detail_blocks', {
                      left_label: '', left_image_url: '', left_file: null,
                      description: '',
                      right_label: '', right_image_url: '', right_file: null,
                    })}
                  >+ Add detail block</button>
                </div>

                </>}

                {tab === 'measurement' && <>

                {/* ── Design + Submission ──────────────────────── */}
                <div className="form-section-head">Design Details</div>

                <div className="form-group form-full">
                  <label className="form-label">Silhouette <span className="req">*</span></label>
                  <select className="form-select" value={form.silhouette} onChange={e => set('silhouette', e.target.value)}>
                    <option value="">Select…</option>
                    {codeRulesOptions(codeRules.silhouette, form.silhouette, []).map(o => <option key={o}>{o}</option>)}
                  </select>
                  <div className="form-hint">To add a new silhouette, go to Admin → Style Code Settings.</div>
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

                </>}
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

// Merge admin-managed rule values with a fallback list (defaults or the
// currently-saved value on an existing style) so editing a legacy style
// never blanks out a previously-valid choice.
function codeRulesOptions(ruleRows, current, fallback) {
  const ruleValues = (ruleRows || []).map(r => r.value)
  const out = [...ruleValues]
  for (const f of (fallback || [])) {
    if (!out.some(v => v.toLowerCase() === String(f).toLowerCase())) out.push(f)
  }
  if (current && !out.some(v => v.toLowerCase() === current.toLowerCase())) out.push(current)
  return out
}

function fabricOptions(fabrics, current) {
  const out = [...(fabrics || [])]
  if (current && !out.some(f => f.name.toLowerCase() === current.toLowerCase())) {
    out.push({ name: current, code: null })
  }
  return out
}

export default function NewStylePage() {
  return <Suspense><NewStyleInner /></Suspense>
}
