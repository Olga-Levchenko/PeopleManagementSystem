import { expect, test } from '@playwright/test'
import { mockAuthenticatedSession } from './shared/auth-helpers'

test('shows authorized risks, count drill-through, and profile navigation', async ({ page }) => {
  await mockAuthenticatedSession(page)
  await page.route('**/api/v1/risk-dashboard**', async route => {
    const url = new URL(route.request().url())
    const severity = url.searchParams.get('severity')
    const rows = [{ personId: '33333333-3333-4333-8333-333333333333', fullName: 'Report Person', severity: 'high', recordedAt: '2026-09-01T00:00:00.000Z', trendDirection: 'up', department: { id: 'engineering', label: 'Engineering' }, projects: [], manager: null, peoplePartner: null }]
    await route.fulfill({ json: { counts: { low: 1, need_attention: 0, medium: 0, high: 1, leaver: 0, activeCount: 1 }, rows: severity && severity !== 'high' ? [] : rows, nextCursor: null, catalogs: { departments: [{ id: 'engineering', label: 'Engineering' }], projects: [], managers: [], peoplePartners: [] } } })
  })
  await page.route('**/api/v1/people/**/profile', route => route.fulfill({ json: { isSelf: false, s1: { fullName: 'Report Person' } } }))
  await page.goto('/risk-dashboard')
  await expect(page.getByRole('heading', { name: 'Risk Dashboard' })).toBeVisible()
  await page.getByRole('button', { name: /High/ }).click()
  await expect(page.getByText('Report Person')).toBeVisible()
  await page.getByText('Report Person').click()
  await expect(page).toHaveURL(/\/people\/33333333-3333-4333-8333-333333333333/)
})

test('omits dashboard capability on server authorization denial', async ({ page }) => {
  await mockAuthenticatedSession(page)
  await page.route('**/api/v1/risk-dashboard**', route => route.fulfill({ status: 403 }))
  await page.goto('/risk-dashboard')
  await expect(page.getByRole('heading', { name: 'Risk Dashboard' })).toHaveCount(0)
})
