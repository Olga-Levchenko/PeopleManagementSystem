import { expect, test } from '@playwright/test'
import { mockAuthenticatedSession } from './shared/auth-helpers'

const managementCatalog = {
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

const subjectPersonId = '33333333-3333-4333-8333-333333333333'

const managementList = {
  items: [
    {
      personId: subjectPersonId,
      values: { fullName: 'Report Person', position: 'Senior Engineer' },
      editableFields: [],
    },
  ],
  page: 1,
  pageSize: 50,
  totalCount: 1,
}

const managementProfile = {
  isSelf: false,
  s1: {
    fullName: 'Report Person',
    photoUrl: '/api/v1/people/33333333-3333-4333-8333-333333333333/profile/photo',
    position: 'Senior Engineer',
    department: { id: 'dept-2', name: 'Engineering' },
    countryCity: 'Lviv',
    workEmail: 'report@example.com',
    workPhone: '+380000000001',
    birthdayMonth: 7,
    birthdayDay: 20,
    startDate: '2019-05-01T00:00:00.000Z',
    manager: { id: 'mgr-2', fullName: 'Unit Manager' },
    peoplePartner: { id: 'pp-2', fullName: 'People Partner' },
  },
  s2: {
    personalPhone: '+380000000002',
    personalEmail: 'report.personal@example.com',
    residentialAddress: 'Example Street 1',
  },
  s10: [
    {
      startDate: '2026-07-01T00:00:00.000Z',
      endDate: '2026-07-14T00:00:00.000Z',
      leaveType: 'vacation',
    },
  ],
  s11: [
    {
      projectName: 'Platform Revamp',
      role: 'Tech Lead',
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: null,
    },
  ],
  s4: {
    employmentType: 'FTE',
    grade: 'L5',
    seniority: 'Senior',
    englishLevel: 'B2',
  },
  s9: [
    {
      occurredAt: '2023-01-15T00:00:00.000Z',
      eventType: 'GRADE_CHANGE',
      summary: 'Promoted to L5',
    },
  ],
  s3: [
    {
      id: 'ec-mgmt-1',
      contactName: 'Emergency Contact',
      relationship: 'Parent',
      phone: '+380000000003',
    },
  ],
  s5: [
    {
      id: 'cert-mgmt-1',
      fileName: 'aws-sa.pdf',
      uploadedAt: '2025-06-01T00:00:00.000Z',
      downloadUrl:
        '/api/v1/people/33333333-3333-4333-8333-333333333333/profile/certificates/cert-mgmt-1/download',
    },
  ],
  s16: [{ fieldId: 'cf-1', name: 'Certification', value: 'AWS SA' }],
}

test.describe('All Employees management profile navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page)

    await page.route('**/api/v1/employees/field-catalog**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(managementCatalog),
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
        body: JSON.stringify(managementList),
      }),
    )

    await page.route(`**/api/v1/people/${subjectPersonId}/profile**`, route => {
      if (route.request().url().includes('/profile/photo')) {
        return route.fulfill({
          status: 200,
          contentType: 'image/jpeg',
          body: Buffer.from('fake-image'),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(managementProfile),
      })
    })
  })

  test('opens employee profile with management-tier sections from row click', async ({ page }) => {
    await page.goto('/all-employees')

    await page.getByRole('cell', { name: 'Report Person' }).click()

    await expect(page).toHaveURL(`/people/${subjectPersonId}`)
    await expect(page.getByRole('heading', { name: 'Report Person' })).toBeVisible()
    await expect(page.getByText('Personal contacts')).toBeVisible()
    await expect(page.getByText('report.personal@example.com')).toBeVisible()
    await expect(page.getByText('vacation')).toBeVisible()
    await expect(page.getByText('Platform Revamp')).toBeVisible()
    await expect(page.getByText('Tech Lead')).toBeVisible()
    await expect(page.getByText('Certification')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Employment' })).toBeVisible()
    await expect(page.locator('dd', { hasText: 'L5' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Career timeline' })).toBeVisible()
    await expect(page.getByText('Promoted to L5')).toBeVisible()
    const personalContactsSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Personal contacts' }) })
    await expect(personalContactsSection.getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Emergency contacts' })).toBeVisible()
    await expect(page.getByText('Emergency Contact', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Certificates' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'aws-sa.pdf' })).toBeVisible()
    await expect(page.getByTestId('management-profile-photo')).toBeVisible()
    const emergencySection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Emergency contacts' }) })
    await expect(emergencySection.getByRole('button')).toHaveCount(0)
  })
})
