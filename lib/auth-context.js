'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, getStoredSession, ROLE_PAGES } from '@/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = loading
  const router          = useRouter()

  useEffect(() => {
    getCurrentUser().then(u => setUser(u ?? null))

    // Keep multiple tabs in sync.
    const onStorage = e => {
      if (e.key !== 'saadaa.session') return
      if (!e.newValue) { setUser(null); router.push('/login'); return }
      getCurrentUser().then(u => setUser(u ?? null))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function useRequireAuth(allowedRoles = null) {
  const { user } = useAuth()
  const router   = useRouter()

  useEffect(() => {
    if (user === undefined) return
    if (user === null) { router.push('/login'); return }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      router.push(ROLE_PAGES[user.role] || '/styles')
    }
  }, [user])

  return user
}
