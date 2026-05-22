'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import {
  getBuilderRows, createBuilderRow, updateBuilderRow, deleteBuilderRow, moveBuilderRow,
  getFibers, createFiber, updateFiber, deleteFiber,
  getFabrics, createFabric, updateFabric, deleteFabric,
  composeStyleCodeFromBuilder,
} from '@/lib/supabase'
import { useToast } from '@/components/Toast'

const EMPTY_BUILDER = { group_name: '', letters: 1, field: '', code: '', is_sequence: false }
const EMPTY_FIBER   = { name: '', code: '', sort_order: 0 }
const EMPTY_FABRIC  = { name: '', composition: '', code: '', sort_order: 0 }

export default function StyleCodeSettingsPage() {
  const user  = useRequireAuth(['founder'])
  const toast = useToast()

  const [rows,    setRows]    = useState([])
  const [fibers,  setFibers]  = useState([])
  const [fabrics, setFabrics] = useState([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState({
    builder: { ...EMPTY_BUILDER },
    fiber:   { ...EMPTY_FIBER },
    fabric:  { ...EMPTY_FABRIC },
  })

  const reload = async () => {
    setLoading(true)
    try {
      const [nextRows, nextFibers, nextFabrics] = await Promise.all([
        getBuilderRows(), getFibers(), getFabrics(),
      ])
      setRows(nextRows); setFibers(nextFibers); setFabrics(nextFabrics)
    } catch (e) { toast(e.message, 'error') }
    finally     { setLoading(false) }
  }

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Group rows by group_name in first-appearance order — same logic as the generator.
  const groups = useMemo(() => {
    const byName = new Map()
    const order  = []
    for (const r of rows) {
      if (!byName.has(r.group_name)) {
        byName.set(r.group_name, {
          groupName:  r.group_name,
          isSequence: !!r.is_sequence,
          letters:    r.letters,
          rows:       [],
        })
        order.push(r.group_name)
      }
      byName.get(r.group_name).rows.push(r)
    }
    return order.map(g => byName.get(g))
  }, [rows])

  // Live preview using the first option of each variable group as the example.
  const preview = useMemo(() => {
    const sel = {}
    for (const g of groups) {
      if (!g.isSequence && g.rows.length > 1) sel[g.groupName] = g.rows[0].field
    }
    return composeStyleCodeFromBuilder(sel, groups).preview
  }, [groups])

  const setDraft = (key, patch) =>
    setDrafts(d => ({ ...d, [key]: { ...d[key], ...patch } }))

  const addBuilderRow = async () => {
    try {
      await createBuilderRow(drafts.builder)
      setDraft('builder', { ...EMPTY_BUILDER })
      await reload()
      toast('Row added ✓', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const editBuilderRow  = (row, patch) => updateBuilderRow(row.id, patch).then(reload).catch(e => toast(e.message, 'error'))
  const removeBuilderRow = (row) => {
    if (!confirm(`Delete "${row.field}" (${row.group_name})?`)) return
    deleteBuilderRow(row.id).then(reload).catch(e => toast(e.message, 'error'))
  }
  const moveRow = (row, dir) => moveBuilderRow(row.id, dir).then(reload).catch(e => toast(e.message, 'error'))

  const addFiber = async () => {
    try { await createFiber({ ...drafts.fiber, sort_order: fibers.length + 1 })
      setDraft('fiber', { ...EMPTY_FIBER }); await reload(); toast('Fiber added ✓', 'success')
    } catch (e) { toast(e.message, 'error') }
  }
  const addFabric = async () => {
    try { await createFabric({ ...drafts.fabric, sort_order: fabrics.length + 1 })
      setDraft('fabric', { ...EMPTY_FABRIC }); await reload(); toast('Fabric added ✓', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  if (!user) return null

  return (
    <AppShell title="Style Code Settings" subtitle="Define the style code structure row-by-row">
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Style Code Settings</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', maxWidth: 760 }}>
            Define the style code one row at a time. Rows sharing a <strong>Group</strong> become a dropdown for the maker (e.g. all <em>Gender</em> rows). A group with one row is a fixed segment. Mark a row <strong>Sequence</strong> to make it auto-fill with a unique alphabetic suffix per product.
          </div>
        </div>

        {/* Preview card */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 8 }}>
              Live preview (first value of each variable group)
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, letterSpacing: 2, color: 'var(--t1)' }}>
              {preview || '—'}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t3)' }}>
              Total length: {preview.length} letter{preview.length === 1 ? '' : 's'}.
            </div>
          </div>
        </div>

        {loading ? (
          <div className="spinner-wrap"><div className="spinner"/></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Style Code Builder */}
            <BuilderCard
              groups={groups}
              draft={drafts.builder}
              setDraft={patch => setDraft('builder', patch)}
              onAdd={addBuilderRow}
              onEdit={editBuilderRow}
              onDelete={removeBuilderRow}
              onMove={moveRow}
            />

            {/* Fiber library (reference for spec-sheet compositions). */}
            <FiberCard
              rows={fibers}
              draft={drafts.fiber}
              setDraft={patch => setDraft('fiber', patch)}
              onAdd={addFiber}
              onEdit={(row, patch) => updateFiber(row.id, patch).then(reload).catch(e => toast(e.message, 'error'))}
              onDelete={row => deleteFiber(row.id).then(reload).catch(e => toast(e.message, 'error'))}
            />

            {/* Fabric library (name + composition). Not used by the code builder; lives here for spec-sheet reference. */}
            <FabricCard
              rows={fabrics}
              draft={drafts.fabric}
              setDraft={patch => setDraft('fabric', patch)}
              onAdd={addFabric}
              onEdit={(row, patch) => updateFabric(row.id, patch).then(reload).catch(e => toast(e.message, 'error'))}
              onDelete={row => deleteFabric(row.id).then(reload).catch(e => toast(e.message, 'error'))}
            />
          </div>
        )}
      </div>
    </AppShell>
  )
}

// ── Builder spreadsheet ───────────────────────────────────────

function BuilderCard({ groups, draft, setDraft, onAdd, onEdit, onDelete, onMove }) {
  const total = groups.reduce((sum, g) => sum + g.rows.length, 0)
  return (
    <div className="card" style={{ padding: 0 }}>
      <CardHeader
        title="Style Code Builder"
        hint="Each row contributes one segment (or one option of a variable segment) to the final code."
        count={total}
      />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 50 }}>#</th>
              <th style={{ width: 140 }}>Group</th>
              <th style={{ width: 90, textAlign: 'center' }}>Letters</th>
              <th>Field</th>
              <th style={{ width: 120 }}>Code</th>
              <th style={{ width: 90, textAlign: 'center' }}>Sequence?</th>
              <th style={{ width: 130 }}></th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr><td colSpan={7} style={emptyCell}>No rows yet — add the first one below.</td></tr>
            )}
            {groups.flatMap((g, gi) => g.rows.map((row, ri) => (
              <BuilderRow
                key={row.id}
                row={row}
                position={row.position}
                firstInGroup={ri === 0}
                groupColor={gi % 2 === 0}
                onSave={patch => onEdit(row, patch)}
                onDelete={() => onDelete(row)}
                onUp={() => onMove(row, -1)}
                onDown={() => onMove(row, 1)}
              />
            )))}

            {/* Add row */}
            <tr style={{ background: 'var(--raised)' }}>
              <td style={muted}>+</td>
              <td>
                <input className="form-input" style={cellInputStyle}
                  value={draft.group_name}
                  onChange={e => setDraft({ group_name: e.target.value })}
                  placeholder="Gender" />
              </td>
              <td>
                <input className="form-input" style={{ ...cellInputStyle, textAlign: 'center', width: 64 }}
                  type="number" min={1} max={6}
                  value={draft.letters}
                  onChange={e => setDraft({ letters: e.target.value })} />
              </td>
              <td>
                <input className="form-input" style={cellInputStyle}
                  value={draft.field}
                  onChange={e => setDraft({ field: e.target.value })}
                  placeholder={draft.is_sequence ? '(auto)' : 'Women'} />
              </td>
              <td>
                <input className="form-input code-field"
                  style={{ ...cellInputStyle, textTransform: 'uppercase', textAlign: 'center', letterSpacing: 2 }}
                  value={draft.code}
                  maxLength={draft.is_sequence ? 12 : Number(draft.letters) || 6}
                  onChange={e => setDraft({ code: e.target.value.replace(draft.is_sequence ? /[^A-Za-z0-9-]/g : /[^A-Za-z]/g, '').toUpperCase() })}
                  placeholder={draft.is_sequence ? 'AA-ZZ' : 'D'} />
              </td>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={!!draft.is_sequence}
                  onChange={e => setDraft({ is_sequence: e.target.checked, code: e.target.checked ? 'AA-ZZ' : draft.code })} />
              </td>
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

function BuilderRow({ row, firstInGroup, groupColor, onSave, onDelete, onUp, onDown }) {
  const [group, setGroup] = useState(row.group_name)
  const [letters, setLetters] = useState(row.letters)
  const [field, setField] = useState(row.field)
  const [code, setCode] = useState(row.code)
  const [seq, setSeq] = useState(!!row.is_sequence)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGroup(row.group_name); setLetters(row.letters); setField(row.field); setCode(row.code); setSeq(!!row.is_sequence)
  }, [row])

  const dirty = group !== row.group_name || Number(letters) !== row.letters || field !== row.field || code !== row.code || seq !== !!row.is_sequence
  const commit = () => {
    if (!dirty) return
    onSave({ group_name: group, letters: Number(letters), field, code, is_sequence: seq })
  }

  return (
    <tr style={{
      background: firstInGroup ? (groupColor ? 'var(--surface)' : 'var(--raised)') : 'transparent',
      borderTop: firstInGroup ? '1px solid var(--border-dim)' : 'none',
    }}>
      <td style={muted}>{row.position}</td>
      <td>
        <input className="form-input" style={cellInputStyle} value={group}
          onChange={e => setGroup(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }} />
      </td>
      <td>
        <input className="form-input" style={{ ...cellInputStyle, textAlign: 'center', width: 64 }}
          type="number" min={1} max={6} value={letters}
          onChange={e => setLetters(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }} />
      </td>
      <td>
        <input className="form-input" style={cellInputStyle} value={field}
          onChange={e => setField(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }} />
      </td>
      <td>
        <input className="form-input code-field"
          style={{ ...cellInputStyle, textTransform: 'uppercase', textAlign: 'center', letterSpacing: 2 }}
          value={code}
          maxLength={seq ? 12 : Number(letters) || 6}
          onChange={e => setCode(e.target.value.replace(seq ? /[^A-Za-z0-9-]/g : /[^A-Za-z]/g, '').toUpperCase())}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }} />
      </td>
      <td style={{ textAlign: 'center' }}>
        <input type="checkbox" checked={seq}
          onChange={e => { setSeq(e.target.checked); if (e.target.checked) setCode('AA-ZZ') }}
          onBlur={commit} />
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onUp} title="Move up">↑</button>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onDown} title="Move down" style={{ marginLeft: 2 }}>↓</button>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onDelete} title="Delete" style={{ marginLeft: 2 }}>✕</button>
      </td>
    </tr>
  )
}

