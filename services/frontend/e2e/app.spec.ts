import { test, expect } from '@playwright/test'

test.describe('App', () => {
  test('should load homepage successfully', async ({ page }) => {
    await page.goto('/')

    // App container renders without errors
    await expect(page.getByTestId('app-container')).toBeVisible()

    // Home page renders inside the main layout
    await expect(page.getByTestId('home-title')).toBeVisible()
  })

  test('should redirect unknown routes to home', async ({ page }) => {
    await page.goto('/some-unknown-route')

    await expect(page).toHaveURL('/')
    await expect(page.getByTestId('home-title')).toBeVisible()
  })

  test('should render the organisational relationship screen', async ({ page }) => {
    await page.goto('/organisational-relationships')

    await expect(page.getByRole('heading', { name: 'Organisational relationships' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Change manager' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Change People Partner' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Change department' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Change department manager' })).toBeVisible()
  })

  test('should show a server authorization error after a rejected change', async ({ page }) => {
    await page.route('**/api/v1/organisational-relationships/**', route =>
      route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }),
    )
    await page.goto('/organisational-relationships')
    await page.getByRole('heading', { name: 'Change manager' }).locator('..').getByRole('button').click()

    await expect(page.getByRole('status')).toHaveText(
      'The relationship change could not be completed.',
    )
  })

  test('should send null when clearing department membership', async ({ page }) => {
    let requestBody: { departmentId: string | null } | undefined
    await page.route('**/api/v1/organisational-relationships/**', async route => {
      requestBody = route.request().postDataJSON() as { departmentId: string | null }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })

    await page.goto('/organisational-relationships')
    const departmentForm = page.getByRole('heading', { name: 'Change department' }).locator('..')
    await departmentForm.locator('input').first().fill('22222222-2222-4222-8222-222222222222')
    await departmentForm.getByRole('button').click()

    await expect(page.getByRole('status')).toHaveText('Relationship change submitted.')
    expect(requestBody).toEqual({ departmentId: null })
  })
})
