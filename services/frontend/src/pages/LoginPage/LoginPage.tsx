import { Button } from '@/components/ui/button'
import { env } from '@/config/env'

/**
 * Public sign-in page. Clicking "Sign in" initiates a full-page navigation to the BFF's
 * `/auth/login` endpoint, which starts the PKCE authorization-code flow and redirects the
 * browser to Keycloak. Full-page navigation (not axios/fetch) is intentional: it lets the
 * browser follow the BFF → Keycloak → BFF callback redirect chain and set the session cookie
 * correctly across origins.
 */
export const LoginPage = () => {
  const handleSignIn = () => {
    window.location.href = `${env.api.baseUrl}/api/v1/auth/login`
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="bg-card text-card-foreground border border-border rounded-lg p-8 shadow-sm w-full max-w-sm flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold text-foreground">People Management</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with your organisation account to continue.
          </p>
        </div>
        <Button className="w-full" onClick={handleSignIn}>
          Sign in
        </Button>
      </div>
    </div>
  )
}
