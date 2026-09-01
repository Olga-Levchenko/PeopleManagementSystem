import { test, expect, type Page } from '@playwright/test'

const relationshipForm = (page: Page, title: string) =>
  page.getByRole('heading', { name: title, exact: true }).locator('..')

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
    await expect(page.getByRole('heading', { name: 'Change department', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Change department manager' })).toBeVisible()
  })

  test('should submit all relationship changes through their dedicated endpoints', async ({ page }) => {
    const requests: Array<{ url: string; body: unknown }> = []
    await page.route('**/api/v1/organisational-relationships/**', async route => {
      requests.push({
        url: route.request().url(),
        body: route.request().postDataJSON(),
      })
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    })
    await page.goto('/organisational-relationships')

    const changes = [
      {
        title: 'Change manager',
        target: '22222222-2222-4222-8222-222222222222',
        related: '33333333-3333-4333-8333-333333333333',
        path: '/people/22222222-2222-4222-8222-222222222222/manager',
        body: { relatedPersonId: '33333333-3333-4333-8333-333333333333' },
      },
      {
        title: 'Change People Partner',
        target: '22222222-2222-4222-8222-222222222222',
        related: '44444444-4444-4444-8444-444444444444',
        path: '/people/22222222-2222-4222-8222-222222222222/people-partner',
        body: { relatedPersonId: '44444444-4444-4444-8444-444444444444' },
      },
      {
        title: 'Change department',
        target: '22222222-2222-4222-8222-222222222222',
        related: '',
        path: '/people/22222222-2222-4222-8222-222222222222/department',
        body: { departmentId: null },
      },
      {
        title: 'Change department manager',
        target: '55555555-5555-4555-8555-555555555555',
        related: '33333333-3333-4333-8333-333333333333',
        path: '/departments/55555555-5555-4555-8555-555555555555/manager',
        body: { relatedPersonId: '33333333-3333-4333-8333-333333333333' },
      },
    ] as const

    for (const change of changes) {
      const form = relationshipForm(page, change.title)
      const inputs = form.getByRole('textbox')
      await inputs.nth(0).fill(change.target)
      await inputs.nth(1).fill(change.related)
      await form.getByRole('button').click()
      await expect(page.getByRole('status')).toHaveText('Relationship change submitted.')
    }

    expect(requests).toEqual(
      changes.map(change => ({
        url: `http://localhost:3001/api/v1/organisational-relationships${change.path}`,
        body: change.body,
      })),
    )
  })

  test('should show safe messages for relationship API failures', async ({ page }) => {
    const failures = [
      { status: 400, message: 'Check the IDs and try again.' },
      { status: 403, message: 'You do not have permission to change this relationship.' },
      { status: 404, message: 'The requested person or department was not found.' },
      {
        status: 503,
        message: 'The relationship service is temporarily unavailable. Try again later.',
      },
    ]

    await page.route('**/api/v1/organisational-relationships/**', route =>
      route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"secret"}' }),
    )
    await page.goto('/organisational-relationships')

    for (const failure of failures) {
      await page.unroute('**/api/v1/organisational-relationships/**')
      await page.route('**/api/v1/organisational-relationships/**', route =>
        route.fulfill({
          status: failure.status,
          contentType: 'application/json',
          body: '{"message":"secret"}',
        }),
      )

      await relationshipForm(page, 'Change manager').getByRole('button').click()
      await expect(page.getByRole('status')).toHaveText(failure.message)
      await expect(page.getByRole('status')).not.toContainText('secret')
    }
  })
})
