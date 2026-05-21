'use client'

import { useEffect, useMemo, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import {
  getStyleCodeSettings, createStyleCodeRule, updateStyleCodeRule, deleteStyleCodeRule,
  getFibers, createFiber, updateFiber, deleteFiber,
  getFabrics, createFabric, updateFabric, deleteFabric,
  composeStyleCodeSegments, STYLE_CODE_PREFIX,
} from '@/lib/supabase'
import { useToast } from '@/components/Toast'

const EMPTY_RULE = { value: '', code: '', sort_order: 0 }
const EMPTY_FIBER = { name: '', code: '', sort_order: 0 }
const EMPTY_FABRIC = { name: '', composition: '', code: '', sort_order: 0 }

export default function StyleCodeSettingsPage() {
  const user = useRequireAuth(['founder'])
  const toast = useToast()
  const [settings, setSettings] = useState({ gender: [], silhouette: [] })
  const [fibers, setFibers] = useState([])
  const [fabrics, setFabrics] = useState([])
  const [loading, setLoading] = useState(true)
  const [drafts, setDrafts] = useState({
    gender: { ...EMPTY_RULE },
    silhouette: { ...EMPTY_RULE },
    fiber: { ...EMPTY_FIBER },
    fabric: { ...EMPTY_FABRIC },
  })

  const reload = async () => {
    setLoading(true)
    try {
      const [nextSettings, nextFibers, nextFabrics] = await Promise.all([
        getStyleCodeSettings(),
        getFibers(),
        getFabrics(),
      ])
      setSettings(nextSettings)
      setFibers(nextFibers)
      setFabrics(nextFabrics)
    } catch (e) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!user) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const preview = useMemo(() => {
    const firstCodedFabric = fabrics.find(f => f.code)
    const { prefix } = composeStyleCodeSegments({
      gender: settings.gender?.[0]?.value || '',
      fabric: firstCodedFabric?.name || '',
      silhouette: settings.silhouette?.[0]?.value || '',
    }, { ...settings, fabric: fabrics })
    return `${prefix}AA`
  }, [settings, fabrics])

  const setDraft = (key, patch) =>
    setDrafts(d => ({ ...d, [key]: { ...d[key], ...patch } }))

  const addRule = async (segment) => {
    try {
      await createStyleCodeRule({
        segment,
        value: drafts[segment].value,
        code: drafts[segment].code,
        sort_order: (settings[segment]?.length || 0) + 1,
      })
      setDraft(segment, { ...EMPTY_RULE })
      await reload()
      toast('Rule added', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const addFiber = async () => {
    try {
      await createFiber({ ...drafts.fiber, sort_order: fibers.length + 1 })
      setDraft('fiber', { ...EMPTY_FIBER })
      await reload()
      toast('Fiber added', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  const addFabric = async () => {
    try {
      await createFabric({ ...drafts.fabric, sort_order: fabrics.length + 1 })
      setDraft('fabric', { ...EMPTY_FABRIC })
      await reload()
      toast('Fabric added', 'success')
    } catch (e) { toast(e.message, 'error') }
  }

  if (!user) return null

  return (
    <AppShell title="Style Code Settings" subtitle="Fabric library and rules for auto-generated product codes">
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Style Code Settings</div>
          <div style={{ fontSize: 13, color: 'var(--t3)', maxWidth: 760 }}>
            Format: <strong>S + Gender + Fabric + Silhouette + AA-ZZ</strong>. Fabric codes are exactly two letters; fabrics without codes remain saved here but are hidden from New Style until coded.
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 8 }}>
              7-letter format
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, letterSpacing: 1.5, color: 'var(--t1)' }}>
              {STYLE_CODE_PREFIX}<span style={{ color: 'var(--t3)' }}>G</span><span style={{ color: 'var(--t3)' }}>FF</span><span style={{ color: 'var(--t3)' }}>S</span><span style={{ color: 'var(--t3)' }}>AA</span>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--t3)' }}>
              Example with first available coded values: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--t1)' }}>{preview}</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="spinner-wrap"><div className="spinner"/></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <RuleCard
              title="Gender Codes"
              hint="One-letter codes. Current spec: D=Women, M=Men, U=Unisex."
              rows={settings.gender || []}
              draft={drafts.gender}
              setDraft={patch => setDraft('gender', patch)}
              onAdd={() => addRule('gender')}
              onEdit={(row, patch) => updateStyleCodeRule(row.id, patch).then(reload).catch(e => toast(e.message, 'error'))}
              onDelete={row => deleteStyleCodeRule(row.id).then(reload).catch(e => toast(e.message, 'error'))}
            />
            <RuleCard
              title="Silhouette Codes"
              hint="One-letter codes for silhouettes such as Shirt, Dress, Pant, Tee."
              rows={settings.silhouette || []}
              draft={drafts.silhouette}
              setDraft={patch => setDraft('silhouette', patch)}
              onAdd={() => addRule('silhouette')}
              onEdit={(row, patch) => updateStyleCodeRule(row.id, patch).then(reload).catch(e => toast(e.message, 'error'))}
              onDelete={row => deleteStyleCodeRule(row.id).then(reload).catch(e => toast(e.message, 'error'))}
            />
            <FiberCard
              rows={fibers}
              draft={drafts.fiber}
              setDraft={patch => setDraft('fiber', patch)}
              onAdd={addFiber}
              onEdit={(row, patch) => updateFiber(row.id, patch).then(reload).catch(e => toast(e.message, 'error'))}
              onDelete={row => deleteFiber(row.id).then(reload).catch(e => toast(e.message, 'error'))}
            />
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

function RuleCard({ title, hint, rows, draft, setDraft, onAdd, onEdit, onDelete }) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <CardHeader title={title} hint={hint} count={rows.length} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Value</th><th>Code</th><th>Sort</th><th></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <RuleRow key={r.id} index={i + 1} row={r} onSave={patch => onEdit(r, patch)} onDelete={() => onDelete(r)} />
            ))}
            <tr style={{ background: 'var(--raised)' }}>
              <td>+</td>
              <td><input className="form-input" value={draft.value} onChange={e => setDraft({ value: e.target.value })} placeholder="Value" /></td>
              <td><CodeInput value={draft.code} maxLength={1} onChange={code => setDraft({ code })} placeholder="A" /></td>
              <td className="td-muted">auto</td>
              <td><button type="button" className="btn btn-primary btn-xs" onClick={onAdd}>Add</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FiberCard({ rows, draft, setDraft, onAdd, onEdit, onDelete }) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <CardHeader title="Fibers" hint="Reference library used for compositions. These codes are not used directly in the final style code." count={rows.length} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Fiber Code</th><th>Sort</th><th></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <FiberRow key={r.id} index={i + 1} row={r} onSave={patch => onEdit(r, patch)} onDelete={() => onDelete(r)} />
            ))}
            <tr style={{ background: 'var(--raised)' }}>
              <td>+</td>
              <td><input className="form-input" value={draft.name} onChange={e => setDraft({ name: e.target.value })} placeholder="Cotton" /></td>
              <td><CodeInput value={draft.code} maxLength={4} onChange={code => setDraft({ code })} placeholder="CO" /></td>
              <td className="td-muted">auto</td>
              <td><button type="button" className="btn btn-primary btn-xs" onClick={onAdd}>Add</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function FabricCard({ rows, draft, setDraft, onAdd, onEdit, onDelete }) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <CardHeader title="Fabrics" hint="Actual brand fabric library. Only rows with a 2-letter code appear in New Style." count={rows.length} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>#</th><th>Fabric Name</th><th>Composition</th><th>Style Code</th><th>Sort</th><th></th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <FabricRow key={r.id} index={i + 1} row={r} onSave={patch => onEdit(r, patch)} onDelete={() => onDelete(r)} />
            ))}
            <tr style={{ background: 'var(--raised)' }}>
              <td>+</td>
              <td><input className="form-input" value={draft.name} onChange={e => setDraft({ name: e.target.value })} placeholder="Poplin" /></td>
              <td><input className="form-input" value={draft.composition} onChange={e => setDraft({ composition: e.target.value })} placeholder="100% Cotton" /></td>
              <td><CodeInput value={draft.code} maxLength={2} onChange={code => setDraft({ code })} placeholder="CO" /></td>
              <td className="td-muted">auto</td>
              <td><button type="button" className="btn btn-primary btn-xs" onClick={onAdd}>Add</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

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

