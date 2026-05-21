'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import { getStyles, getInventoryRows, upsertInventoryRow, deleteInventoryRow, addAuditLog } from '@/lib/supabase'
import { useToast } from '@/components/Toast'

const INV_FIELDS = ['colour','xs','s','m','l','xl','xxl','pcs_per_colour','cons_54','cons_56','buy_price','mrp']
const INV_LABELS = ['Colour','XS','S','M','L','XL','2XL','Pcs/Col','Cons 54"','Cons 56"','Buy ₹','MRP ₹']

const emptyRow = styleId => ({
  id: null, style_id: styleId, colour: '',
  xs: 0, s: 0, m: 0, l: 0, xl: 0, xxl: 0,
  pcs_per_colour: 0, cons_54: '', cons_56: '', buy_price: '', mrp: '',
})

export default function InventoryPage() {
  const user  = useRequireAuth(['founder','maker','checker'])
  const toast = useToast()
  const [styles, setStyles]   = useState([])
  const [rows, setRows]       = useState({})   // { styleId: [row, ...] }
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(null)

  useEffect(() => {
    if (!user) return
    getStyles({ stage: 'Inventory Planning' }).then(async data => {
      setStyles(data)
      const rowMap = {}
      await Promise.all(data.map(async s => {
        const r = await getInventoryRows(s.id)
        rowMap[s.id] = r.length > 0 ? r : [emptyRow(s.id)]
      }))
      setRows(rowMap)
      setLoading(false)
    })
  }, [user])

  const addRow = styleId => setRows(r => ({ ...r, [styleId]: [...(r[styleId]||[]), emptyRow(styleId)] }))

  const updateCell = (styleId, idx, field, val) => {
    setRows(prev => {
      const updated = prev[styleId].map((row, i) => i === idx ? { ...row, [field]: val } : row)
      return { ...prev, [styleId]: updated }
    })
  }

  const removeRow = async (styleId, idx, rowId) => {
    if (rowId) {
      try { await deleteInventoryRow(rowId); toast('Row removed', 'info') }
      catch(e) { toast(e.message, 'error'); return }
    }
    setRows(prev => ({ ...prev, [styleId]: prev[styleId].filter((_, i) => i !== idx) }))
  }

  const saveRows = async styleId => {
    setSaving(styleId)
    const toSave = (rows[styleId] || []).filter(r => r.colour?.trim())
    if (toSave.length === 0) { toast('Add at least one colour row', 'error'); setSaving(null); return }
    try {
      for (const row of toSave) {
        const payload = { ...row, style_id: styleId }
        if (!row.id) delete payload.id
        await upsertInventoryRow(payload)
      }
      await addAuditLog(styleId, `Inventory updated by ${user.full_name}`, user.id)
      toast('Inventory saved ✓', 'success')
      // reload rows
      const refreshed = await getInventoryRows(styleId)
      setRows(prev => ({ ...prev, [styleId]: refreshed }))
    } catch(e) { toast(e.message, 'error') }
    finally { setSaving(null) }
  }

  const isReadOnly = user?.role === 'viewer'

  if (!user) return null

  return (
    <AppShell title="Inventory Planning" subtitle="Size, colour & consumption planning">
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Inventory Planning</div>
      <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 24 }}>Enter size ratios, colours, and fabric consumption per style.</div>

      {loading ? (
        <div className="spinner-wrap"><div className="spinner"/></div>
      ) : styles.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <div className="empty-text">No styles in Inventory Planning</div>
          <div className="empty-sub">Approve the RFP stage on a style to unlock inventory planning.</div>
        </div>
      ) : styles.map(s => {
        const styleRows = rows[s.id] || []
        const totalPcs = styleRows.reduce((a, r) => a + Number(r.pcs_per_colour || 0), 0)
        return (
          <div key={s.id} className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="td-code">{s.style_code}</span>
                  <span className="card-title">{s.name}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--t3)', marginTop: 3 }}>{s.gender} · {s.category} · {s.fabric_platform} · {s.season || '—'}</div>
              </div>
              {!isReadOnly && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => addRow(s.id)}>+ Add Colour</button>
                  <button className="btn btn-primary btn-sm" onClick={() => saveRows(s.id)} disabled={saving === s.id}>
                    {saving === s.id ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {INV_LABELS.map(l => <th key={l}>{l}</th>)}
                    {!isReadOnly && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {styleRows.map((row, idx) => (
                    <tr key={idx} style={{ cursor: 'default' }}>
                      {INV_FIELDS.map((field, fi) => (
                        <td key={field} style={{ padding: '8px 10px' }}>
                          {isReadOnly ? (
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row[field] || (fi === 0 ? '—' : '0')}</span>
                          ) : (
                            <input
                              className={`inv-input${field === 'colour' ? ' wide' : ''}`}
                              value={row[field] || ''}
                              placeholder={fi === 0 ? 'Colour' : field.includes('cons') ? 'm' : field.includes('price') || field === 'mrp' ? '₹' : '0'}
                              onChange={e => updateCell(s.id, idx, field, e.target.value)}
                            />
                          )}
                        </td>
                      ))}
                      {!isReadOnly && (
                        <td style={{ padding: '8px 10px' }}>
                          <button className="btn btn-xs btn-danger" onClick={() => removeRow(s.id, idx, row.id)}>×</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPcs > 0 && (
              <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-dim)', display: 'flex', gap: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>Total Pieces: <strong style={{ color: 'var(--t1)' }}>{totalPcs}</strong></div>
                <div style={{ fontSize: 12, color: 'var(--t3)' }}>Colours: <strong style={{ color: 'var(--t1)' }}>{styleRows.filter(r => r.colour).length}</strong></div>
              </div>
            )}
          </div>
        )
      })}
    </AppShell>
  )
}
