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
  ],
  listAudienceLevel: 'management',
}

const emptyList = {
  items: [],
  page: 1,
  pageSize: 50,
  totalCount: 0,
}

test.describe('All Employees export', () => {
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
        body: JSON.stringify([]),
      }),
    )

    await page.route('**/api/v1/employees?**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(emptyList),
      }),
    )

    await page.route('**/api/v1/employees/export**', route =>
      route.fulfill({
        status: 200,
        headers: {
          'content-type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': 'attachment; filename="employees-export.xlsx"',
        },
        body: Buffer.from('mock-xlsx-content'),
      }),
    )
  })

  test('clicking export starts a file download', async ({ page }) => {
    await page.goto('/all-employees')

    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('export-xlsx').click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toContain('employees-export.xlsx')
  })
})