function RuleRow({ index, row, onSave, onDelete }) {
  return <EditableRow index={index} row={row} fields={['value', 'code', 'sort_order']} codeMax={1} onSave={onSave} onDelete={onDelete} />
}

function FiberRow({ index, row, onSave, onDelete }) {
  return <EditableRow index={index} row={row} fields={['name', 'code', 'sort_order']} codeMax={4} onSave={onSave} onDelete={onDelete} />
}

function FabricRow({ index, row, onSave, onDelete }) {
  return <EditableRow index={index} row={row} fields={['name', 'composition', 'code', 'sort_order']} codeMax={2} onSave={onSave} onDelete={onDelete} />
}

function EditableRow({ index, row, fields, codeMax, onSave, onDelete }) {
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
      <td style={{ color: 'var(--t3)', fontSize: 12 }}>{index}</td>
      {fields.map(f => f === 'code' ? (
        <td key={f}><CodeInput value={draft.code || ''} maxLength={codeMax} onChange={code => set('code', code)} onBlur={commit} /></td>
      ) : f === 'sort_order' ? (
        <td key={f}><input className="form-input" style={cellInputStyle} type="number" value={draft.sort_order ?? 0} onChange={e => set('sort_order', e.target.value)} onBlur={commit} /></td>
      ) : (
        <td key={f}><input className="form-input" style={cellInputStyle} value={draft[f] || ''} onChange={e => set(f, e.target.value)} onBlur={commit} /></td>
      ))}
      <td><button type="button" className="btn btn-ghost btn-xs" onClick={onDelete} title="Delete">Delete</button></td>
    </tr>
  )
}

function CodeInput({ value, maxLength, onChange, onBlur, placeholder }) {
  return (
    <input
      className="form-input code-field"
      style={{ ...cellInputStyle, textTransform: 'uppercase', textAlign: 'center', letterSpacing: 2, width: maxLength === 1 ? 90 : 110 }}
      value={value || ''}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, maxLength))}
      onBlur={onBlur}
    />
  )
}

const cellInputStyle = { padding: '6px 10px', fontSize: 13 }
