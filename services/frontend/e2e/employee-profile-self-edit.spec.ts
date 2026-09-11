import { expect, test } from '@playwright/test'
import { mockAuthenticatedSession } from './shared/auth-helpers'

const selfPersonId = 'test-sub-001'

const selfProfile = {
  isSelf: true,
  s1: {
    fullName: 'Playwright Self',
    photoUrl: null,
    position: 'Engineer',
    department: null,
    countryCity: 'Kyiv',
    workEmail: 'playwright@example.com',
    workPhone: null,
    birthdayMonth: null,
    birthdayDay: null,
    startDate: null,
    manager: null,
    peoplePartner: null,
  },
  s2: {
    personalPhone: '+380000000100',
    personalEmail: 'self.personal@example.com',
    residentialAddress: '1 Example Street',
  },
}

test.describe('Employee profile self-edit', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page)
  })

  test('own profile S2 field is editable and PATCH persists', async ({ page }) => {
    let patchedBody: { fieldKey: string; value: unknown } | null = null

    await page.route(`**/api/v1/people/${selfPersonId}/profile`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(selfProfile),
      }),
    )

    await page.route(`**/api/v1/people/${selfPersonId}/profile/fields`, async route => {
      const request = route.request()
      patchedBody = (await request.postDataJSON()) as {
        fieldKey: string
        value: unknown
      }
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fieldKey: patchedBody.fieldKey,
          value: patchedBody.value,
        }),
      })
    })

    await page.goto(`/people/${selfPersonId}`)

    await expect(page.getByRole('heading', { name: 'Playwright Self' })).toBeVisible()

    await page.getByRole('button', { name: '+380000000100' }).click()
    const input = page.getByRole('textbox')
    await input.fill('+380000000199')
    await input.blur()

    await expect.poll(() => patchedBody).toEqual({
      fieldKey: 'personalPhone',
      value: '+380000000199',
    })

    await expect(page.locator('[aria-live="polite"]')).toContainText('Saved personalPhone.')
  })

  test('own profile shows read-only Employment and Career sections', async ({ page }) => {
    const profileWithS4S9 = {
      ...selfProfile,
      s4: {
        employmentType: 'FTE',
        grade: 'L5',
        seniority: 'Senior',
        englishLevel: 'B2',
      },
      s9: [
        {
          occurredAt: '2024-01-01T00:00:00.000Z',
          eventType: 'GRADE_CHANGE',
          summary: 'Promoted to L5',
        },
      ],
    }

    await page.route(`**/api/v1/people/${selfPersonId}/profile`, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(profileWithS4S9),
      }),
    )

    await page.goto(`/people/${selfPersonId}`)

    const employmentSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Employment' }) })

    await expect(page.getByRole('heading', { name: 'Employment' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Career timeline' })).toBeVisible()
    await expect(employmentSection.getByText('FTE', { exact: true })).toBeVisible()
    await expect(employmentSection.getByText('L5', { exact: true })).toBeVisible()
    await expect(page.getByText('Promoted to L5')).toBeVisible()
    await expect(employmentSection.getByRole('button')).toHaveCount(0)
  })
})
