import type { Page } from '@playwright/test'

/**
 * Intercept the /me session-check that AuthContext fires on mount and return a
 * fake authenticated user.  Without this, ProtectedRoute sees no session and
 * redirects every test to /login before the page under test can render.
 *
 * Call inside a beforeEach for any describe block whose routes are protected.
 */
export const mockAuthenticatedSession = async (page: Page): Promise<void> => {
  await page.route('**/api/v1/auth/me', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sub: 'test-sub-001', email: 'playwright@example.com' }),
    }),
  )
}