// ── Fibers ────────────────────────────────────────────────────

function FiberCard({ rows, draft, setDraft, onAdd, onEdit, onDelete }) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <CardHeader title="Fibers" hint="Reference library for spec-sheet compositions. Not used in the style code." count={rows.length} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Code</th><th>Sort</th><th></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <SimpleRow key={r.id} index={i + 1} row={r} fields={['name', 'code', 'sort_order']} codeMax={4} onSave={patch => onEdit(r, patch)} onDelete={() => onDelete(r)} />
            ))}
            <tr style={{ background: 'var(--raised)' }}>
              <td style={muted}>+</td>
              <td><input className="form-input" style={cellInputStyle} value={draft.name} onChange={e => setDraft({ name: e.target.value })} placeholder="Cotton" /></td>
              <td><input className="form-input code-field" style={{ ...cellInputStyle, textTransform: 'uppercase', textAlign: 'center', letterSpacing: 2 }} value={draft.code} maxLength={4} onChange={e => setDraft({ code: e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase() })} placeholder="CO" /></td>
              <td style={muted}>auto</td>
              <td><button type="button" className="btn btn-primary btn-xs" onClick={onAdd}>Add</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Fabrics ───────────────────────────────────────────────────

function FabricCard({ rows, draft, setDraft, onAdd, onEdit, onDelete }) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <CardHeader title="Fabrics" hint="Fabric library for spec sheets (name + composition). Codes here are independent from the style code." count={rows.length} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Composition</th><th>Code</th><th>Sort</th><th></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <SimpleRow key={r.id} index={i + 1} row={r} fields={['name', 'composition', 'code', 'sort_order']} codeMax={2} onSave={patch => onEdit(r, patch)} onDelete={() => onDelete(r)} />
            ))}
            <tr style={{ background: 'var(--raised)' }}>
              <td style={muted}>+</td>
              <td><input className="form-input" style={cellInputStyle} value={draft.name} onChange={e => setDraft({ name: e.target.value })} placeholder="Poplin" /></td>
              <td><input className="form-input" style={cellInputStyle} value={draft.composition} onChange={e => setDraft({ composition: e.target.value })} placeholder="100% Cotton" /></td>
              <td><input className="form-input code-field" style={{ ...cellInputStyle, textTransform: 'uppercase', textAlign: 'center', letterSpacing: 2 }} value={draft.code} maxLength={2} onChange={e => setDraft({ code: e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase() })} placeholder="PO" /></td>
              <td style={muted}>auto</td>
              <td><button type="button" className="btn btn-primary btn-xs" onClick={onAdd}>Add</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Shared bits ───────────────────────────────────────────────

