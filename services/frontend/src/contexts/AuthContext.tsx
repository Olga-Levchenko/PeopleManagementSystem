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
  signOut: () => void
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

  const signOut = (): void => {
    // Use a form POST so the browser follows the full redirect chain:
    // BFF /logout → Keycloak end_session → post_logout_redirect_uri (/login).
    // fetch() with redirect:'manual' or redirect:'follow' cannot do this correctly across
    // origins — fetch intercepts the redirect and the Keycloak SSO session is never terminated.
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = `${env.api.baseUrl}/api/v1/auth/logout`
    document.body.appendChild(form)
    form.submit()
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
