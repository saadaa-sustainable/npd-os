'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import {
  getStyleCodeSettings,
  createStyleCodeRule,
  updateStyleCodeRule,
  deleteStyleCodeRule,
  composeStyleCodeSegments,
  STYLE_CODE_SEGMENTS,
  STYLE_CODE_PREFIX,
} from '@/lib/supabase'
import { useToast } from '@/components/Toast'

const SEGMENT_META = {
  gender:      { label: 'Gender',     hint: 'Fixed by spec — D=Women, M=Men, U=Unisex. Avoid changing the codes; long-form label is editable.', placeholder: 'e.g. Women',  codeHint: 'D / M / U' },
  fabric:      { label: 'Fabric',     hint: 'Single-letter code per fabric. Max 26 (A–Z).',                                                     placeholder: 'e.g. Cotton', codeHint: 'A single letter, e.g. C' },
  silhouette:  { label: 'Silhouette', hint: 'Single-letter code per silhouette. Max 26 (A–Z).',                                                 placeholder: 'e.g. Shirt',  codeHint: 'A single letter, e.g. S' },
}

const EMPTY_DRAFT = { value: '', code: '', sort_order: 0 }

export default function StyleCodeSettingsPage() {
  const user  = useRequireAuth(['founder'])
  const toast = useToast()

  const [rules,   setRules]   = useState(() => Object.fromEntries(STYLE_CODE_SEGMENTS.map(s => [s, []])))
  const [loading, setLoading] = useState(true)
  const [drafts,  setDrafts]  = useState(() => Object.fromEntries(STYLE_CODE_SEGMENTS.map(s => [s, { ...EMPTY_DRAFT }])))

  const reload = async () => {
    setLoading(true)
    try { setRules(await getStyleCodeSettings()) }
    catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (user) reload() }, [user])

  // Live preview — show what a code with one example value per segment looks like.
  const preview = useMemo(() => {
    const sel = {}
    for (const seg of STYLE_CODE_SEGMENTS) {
      sel[seg] = rules[seg]?.[0]?.value || ''
    }
    return composeStyleCodeSegments(sel, rules).prefix
  }, [rules])

  const setDraft = (segment, patch) =>
    setDrafts(d => ({ ...d, [segment]: { ...d[segment], ...patch } }))

  const handleAdd = async (segment) => {
    const draft = drafts[segment]
    if (!draft.value.trim() || !draft.code.trim()) {
      toast('Both value and code are required', 'error'); return
    }
    try {
      await createStyleCodeRule({
        segment,
        value: draft.value,
        code:  draft.code,
        sort_order: (rules[segment]?.length || 0) + 1,
      })
      setDraft(segment, { ...EMPTY_DRAFT })
      await reload()
      toast(`${SEGMENT_META[segment].label} rule added ✓`, 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const handleEdit = async (rule, patch) => {
    try {
      await updateStyleCodeRule(rule.id, patch)
      await reload()
    } catch (e) { toast(e.message, 'error'); await reload() }
  }

  const handleDelete = async (rule) => {
    if (!confirm(`Delete "${rule.value}" → ${rule.code}?`)) return
    try {
      await deleteStyleCodeRule(rule.id)
      await reload()
      toast('Rule deleted ✓', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  if (!user) return null

  return (
    <AppShell title="Style Code Settings" subtitle="Rules that auto-generate unique product style codes">
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Style Code Settings</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', maxWidth: 720 }}>
              Define the single-letter codes for <strong>Gender</strong>, <strong>Fabric</strong>, and <strong>Silhouette</strong>. When a maker creates a new style, the 6-letter code is generated automatically and is unique for every product. Only Admin can edit these rules.
            </div>
          </div>
        </div>

        {/* Preview card */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-body">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 8 }}>
              Format — 6 letters, no separators
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, letterSpacing: 1.5, color: 'var(--t1)' }}>
              {STYLE_CODE_PREFIX}<span style={{ color: 'var(--t3)' }}>G</span><span style={{ color: 'var(--t3)' }}>F</span><span style={{ color: 'var(--t3)' }}>S</span><span style={{ color: 'var(--t3)' }}>AA</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--t3)' }}>
              S = Saadaa · G = Gender · F = Fabric · S = Silhouette · AA–ZZ = sequence within bucket (676 codes per bucket).
              <br/>Example with current rules: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--t1)' }}>{preview}AA</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="spinner-wrap"><div className="spinner"/></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {STYLE_CODE_SEGMENTS.map(segment => (
              <SegmentCard
                key={segment}
                segment={segment}
                meta={SEGMENT_META[segment]}
                rows={rules[segment] || []}
                draft={drafts[segment]}
                setDraft={patch => setDraft(segment, patch)}
                onAdd={() => handleAdd(segment)}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

function SegmentCard({ segment, meta, rows, draft, setDraft, onAdd, onEdit, onDelete }) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="card-title">{meta.label}</div>
          <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 2 }}>{meta.hint}</div>
        </div>
        <span className="badge" style={{ fontFamily: 'var(--font-mono)' }}>{rows.length}</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              <th>Value</th>
              <th style={{ width: 140 }}>Short Code</th>
              <th style={{ width: 100 }}>Sort</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--t3)', padding: '20px 0', fontSize: 13 }}>
                  No {meta.label.toLowerCase()} rules yet — add the first one below.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <EditableRow
                key={r.id}
                index={i + 1}
                rule={r}
                onSave={patch => onEdit(r, patch)}
                onDelete={() => onDelete(r)}
              />
            ))}
            {/* Add row */}
            <tr style={{ background: 'var(--raised)' }}>
              <td style={{ color: 'var(--t3)', fontSize: 12, textAlign: 'center' }}>+</td>
              <td>
                <input
                  className="form-input"
                  style={{ padding: '6px 10px', fontSize: 13 }}
                  value={draft.value}
                  onChange={e => setDraft({ value: e.target.value })}
                  placeholder={meta.placeholder}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd() } }}
                />
              </td>
              <td>
                <input
                  className="form-input code-field"
                  style={{ padding: '6px 10px', fontSize: 13, textTransform: 'uppercase', textAlign: 'center', letterSpacing: 2 }}
                  value={draft.code}
                  maxLength={1}
                  onChange={e => setDraft({ code: e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 1) })}
                  placeholder={meta.codeHint}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd() } }}
                />
              </td>
              <td style={{ color: 'var(--t3)', fontSize: 12 }}>auto</td>
              <td>
                <button type="button" className="btn btn-primary btn-xs" onClick={onAdd}>Add</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EditableRow({ index, rule, onSave, onDelete }) {
  const [value, setValue] = useState(rule.value)
  const [code,  setCode]  = useState(rule.code)
  const [sort,  setSort]  = useState(rule.sort_order ?? 0)

  useEffect(() => { setValue(rule.value); setCode(rule.code); setSort(rule.sort_order ?? 0) }, [rule.id, rule.value, rule.code, rule.sort_order])

  const dirty = value !== rule.value || code !== rule.code || Number(sort) !== Number(rule.sort_order ?? 0)

  const commit = () => {
    if (!dirty) return
    if (!value.trim() || !code.trim()) return
    onSave({ value, code, sort_order: Number(sort) || 0 })
  }

  return (
    <tr>
      <td style={{ color: 'var(--t3)', fontSize: 12, textAlign: 'center' }}>{index}</td>
      <td>
        <input
          className="form-input"
          style={{ padding: '6px 10px', fontSize: 13 }}
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        />
      </td>
      <td>
        <input
          className="form-input code-field"
          style={{ padding: '6px 10px', fontSize: 13, textTransform: 'uppercase', textAlign: 'center', letterSpacing: 2 }}
          value={code}
          maxLength={1}
          onChange={e => setCode(e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 1))}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        />
      </td>
      <td>
        <input
          className="form-input"
          style={{ padding: '6px 10px', fontSize: 13, width: 80 }}
          type="number"
          value={sort}
          onChange={e => setSort(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }}
        />
      </td>
      <td>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onDelete} title="Delete rule">✕</button>
      </td>
    </tr>
  )
}