function CardHeader({ title, hint, count }) {
  return (
    <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div className="card-title">{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 2 }}>{hint}</div>
      </div>
      <span className="badge" style={{ fontFamily: 'var(--font-mono)' }}>{count}</span>
    </div>
  )
}

function SimpleRow({ index, row, fields, codeMax, onSave, onDelete }) {
  const [draft, setDraft] = useState(() => ({ ...row, code: row.code || '', composition: row.composition || '' }))
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft({ ...row, code: row.code || '', composition: row.composition || '' })
  }, [row])

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }))
  const commit = () => {
    const patch = {}
    for (const f of fields) if ((draft[f] ?? '') !== (row[f] ?? '')) patch[f] = draft[f]
    if (Object.keys(patch).length) onSave(patch)
  }

  return (
    <tr>
      <td style={muted}>{index}</td>
      {fields.map(f => f === 'code' ? (
        <td key={f}>
          <input className="form-input code-field"
            style={{ ...cellInputStyle, textTransform: 'uppercase', textAlign: 'center', letterSpacing: 2 }}
            value={draft.code || ''}
            maxLength={codeMax}
            onChange={e => set('code', e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, codeMax))}
            onBlur={commit} />
        </td>
      ) : f === 'sort_order' ? (
        <td key={f}><input className="form-input" style={cellInputStyle} type="number" value={draft.sort_order ?? 0} onChange={e => set('sort_order', e.target.value)} onBlur={commit} /></td>
      ) : (
        <td key={f}><input className="form-input" style={cellInputStyle} value={draft[f] || ''} onChange={e => set(f, e.target.value)} onBlur={commit} /></td>
      ))}
      <td><button type="button" className="btn btn-ghost btn-xs" onClick={onDelete} title="Delete">✕</button></td>
    </tr>
  )
}

const cellInputStyle = { padding: '6px 10px', fontSize: 13 }
const muted = { color: 'var(--t3)', fontSize: 12, textAlign: 'center' }
const emptyCell = { textAlign: 'center', color: 'var(--t3)', padding: '20px 0', fontSize: 13 }
