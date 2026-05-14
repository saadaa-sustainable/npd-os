'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { signOut, supabase } from '@/lib/supabase'
import Toast from '@/components/Toast'

const NAV = [
  { id: 'dashboard',  label: 'Overview',          href: '/dashboard',  roles: ['founder','viewer'],                   icon: IconGrid },
  { id: 'styles',     label: 'All Styles',         href: '/styles',     roles: ['founder','maker','checker','viewer'],  icon: IconClip },
  { id: 'styles/new', label: 'New Style',          href: '/styles/new', roles: ['founder','maker'],                    icon: IconPlus },
  { id: 'approvals',  label: 'Approvals',          href: '/approvals',  roles: ['founder','checker'],                  icon: IconShield, badge: true },
  { id: 'inventory',  label: 'Inventory Planning', href: '/inventory',  roles: ['founder','maker','checker'],          icon: IconBox },
  { id: 'workflow',   label: 'Workflow Guide',     href: '/workflow',   roles: ['founder','maker','checker','viewer'], icon: IconZap },
  { id: 'admin',      label: 'User Management',    href: '/admin',      roles: ['founder'],                            icon: IconUsers },
]

export default function AppShell({ children, title, subtitle }) {
  const { user, setUser } = useAuth()
  const pathname   = usePathname()
  const router     = useRouter()
  const [pending, setPending] = useState(0)

  useEffect(() => {
    if (!user) return
    if (!['founder','checker'].includes(user.role)) return
    supabase.from('styles').select('id', { count: 'exact', head: true })
      .eq('approval_status', 'pending')
      .then(({ count }) => setPending(count || 0))
  }, [user, pathname])

  const handleSignOut = async () => {
    await signOut()
    setUser(null)
    router.push('/login')
  }

  if (!user) return (
    <div className="shell" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </div>
  )

  const initials = (user.full_name || user.email || 'U')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const visibleNav = NAV.filter(n => n.roles.includes(user.role))

  return (
    <div className="shell">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">
            <svg width="18" height="18" fill="none" stroke="#09090c" strokeWidth="3" strokeLinecap="round" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div className="brand-name">SAADAA</div>
            <div className="brand-sub">NPD OS</div>
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-label">Navigation</div>
          {visibleNav.map(n => {
            const active = pathname === n.href || (n.href !== '/styles' && pathname.startsWith(n.href))
            return (
              <Link key={n.id} href={n.href} className={`nav-item${active ? ' active' : ''}`}>
                <n.icon />
                {n.label}
                {n.badge && pending > 0 && (
                  <span className="nav-badge">{pending}</span>
                )}
              </Link>
            )
          })}
        </div>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="avatar">{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.full_name || user.email}
              </div>
              <div className="user-role-sm">
                <span className={`badge role-${user.role}`} style={{ fontSize: '9px', padding: '1px 6px' }}>
                  {user.role}
                </span>
              </div>
            </div>
            <button onClick={handleSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', padding: '2px', flexShrink: 0 }} title="Sign out">
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main className="main-content">
        <div className="topbar">
          <div>
            <div className="topbar-title">{title}</div>
            {subtitle && <div className="topbar-sub">{subtitle}</div>}
          </div>
          <div className="topbar-actions" id="topbar-actions" />
        </div>
        <div className="page-body fade-in">
          {children}
        </div>
      </main>

      <Toast />
    </div>
  )
}

// ── Icons ──
function IconGrid()   { return <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> }
function IconClip()   { return <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> }
function IconPlus()   { return <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> }
function IconShield() { return <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> }
function IconBox()    { return <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg> }
function IconZap()    { return <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> }
function IconUsers()  { return <svg className="nav-icon" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> }
