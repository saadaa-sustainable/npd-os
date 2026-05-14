'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useRequireAuth } from '@/lib/auth-context'
import { getAllUsers, updateUserRole, supabase } from '@/lib/supabase'
import { useToast } from '@/components/Toast'

const ROLES = ['founder','checker','maker','viewer']

const ROLE_INFO = {
  founder: { label: 'Founder',  desc: 'Full access — all pages, user management, delete styles', color: 'primary' },
  checker: { label: 'Checker',  desc: 'Approve or reject styles, view audit logs',               color: 'yellow' },
  maker:   { label: 'Maker',    desc: 'Create and edit styles, submit for approval',              color: 'blue' },
  viewer:  { label: 'Viewer',   desc: 'Read-only access — team members whose role is not yet defined', color: 'grey' },
}

export default function AdminPage() {
  const user  = useRequireAuth(['founder'])
  const toast = useToast()
  const [users, setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invite, setInvite] = useState({ full_name: '', email: '', role: 'maker' })
  const [inviting, setInviting] = useState(false)

  const loadUsers = () => getAllUsers().then(u => { setUsers(u); setLoading(false) })

  useEffect(() => { if (user) loadUsers() }, [user])

  const changeRole = async (userId, role) => {
    try { await updateUserRole(userId, role); toast(`Role updated to ${role} ✓`, 'success') }
    catch(e) { toast(e.message, 'error') }
  }

  const handleInvite = async e => {
    e.preventDefault()
    if (!invite.full_name || !invite.email || !invite.role) { toast('Fill all fields', 'error'); return }
    setInviting(true)
    try {
      // Create user via Supabase Auth Admin (requires service role — works via Edge Function)
      // For now: create via normal signup with a temp password and update profile
      const { data, error } = await supabase.auth.admin?.createUser?.({
        email: invite.email,
        password: 'ChangeMe@123',
        user_metadata: { full_name: invite.full_name, role: invite.role },
        email_confirm: true,
      })
      if (error) throw error
      toast(`User ${invite.email} created. Default password: ChangeMe@123`, 'success')
      setInviteOpen(false)
      setInvite({ full_name: '', email: '', role: 'maker' })
      loadUsers()
    } catch {
      // Fallback: show manual instructions
      toast(`To add users: go to your Supabase dashboard → Authentication → Users → Add user. Then set role in the profiles table.`, 'info')
      setInviteOpen(false)
    } finally { setInviting(false) }
  }

  const formatDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—'

  if (!user) return null

  const roleSorted = [...ROLES].map(r => ({ role: r, count: users.filter(u => u.role === r).length }))

  return (
    <AppShell title="User Management" subtitle="Manage team access and roles">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, marginBottom: 4 }}>User Management</div>
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>Manage who has access to the SAADAA NPD Operating System.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          Add User
        </button>
      </div>

      {/* Role summary cards */}
      <div className="g-2" style={{ marginBottom: 24 }}>
        {Object.entries(ROLE_INFO).map(([role, info]) => (
          <div key={role} className="card">
            <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span className={`badge role-${role}`} style={{ marginTop: 2 }}>{role}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>{info.label}</div>
                <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>{info.desc}</div>
                <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  {users.filter(u => u.role === role).length} member{users.filter(u => u.role === role).length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="card-header">
          <div className="card-title">Team Members ({users.length})</div>
        </div>
        {loading ? (
          <div className="spinner-wrap"><div className="spinner"/></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Member</th><th>Email</th><th>Role</th><th>Joined</th><th>Change Role</th></tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ cursor: 'default' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                          {(u.full_name || u.email || 'U')[0].toUpperCase()}
                        </div>
                        <div className="td-primary">{u.full_name || '—'}</div>
                        {u.id === user.id && <span className="badge badge-primary" style={{ fontSize: 9 }}>You</span>}
                      </div>
                    </td>
                    <td className="td-muted">{u.email || '—'}</td>
                    <td><span className={`badge role-${u.role}`}>{u.role}</span></td>
                    <td className="td-muted">{formatDate(u.created_at)}</td>
                    <td>
                      {u.id !== user.id ? (
                        <select
                          className="select-filter"
                          style={{ minWidth: 110, padding: '5px 10px', fontSize: 12 }}
                          defaultValue={u.role}
                          onChange={e => changeRole(u.id, e.target.value)}
                        >
                          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : <span className="td-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setInviteOpen(false)}>
          <div className="modal modal-sm">
            <div className="modal-head">
              <div>
                <div className="modal-title">Add Team Member</div>
                <div className="modal-sub">User will need to reset their password on first login</div>
              </div>
              <button className="modal-close" onClick={() => setInviteOpen(false)}>×</button>
            </div>
            <form onSubmit={handleInvite}>
              <div className="modal-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="form-group">
                    <label className="form-label">Full Name <span className="req">*</span></label>
                    <input className="form-input" value={invite.full_name} onChange={e => setInvite(i => ({...i, full_name: e.target.value}))} placeholder="e.g. Priya Sharma" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Address <span className="req">*</span></label>
                    <input className="form-input" type="email" value={invite.email} onChange={e => setInvite(i => ({...i, email: e.target.value}))} placeholder="priya@saadaa.in" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Role <span className="req">*</span></label>
                    <select className="form-select" value={invite.role} onChange={e => setInvite(i => ({...i, role: e.target.value}))}>
                      {ROLES.map(r => <option key={r} value={r}>{r} — {ROLE_INFO[r].desc.split(' —')[0]}</option>)}
                    </select>
                  </div>
                  <div style={{ background: 'var(--yellow-10)', border: '1px solid rgba(255,212,59,.2)', borderRadius: 'var(--r-sm)', padding: '10px 14px', fontSize: 12, color: 'var(--yellow)' }}>
                    📋 For reliable user creation, use your <strong>Supabase Dashboard → Authentication → Users → Add user</strong>, then set their role in the SETUP guide.
                  </div>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={() => setInviteOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={inviting}>{inviting ? 'Adding…' : 'Add User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  )
}
