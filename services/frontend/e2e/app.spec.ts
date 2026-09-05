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
    await expect(
      page.getByRole('heading', { name: 'Change department', exact: true })
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Change department manager' })).toBeVisible()
  })

  test('should submit all relationship changes through their dedicated endpoints', async ({
    page,
  }) => {
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
      }))
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
      route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"secret"}' })
    )
    await page.goto('/organisational-relationships')

    for (const failure of failures) {
      await page.unroute('**/api/v1/organisational-relationships/**')
      await page.route('**/api/v1/organisational-relationships/**', route =>
        route.fulfill({
          status: failure.status,
          contentType: 'application/json',
          body: '{"message":"secret"}',
        })
      )

      await relationshipForm(page, 'Change manager').getByRole('button').click()
      await expect(page.getByRole('status')).toHaveText(failure.message)
      await expect(page.getByRole('status')).not.toContainText('secret')
    }
  })

  test('should manage roles, scoped permissions, and assignments through accessible controls', async ({
    page,
  }) => {
    const roles = [
      {
        id: 'role-custom',
        roleKey: 'security-owner',
        displayName: 'Security Owner',
        isSeeded: false,
        isActive: true,
      },
      {
        id: 'role-seeded',
        roleKey: 'hr-admin',
        displayName: 'HR Admin',
        isSeeded: true,
        isActive: true,
      },
    ]
    const requests: Array<{ method: string; url: string; body: unknown }> = []
    let rolePermissionReads = 0

    await page.on('dialog', dialog => dialog.accept())
    await page.route('**/api/v1/permissions/catalogue', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          permissions: [
            { permissionKey: 'view-dashboard', requiresScope: true },
            { permissionKey: 'create-action-items', requiresScope: false },
          ],
        }),
      })
    )
    await page.route('**/api/v1/functional-roles/*/permissions', async route => {
      rolePermissionReads += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          grants:
            rolePermissionReads > 2
              ? []
              : [
                  {
                    id: 'grant-1',
                    roleKey: 'security-owner',
                    permissionKey: 'view-dashboard',
                    scope: '{"dashboardType":"unit-manager"}',
                  },
                ],
        }),
      })
    })
    await page.route('**/api/v1/functional-roles**', async route => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname.replace('/api/v1', '')
      requests.push({
        method: request.method(),
        url: path,
        body: request.postData() ? request.postDataJSON() : undefined,
      })

      if (request.method() === 'GET' && path.endsWith('/permissions')) {
        rolePermissionReads += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            grants:
              rolePermissionReads > 2
                ? []
                : [
                    {
                      id: 'grant-1',
                      roleKey: 'security-owner',
                      permissionKey: 'view-dashboard',
                      scope: '{"dashboardType":"unit-manager"}',
                    },
                  ],
          }),
        })
        return
      }
      if (request.method() === 'GET' && path === '/functional-roles') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ roles }),
        })
        return
      }
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(roles[0]),
        })
        return
      }
      if (request.method() === 'POST' && path === '/functional-roles') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ ...roles[0], roleKey: 'new-owner', displayName: 'New Owner' }),
        })
        return
      }
      if (request.method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...roles[0], displayName: 'Updated Owner' }),
        })
        return
      }
      if (request.method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'grant-1',
            roleKey: 'security-owner',
            permissionKey: 'view-dashboard',
            scope: '{"dashboardType":"unit-manager"}',
          }),
        })
        return
      }
      await route.fulfill({ status: 204 })
    })
    await page.route('**/api/v1/people/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname.replace('/api/v1', '')
      requests.push({
        method: request.method(),
        url: path,
        body: request.postData() ? request.postDataJSON() : undefined,
      })
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            assignments: [
              {
                id: 'assignment-1',
                personId: '22222222-2222-4222-8222-222222222222',
                roleKey: 'security-owner',
                isActive: true,
              },
            ],
          }),
        })
        return
      }
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'assignment-1',
            personId: '22222222-2222-4222-8222-222222222222',
            roleKey: 'security-owner',
            isActive: true,
          }),
        })
        return
      }
      await route.fulfill({ status: 204 })
    })

    await page.goto('/administration/functional-roles')
    await expect(page.getByTestId('administration-page')).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Functional role administration' })
    ).toBeVisible()

    await page.getByLabel('Role key').first().fill('new-owner')
    await page.getByLabel('Display name').first().fill('New Owner')
    await page.getByRole('button', { name: 'Create role' }).click()

    await page.getByLabel('Display name').last().fill('Updated Owner')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('view-dashboard (unit-manager)')).toBeVisible()
    await page.getByRole('combobox', { name: 'Permission' }).selectOption('view-dashboard')
    await page.getByRole('combobox', { name: 'Dashboard type' }).selectOption('unit-manager')
    await page.getByRole('button', { name: 'Grant permission' }).click()
    await expect(page.getByText('view-dashboard (unit-manager)')).toBeVisible()
    await page.getByRole('button', { name: 'Revoke' }).first().click()
    await expect(page.getByText('view-dashboard (unit-manager)')).toHaveCount(0)

    await page.getByLabel('Person ID').fill('22222222-2222-4222-8222-222222222222')
    await page.getByRole('combobox', { name: 'Role to assign' }).selectOption('security-owner')
    await page.getByRole('button', { name: 'Assign role' }).click()
    await page.getByRole('button', { name: 'Load active assignments' }).click()
    await expect(
      page
        .getByRole('list', { name: 'Active functional-role assignments' })
        .getByText('security-owner')
    ).toBeVisible()
    await page.getByRole('button', { name: 'Revoke' }).last().click()

    expect(
      requests.some(
        request => request.url.includes('/permissions/view-dashboard') && request.method === 'PUT'
      )
    ).toBeTruthy()
    expect(
      requests.some(
        request => request.url.includes('/functional-roles') && request.method === 'PATCH'
      )
    ).toBeTruthy()
    expect(
      requests.some(
        request => request.url.includes('/functional-roles') && request.method === 'POST'
      )
    ).toBeTruthy()
  })

  test('should prevent stale assignment actions after changing the person', async ({ page }) => {
    const personA = '22222222-2222-4222-8222-222222222222'
    const personB = '33333333-3333-4333-8333-333333333333'
    const roles = [
      {
        id: 'role-a',
        roleKey: 'security-owner',
        displayName: 'Security Owner',
        isSeeded: false,
        isActive: true,
      },
    ]
    const deletes: string[] = []
    let personAReads = 0
    let releaseLatePersonA: () => void = () => undefined
    let personAReadStarted: () => void = () => undefined
    const latePersonAReadStarted = new Promise<void>(resolve => {
      personAReadStarted = resolve
    })
    const latePersonAResponse = new Promise<void>(resolve => {
      releaseLatePersonA = resolve
    })

    await page.on('dialog', dialog => dialog.accept())
    await page.route('**/api/v1/permissions/catalogue', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          permissions: [{ permissionKey: 'create-action-items', requiresScope: false }],
        }),
      })
    )
    await page.route('**/api/v1/functional-roles**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname.replace('/api/v1', '')
      if (request.method() === 'GET' && path === '/functional-roles') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ roles }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(path.endsWith('/permissions') ? { grants: [] } : roles[0]),
      })
    })
    await page.route('**/api/v1/people/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname.replace('/api/v1', '')
      if (request.method() === 'DELETE') {
        deletes.push(path)
        await route.fulfill({ status: 204 })
        return
      }
      if (request.method() !== 'GET') {
        await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
        return
      }
      if (path.includes(`/people/${personA}/`)) {
        personAReads += 1
        if (personAReads > 1) {
          personAReadStarted()
          await latePersonAResponse
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            assignments: [
              {
                id: 'assignment-a',
                personId: personA,
                roleKey: 'security-owner',
                isActive: true,
              },
            ],
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ assignments: [] }),
      })
    })

    await page.goto('/administration/functional-roles')
    await page.getByLabel('Person ID').fill(personA)
    await page.getByRole('button', { name: 'Load active assignments' }).click()
    await expect(
      page.getByRole('list', { name: 'Active functional-role assignments' })
    ).toBeVisible()

    await page.getByRole('button', { name: 'Load active assignments' }).click()
    await latePersonAReadStarted
    await page.getByLabel('Person ID').fill(personB)
    await expect(
      page.getByRole('list', { name: 'Active functional-role assignments' })
    ).toHaveCount(0)

    releaseLatePersonA()
    await expect(
      page.getByRole('list', { name: 'Active functional-role assignments' })
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Load active assignments' }).click()
    await expect(
      page.getByRole('list', { name: 'Active functional-role assignments' })
    ).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(deletes).toEqual([])
  })

  test('should reconstruct normalized grants from the authoritative response after reload', async ({
    page,
  }) => {
    const role = {
      id: 'role-reload',
      roleKey: 'reload-owner',
      displayName: 'Reload Owner',
      isSeeded: false,
      isActive: true,
    }
    const catalogue = {
      permissions: [{ permissionKey: 'view-dashboard', requiresScope: true }],
    }
    let grants: Array<{
      id: string
      roleKey: string
      permissionKey: string
      scope: string
    }> = []
    let permissionReads = 0

    await page.on('dialog', dialog => dialog.accept())
    await page.route('**/api/v1/permissions/catalogue', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(catalogue),
      })
    )
    await page.route('**/api/v1/functional-roles**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname.replace('/api/v1', '')

      if (request.method() === 'GET' && path === '/functional-roles') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ roles: [role] }),
        })
        return
      }

      if (request.method() === 'GET' && path.endsWith('/permissions')) {
        permissionReads += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ grants }),
        })
        return
      }

      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(role),
        })
        return
      }

      if (request.method() === 'PUT') {
        grants = [
          {
            id: 'grant-reload',
            roleKey: role.roleKey,
            permissionKey: 'view-dashboard',
            scope: '{"dashboardType":"unit-manager"}',
          },
        ]
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(grants[0]),
        })
        return
      }

      await route.fulfill({ status: 204 })
    })

    await page.goto('/administration/functional-roles')
    await page.getByRole('combobox', { name: 'Permission' }).selectOption('view-dashboard')
    await page.getByRole('combobox', { name: 'Dashboard type' }).selectOption('unit-manager')
    await page.getByRole('button', { name: 'Grant permission' }).click()
    await expect(page.getByText('view-dashboard (unit-manager)')).toBeVisible()

    await page.reload()

    await expect(page.getByText('view-dashboard (unit-manager)')).toBeVisible()
    expect(permissionReads).toBeGreaterThan(1)
  })

  test('should ignore a late grant response for a previously selected role', async ({ page }) => {
    const roles = [
      {
        id: 'role-a',
        roleKey: 'role-a',
        displayName: 'Role A',
        isSeeded: false,
        isActive: true,
      },
      {
        id: 'role-b',
        roleKey: 'role-b',
        displayName: 'Role B',
        isSeeded: false,
        isActive: true,
      },
    ]
    let releaseRoleA: () => void = () => undefined
    const roleAReady = new Promise<void>(resolve => {
      releaseRoleA = resolve
    })

    await page.route('**/api/v1/permissions/catalogue', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          permissions: [
            { permissionKey: 'view-dashboard', requiresScope: true },
            { permissionKey: 'create-action-items', requiresScope: false },
          ],
        }),
      })
    )
    await page.route('**/api/v1/functional-roles**', async route => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
      if (route.request().method() === 'GET' && path === '/functional-roles') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ roles }),
        })
        return
      }

      const roleKey = path.split('/')[2]
      const role = roles.find(candidate => candidate.roleKey === roleKey)
      if (!role) {
        await route.fulfill({ status: 404 })
        return
      }
      if (roleKey === 'role-a') {
        await roleAReady
      }
      if (path.endsWith('/permissions')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            grants: [
              {
                id: `grant-${roleKey}`,
                roleKey,
                permissionKey: roleKey === 'role-a' ? 'view-dashboard' : 'create-action-items',
                scope: roleKey === 'role-a' ? '{"dashboardType":"unit-manager"}' : null,
              },
            ],
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(role),
      })
    })

    await page.goto('/administration/functional-roles')
    await expect(page.getByRole('button', { name: /Role B/ })).toBeVisible()
    await page.getByRole('button', { name: /Role B/ }).click()
    await expect(page.getByRole('heading', { name: 'Role B', exact: true })).toBeVisible()
    await expect(
      page
        .getByRole('list', { name: 'Permissions changed in this session' })
        .getByText('create-action-items')
    ).toBeVisible()

    releaseRoleA()

    await expect(page.getByRole('heading', { name: 'Role B', exact: true })).toBeVisible()
    await expect(page.getByText('view-dashboard (unit-manager)')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
  })

  test('should clean up pending role requests when the page unmounts', async ({ page }) => {
    const role = {
      id: 'role-unmount',
      roleKey: 'unmount-owner',
      displayName: 'Unmount Owner',
      isSeeded: false,
      isActive: true,
    }
    let releasePermissions: () => void = () => undefined
    const permissionsReady = new Promise<void>(resolve => {
      releasePermissions = resolve
    })

    await page.route('**/api/v1/permissions/catalogue', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ permissions: [] }),
      })
    )
    await page.route('**/api/v1/functional-roles**', async route => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
      if (route.request().method() === 'GET' && path === '/functional-roles') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ roles: [role] }),
        })
        return
      }
      if (path.endsWith('/permissions')) {
        await permissionsReady
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ grants: [] }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(role),
      })
    })

    await page.goto('/administration/functional-roles')
    await expect(page.getByRole('heading', { name: 'Unmount Owner', exact: true })).toBeVisible()
    await page.goto('/')
    releasePermissions()
    await expect(page.getByTestId('home-title')).toBeVisible()
  })

  test('should show a safe state for invalid grant scope JSON', async ({ page }) => {
    const role = {
      id: 'role-invalid-scope',
      roleKey: 'invalid-scope-owner',
      displayName: 'Invalid Scope Owner',
      isSeeded: false,
      isActive: true,
    }

    await page.route('**/api/v1/permissions/catalogue', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          permissions: [{ permissionKey: 'view-dashboard', requiresScope: true }],
        }),
      })
    )
    await page.route('**/api/v1/functional-roles**', async route => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
      if (route.request().method() === 'GET' && path === '/functional-roles') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ roles: [role] }),
        })
        return
      }
      if (path.endsWith('/permissions')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            grants: [
              {
                id: 'invalid-grant',
                roleKey: role.roleKey,
                permissionKey: 'view-dashboard',
                scope: 'not-json',
              },
            ],
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(role),
      })
    })

    await page.goto('/administration/functional-roles')
    await expect(page.getByRole('alert')).toHaveText('The change could not be completed.')
    await expect(page.getByRole('alert')).not.toContainText('not-json')
  })

  test('should protect seeded roles', async ({ page }) => {
    const patchRequests: Array<{ url: string; body: unknown }> = []
    const deactivationRequests: string[] = []
    await page.route('**/api/v1/permissions/catalogue', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ permissions: [] }),
      })
    )
    await page.route('**/api/v1/functional-roles/*/permissions', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ grants: [] }),
      })
    )
    await page.route('**/api/v1/functional-roles**', async route => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
      const role = {
        id: 'seeded',
        roleKey: 'hr-admin',
        displayName: 'HR Admin',
        isSeeded: true,
        isActive: true,
      }
      if (path.endsWith('/permissions')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ grants: [] }),
        })
        return
      }
      if (route.request().method() === 'PATCH') {
        patchRequests.push({
          url: path,
          body: route.request().postDataJSON(),
        })
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...role,
            displayName: 'Updated HR Admin',
          }),
        })
        return
      }
      if (path.endsWith('/deactivate')) {
        deactivationRequests.push(path)
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(path === '/functional-roles' ? { roles: [role] } : role),
      })
    })

    await page.goto('/administration/functional-roles')
    await expect(page.getByRole('button', { name: /HR Admin/ })).toBeVisible()
    const displayName = page.getByLabel('Display name').last()
    await expect(displayName).toBeEnabled()
    await displayName.fill('Updated HR Admin')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => patchRequests.length).toBe(1)
    expect(patchRequests).toEqual([
      {
        url: '/functional-roles/hr-admin',
        body: { displayName: 'Updated HR Admin' },
      },
    ])
    await expect(page.getByRole('button', { name: /HR Admin hr-admin/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Deactivate role' })).toBeDisabled()
    expect(deactivationRequests).toEqual([])
  })

  test('should render safe localized API errors', async ({ page }) => {
    await page.route('**/api/v1/permissions/catalogue', route =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"message":"upstream secret"}',
      })
    )
    await page.route('**/api/v1/functional-roles**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          roles: [
            {
              id: 'seeded',
              roleKey: 'hr-admin',
              displayName: 'HR Admin',
              isSeeded: true,
              isActive: true,
            },
          ],
        }),
      })
    )

    await page.goto('/administration/functional-roles')
    await expect(page.getByRole('alert')).toHaveText(
      'The administration service is temporarily unavailable. Try again later.'
    )
    await expect(page.getByRole('alert')).not.toContainText('upstream secret')
  })
})
