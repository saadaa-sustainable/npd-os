'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signInWithEmail, getStoredSession, getCurrentUser, ROLE_PAGES, ALLOWED_EMAIL_DOMAIN } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

export default function LoginPage() {
  const [email, setEmail]     = useState('')
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { setUser } = useAuth()

  useEffect(() => {
    if (!getStoredSession()) return
    getCurrentUser().then(u => {
      if (u) {
        setUser(u)
        router.push(ROLE_PAGES[u.role] || '/styles')
      }
    })
  }, [])

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const profile = await signInWithEmail(email)
      setUser(profile)
      router.push(ROLE_PAGES[profile.role] || '/styles')
    } catch (err) {
      setError(err.message || 'Sign in failed.')
      setLoading(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-grid" />
      <div className="login-card">
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div className="brand-mark" style={{ width: 42, height: 42 }}>
            <svg width="22" height="22" fill="none" stroke="#09090c" strokeWidth="3" strokeLinecap="round" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--t1)' }}>SAADAA</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '1px' }}>NPD Operating System</div>
          </div>
        </div>

        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Welcome back</div>
        <div style={{ fontSize: 13, color: 'var(--t3)', marginBottom: 24 }}>
          Sign in with your team email to continue.
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Email address</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
              autoComplete="email"
              required
              autoFocus
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ justifyContent: 'center', padding: '12px' }}>
            {loading ? 'Signing in…' : 'Continue →'}
          </button>
        </form>

        <div style={{ marginTop: 20, fontSize: 11.5, color: 'var(--t3)', textAlign: 'center' }}>
          Access is limited to <strong>@{ALLOWED_EMAIL_DOMAIN}</strong> emails.
        </div>
      </div>
    </div>
  )
}
