import { expect, test } from '@playwright/test'
import { mockAuthenticatedSession } from './shared/auth-helpers'

const colleagueCatalog = {
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
      key: 'leaveDates',
      label: 'Leave dates',
      kind: 'stored',
      dataType: 'string',
      filterable: false,
      columnable: true,
    },
  ],
  listAudienceLevel: 'colleague',
}

const subjectPersonId = '22222222-2222-4222-8222-222222222222'

const colleagueList = {
  items: [
    {
      personId: subjectPersonId,
      values: {
        fullName: 'Colleague Subject',
        position: 'Engineer',
        leaveDates: '2026-06-01 – 2026-06-10',
      },
      editableFields: [],
    },
  ],
  page: 1,
  pageSize: 50,
  totalCount: 1,
}

const colleagueProfile = {
  s1: {
    fullName: 'Colleague Subject',
    photoUrl: null,
    position: 'Engineer',
    department: { id: 'dept-1', name: 'Platform' },
    countryCity: 'Kyiv',
    workEmail: 'subject@example.com',
    workPhone: null,
    birthdayMonth: 3,
    birthdayDay: 15,
    startDate: '2020-01-01T00:00:00.000Z',
    manager: { id: 'mgr-1', fullName: 'Manager Person' },
    peoplePartner: { id: 'pp-1', fullName: 'PP Person' },
  },
  s10: [{ startDate: '2026-06-01T00:00:00.000Z', endDate: '2026-06-10T00:00:00.000Z' }],
  s11: [{ projectName: 'Project Alpha' }],
  s16: [],
}

test.describe('All Employees colleague mode', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page)

    await page.route('**/api/v1/employees/field-catalog**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(colleagueCatalog),
      }),
    )

    await page.route('**/api/v1/employees/saved-views**', route =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          statusCode: 403,
          error: 'COLLEAGUE_BROWSE_RESTRICTED',
          message: 'blocked',
        }),
      }),
    )

    await page.route('**/api/v1/employees?**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(colleagueList),
      }),
    )

    await page.route(`**/api/v1/people/${subjectPersonId}/profile**`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(colleagueProfile),
      }),
    )
  })

  test('hides export and saved views, then opens limited profile from row click', async ({
    page,
  }) => {
    await page.goto('/all-employees')

    await expect(page.getByTestId('export-xlsx')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '+ New view' })).toHaveCount(0)

    await page.getByRole('cell', { name: 'Colleague Subject' }).click()

    await expect(page).toHaveURL(`/people/${subjectPersonId}`)
    await expect(page.getByRole('heading', { name: 'Colleague Subject' })).toBeVisible()
    await expect(page.getByText('Project Alpha')).toBeVisible()
    await expect(page.getByText('vacation')).toHaveCount(0)
  })
})
