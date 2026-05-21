'use client'

import { useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'

const stages = [
  {
    num: 1, cls: 'sc-1', color: 'blue', badge: 'Initiation Gate',
    name: 'Style Creation',
    desc: 'Official initiation — auto style code generation, product classification, brief creation, maker-checker submission',
    deps: null,
    substages: [
      { icon: '📝', name: 'Product Naming', detail: 'Full descriptive name e.g. "Women Cotton Straight Pant"', tag: 'Maker' },
      { icon: '🔑', name: 'Auto Style Code Generation', detail: 'System generates code from name: SD/SM prefix + consonants e.g. SDCSP, SMJRT', tag: 'Auto' },
      { icon: '🏷️', name: 'Product Classification', detail: 'Gender · Category · Fabric Platform · Season · Launch Collection', tag: 'Maker' },
      { icon: '📄', name: 'Product Brief Creation', detail: 'Product intent, target customer, silhouette direction, references', tag: 'Maker' },
      { icon: '✅', name: 'Maker Submission → Checker Approval', detail: 'Checker reviews all fields and approves before moving to Stage 2', tag: 'Checker' },
    ],
    note: { color: 'primary', title: '💡 Style Code Convention', text: 'SD = Saadaa Women  |  SM = Saadaa Men\nFollowed by consonants of garment type\nSDCP = Women Cotton Pant  ·  SDCSP = Women Cotton Straight Pant  ·  SMJRT = Men Relaxed Tee' }
  },
  {
    num: 2, cls: 'sc-2', color: 'purple', badge: 'Design Gate',
    name: 'Silhouette Approval',
    desc: 'Validates garment shape and design direction before any fabric or sampling investment',
    deps: 'Stage 1 approved',
    substages: [
      { icon: '🎨', name: 'Sketch Upload', detail: 'Technical flat sketch — front, back, side', tag: 'Maker' },
      { icon: '📸', name: 'Reference Upload', detail: 'Competitor or mood board references for direction alignment', tag: 'Maker' },
      { icon: '🔄', name: 'Internal Review + Revision Loop', detail: 'Feedback given, revisions made, repeats until locked', tag: 'Loopable' },
      { icon: '✅', name: 'Silhouette Sign-Off', detail: 'Checker approves final shape. Unlocks Fit Check.', tag: 'Checker' },
    ],
  },
  {
    num: 3, cls: 'sc-3', color: 'yellow', badge: 'Validation Gate',
    name: 'Fit Check',
    desc: 'Mandatory physical validation checkpoint. Fit photos are a hard dependency before RFP.',
    deps: 'Stage 2 approved',
    substages: [
      { icon: '👗', name: 'Fit Sample Upload', detail: 'Proto/fit sample received from vendor and documented', tag: 'Maker' },
      { icon: '📷', name: 'Fit Check Photo Upload', detail: 'MANDATORY — on-model photos: front, back, side with measurement callouts', tag: 'Required' },
      { icon: '💬', name: 'Internal Feedback + Revision Loop', detail: 'Fit comments logged, amendments sent back to vendor', tag: 'Loopable' },
      { icon: '✅', name: 'Fit Approval', detail: 'Approved fit with photos uploaded unlocks RFP stage.', tag: 'Checker' },
    ],
    note: { color: 'red', title: '⚠️ Hard Rule', text: 'Fit photos must be uploaded before this stage can be approved. RFP checklist will block if missing.' }
  },
  {
    num: 4, cls: 'sc-4', color: 'orange', badge: 'Commercial Gate',
    name: 'RFP — Request for Production',
    desc: 'Commercial and operational readiness. All checklist items mandatory before approval.',
    deps: 'Fit approved + Photos uploaded',
    substages: [
      { icon: '📋', name: 'RFP Document Creation', detail: 'Full spec sheet with all style specifications raised to vendor', tag: 'Maker' },
      { icon: '💰', name: 'Costing Added', detail: 'Target buying price, sale price, MRP, margin calculation', tag: 'Maker' },
      { icon: '📐', name: 'CAD + Consumption Attached', detail: 'CAD link + fabric consumption at 54" and 56" width', tag: 'Maker' },
      { icon: '💬', name: 'Vendor Feedback + Revision Loop', detail: 'Costing revisions, comments resolved, documented', tag: 'Loopable' },
      { icon: '✅', name: 'Costing Approval → RFP Approval', detail: 'Final commercial sign-off. Unlocks Inventory Planning.', tag: 'Checker' },
    ],
    checklist: ['Silhouette Approved','Fit Approved','Fit Photos Uploaded','CAD Attached','Consumption Added (54" + 56")','Costing Approved'],
  },
  {
    num: 5, cls: 'sc-5', color: 'green', badge: 'Planning',
    name: 'Inventory Planning',
    desc: 'Size ratios, colour quantities, and fabric consumption planning after RFP approval.',
    deps: 'RFP approved',
    substages: [
      { icon: '📏', name: 'Size & Count Planning', detail: 'Size ratios defined per colour — XS/S/M/L/XL/2XL quantities', tag: 'Maker' },
      { icon: '🎨', name: 'Colour + Pieces Per Colour', detail: 'All colourways locked with total quantity per colour', tag: 'Maker' },
      { icon: '🧵', name: 'Consumption Calculation', detail: 'AVG consumption at 54" and 56" width, total fabric required', tag: 'Maker' },
      { icon: '💵', name: 'Pricing Sign-Off', detail: 'Target buying price, sale price, MRP confirmed for all colours', tag: 'Checker' },
    ],
  },
]

export default function WorkflowPage() {
  const user = useRequireAuth()
  const [open, setOpen] = useState({})
  const toggle = i => setOpen(o => ({ ...o, [i]: !o[i] }))

  if (!user) return null

  return (
    <AppShell title="Workflow Guide" subtitle="End-to-end NPD process reference">
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Workflow Guide</div>
      <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 24 }}>5 major stages, maker-checker gates, and workflow dependencies.</div>

      {/* Dependency flow */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Stage Dependencies</div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            {stages.map((s, i) => (
              <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ textAlign: 'center', padding: '10px 14px', background: 'var(--raised)', borderRadius: 'var(--r)', border: '1px solid var(--border-dim)' }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: `var(--${s.color})`, fontFamily: 'var(--font-display)' }}>STAGE {s.num}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', marginTop: 2 }}>{s.name.split(' ')[0]}</div>
                  {s.deps && <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>🔒 {s.deps}</div>}
                </div>
                {i < 4 && <div style={{ color: 'var(--t3)', fontSize: 16 }}>→</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {stages.map((s, i) => (
        <div key={s.num} className="wf-stage">
          <div className="wf-stage-head" onClick={() => toggle(i)}>
            <div className={`stage-circle ${s.cls}`}>{s.num}</div>
            <div style={{ flex: 1 }}>
              <div className="wf-stage-name">{s.name}</div>
              <div className="wf-stage-desc">{s.desc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              {s.deps && <span style={{ fontSize: 10.5, color: 'var(--t3)', background: 'var(--raised)', border: '1px solid var(--border-dim)', padding: '3px 8px', borderRadius: 20 }}>🔒 {s.deps}</span>}
              <span className={`badge badge-${s.color}`}>{s.badge}</span>
              <svg style={{ transition: 'transform .2s', transform: open[i] ? 'rotate(180deg)' : '', color: 'var(--t3)', flexShrink: 0 }} width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"/></svg>
            </div>
          </div>

          {open[i] && (
            <div className="wf-body">
              <div className="substage-list" style={{ marginBottom: s.note || s.checklist ? 14 : 0 }}>
                {s.substages.map(sub => (
                  <div key={sub.name} className="substage-row">
                    <div className="substage-icon" style={{ background: `var(--${s.color}-10)`, color: `var(--${s.color})` }}>{sub.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div className="substage-name">{sub.name}</div>
                      <div className="substage-detail">{sub.detail}</div>
                    </div>
                    <span className={`badge badge-${sub.tag === 'Checker' ? 'yellow' : sub.tag === 'Auto' ? 'grey' : sub.tag === 'Loopable' ? 'grey' : sub.tag === 'Required' ? 'red' : s.color}`}>{sub.tag}</span>
                  </div>
                ))}
              </div>

              {s.note && (
                <div style={{ background: `var(--${s.note.color === 'primary' ? 'primary-glow' : s.note.color+'-10'})`, border: `1px solid var(--${s.note.color === 'primary' ? 'primary-10' : s.note.color+'-10'})`, borderRadius: 'var(--r-sm)', padding: '12px 14px', marginBottom: s.checklist ? 14 : 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: `var(--${s.note.color})`, marginBottom: 4 }}>{s.note.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{s.note.text}</div>
                </div>
              )}

              {s.checklist && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Mandatory RFP Checklist</div>
                  {s.checklist.map(item => (
                    <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--raised)', border: '1px solid var(--border-dim)', borderRadius: 'var(--r-sm)', marginBottom: 6 }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#09090c', flexShrink: 0 }}>✓</div>
                      <div style={{ fontSize: 13, color: 'var(--t1)', flex: 1 }}>{item}</div>
                      <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700 }}>Mandatory</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Role reference */}
      <div className="card" style={{ marginTop: 8 }}>
        <div className="card-header"><div className="card-title">Role Reference</div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Role</th><th>Pages</th><th>Can Do</th><th>Cannot Do</th></tr></thead>
            <tbody>
              {[
                ['founder','Admin','All pages','Create, edit, approve, reject, delete, manage users','—'],
                ['checker','Checker','Styles, Approvals, Inventory, Weekly Plan, Workflow','Approve/reject, edit Weekly Plan dates','Cannot create styles or plans'],
                ['maker','Maker','Styles, New Style, Inventory, Weekly Plan, Workflow','Create, edit, submit, and hold/cancel own work','Cannot approve or edit users'],
                ['viewer','Viewer','Overview, Styles (read-only), Workflow','View pipeline, stats, workflow guide','Cannot create, edit, or approve anything'],
              ].map(([role, label, pages, can, cannot]) => (
                <tr key={role} style={{ cursor: 'default' }}>
                  <td><span className={`badge role-${role}`}>{label}</span></td>
                  <td style={{ color: 'var(--t1)', fontSize: 12 }}>{pages}</td>
                  <td style={{ color: 'var(--green)', fontSize: 12 }}>{can}</td>
                  <td style={{ color: role === 'founder' ? 'var(--t3)' : 'var(--red)', fontSize: 12 }}>{cannot}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}
