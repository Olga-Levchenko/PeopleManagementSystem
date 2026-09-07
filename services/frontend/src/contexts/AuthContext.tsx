/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { env } from '@/config/env'

interface AuthUser {
  sub: string
  email: string | undefined
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const checkSession = async () => {
      try {
        const res = await fetch(`${env.api.baseUrl}/api/v1/auth/me`, {
          credentials: 'include',
        })

        if (!cancelled) {
          if (res.ok) {
            const data = (await res.json()) as AuthUser
            setUser(data)
          } else {
            setUser(null)
          }
        }
      } catch {
        if (!cancelled) {
          setUser(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void checkSession()

    return () => {
      cancelled = true
    }
  }, [])

  const signOut = async (): Promise<void> => {
    try {
      // POST to /logout; the BFF destroys the session and redirects to Keycloak end_session.
      // We follow the redirect chain via a full-page navigation rather than axios so the browser
      // lands on the login page after Keycloak SSO is also terminated.
      await fetch(`${env.api.baseUrl}/api/v1/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        redirect: 'manual',
      })
    } catch {
      // Network error or redirect blocked -- fall through to redirect to /login locally.
    }
    window.location.href = '/login'
  }

  return <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
