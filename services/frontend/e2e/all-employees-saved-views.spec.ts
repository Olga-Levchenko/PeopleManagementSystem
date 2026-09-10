import { expect, test } from '@playwright/test'
import { mockAuthenticatedSession } from './shared/auth-helpers'

const catalog = {
  fields: [
    {
      key: 'fullName',
      label: 'Full name',
      kind: 'stored',
      dataType: 'string',
      filterable: false,
      columnable: true,
    },
    {
      key: 'position',
      label: 'Position',
      kind: 'stored',
      dataType: 'string',
      filterable: false,
      columnable: true,
    },
    {
      key: 'countryCity',
      label: 'Country / city',
      kind: 'stored',
      dataType: 'string',
      filterable: true,
      columnable: true,
    },
  ],
  listAudienceLevel: 'management',
}

const emptyList = {
  items: [],
  page: 1,
  pageSize: 25,
  totalCount: 0,
}

const ownedView = {
  id: 'view-owned',
  name: 'Kyiv team',
  creatorPersonId: 'owner-1',
  isOwner: true,
  pageSize: 25,
  configuration: {
    visibleColumnKeys: ['fullName', 'countryCity'],
    filters: { countryCity: 'Kyiv' },
  },
  applicableConfiguration: {
    visibleColumnKeys: ['fullName', 'countryCity'],
    filters: { countryCity: 'Kyiv' },
  },
}

const sharedView = {
  id: 'view-shared',
  name: 'Shared Warsaw',
  creatorPersonId: 'owner-2',
  isOwner: false,
  pageSize: 50,
  configuration: {
    visibleColumnKeys: ['fullName', 'position'],
    filters: { countryCity: 'Warsaw' },
  },
  applicableConfiguration: {
    visibleColumnKeys: ['fullName', 'position'],
    filters: { countryCity: 'Warsaw' },
  },
}

test.describe('All Employees saved views', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page)

    await page.route('**/api/v1/employees/field-catalog**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(catalog),
      }),
    )

    await page.route('**/api/v1/employees/saved-views**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([ownedView, sharedView]),
      }),
    )

    await page.route('**/api/v1/employees?**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptyList),
      }),
    )
  })

  test('applies saved view filters when switching tabs', async ({ page }) => {
    await page.goto('/all-employees')

    await page.getByRole('button', { name: 'Kyiv team', exact: true }).click()

    const countryCityInput = page.getByLabel('Country / city')
    await expect(countryCityInput).toHaveValue('Kyiv')
  })

  test('shows read-only affordance for shared views', async ({ page }) => {
    await page.goto('/all-employees')

    await page.getByRole('button', { name: /Shared Warsaw/ }).click()

    await expect(page.getByText('Read-only shared view')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Delete view' })).toHaveCount(0)
  })

  test('deletes owned view and returns to All tab', async ({ page }) => {
    let savedViews = [ownedView, sharedView]

    await page.route('**/api/v1/employees/saved-views**', async route => {
      const method = route.request().method()
      const url = route.request().url()

      if (method === 'DELETE' && url.includes('/saved-views/view-owned')) {
        savedViews = savedViews.filter(view => view.id !== 'view-owned')
        await route.fulfill({ status: 204 })
        return
      }

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(savedViews),
        })
        return
      }

      await route.fallback()
    })

    page.on('dialog', dialog => {
      void dialog.accept()
    })

    await page.goto('/all-employees')

    await page.getByRole('button', { name: 'Kyiv team', exact: true }).click()
    await page.getByRole('button', { name: 'Delete view' }).click()

    await expect(page.getByRole('button', { name: 'Kyiv team', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Delete view' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'All', exact: true })).toHaveClass(/font-semibold/)
    await expect(page.getByLabel('Country / city')).toHaveValue('')
  })
})
