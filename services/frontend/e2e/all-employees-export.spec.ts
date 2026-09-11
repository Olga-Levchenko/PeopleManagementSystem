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

const managementList = {
  items: [
    {
      personId: '22222222-2222-4222-8222-222222222222',
      values: { fullName: 'Managed Person', position: 'Engineer' },
      editableFields: ['countryCity'],
    },
  ],
  page: 1,
  pageSize: 50,
  totalCount: 1,
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

  test('management catalog row click navigates to employee profile', async ({ page }) => {
    const subjectPersonId = '22222222-2222-4222-8222-222222222222'

    await page.route('**/api/v1/employees?**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(managementList),
      }),
    )

    await page.route(`**/api/v1/people/${subjectPersonId}/profile**`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          s1: {
            fullName: 'Managed Person',
            photoUrl: null,
            position: 'Engineer',
            department: { id: 'dept-1', name: 'Platform' },
            countryCity: 'Kyiv',
            workEmail: 'managed@example.com',
            workPhone: null,
            birthdayMonth: null,
            birthdayDay: null,
            startDate: '2020-01-01T00:00:00.000Z',
            manager: { id: 'mgr-1', fullName: 'Manager Person' },
            peoplePartner: null,
          },
          s10: [],
          s11: [{ projectName: 'Delivery Alpha', role: 'Developer' }],
        }),
      }),
    )

    await page.goto('/all-employees')
    await page.getByRole('cell', { name: 'Managed Person' }).click()

    await expect(page).toHaveURL(`/people/${subjectPersonId}`)
    await expect(page.getByRole('heading', { name: 'Managed Person' })).toBeVisible()
    await expect(page.getByText('Delivery Alpha')).toBeVisible()
  })
})
