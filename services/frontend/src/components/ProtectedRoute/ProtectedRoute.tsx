import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Route wrapper that enforces authentication for all child routes.
 *
 * - While the auth context is resolving the session, renders a full-screen loading indicator.
 * - Once resolved, renders `<Outlet />` for authenticated users or redirects to `/login`.
 */
export const ProtectedRoute = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div
        className="flex h-screen items-center justify-center bg-background"
        aria-label="Checking authentication"
        role="status"
      >
        <span className="text-muted-foreground text-sm">Loading&hellip;</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
