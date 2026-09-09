import { execFileSync } from 'node:child_process'
import { createPrivateKey, randomUUID, sign } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test, expect, type Page } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

const KEYCLOAK_BASE_URL = process.env.LIVE_KEYCLOAK_BASE_URL ?? 'http://localhost:8080'
const FRONTEND_URL = process.env.LIVE_FRONTEND_URL ?? 'http://localhost:4200'
const REALM = 'people-management'
const ADMIN_USER_ID = process.env.LIVE_ADMIN_USER_ID
const BOOTSTRAP_TARGET_USER_ID = process.env.LIVE_BOOTSTRAP_TARGET_USER_ID
const ADMIN_TOKEN = process.env.LIVE_KEYCLOAK_ADMIN_TOKEN
const ADMIN_USERNAME = process.env.LIVE_ADMIN_USERNAME
const ADMIN_PASSWORD = process.env.LIVE_ADMIN_PASSWORD
const NON_ADMIN_USERNAME = process.env.LIVE_NON_ADMIN_USERNAME
const NON_ADMIN_PASSWORD = process.env.LIVE_NON_ADMIN_PASSWORD
const DEPLOYMENT_PRIVATE_KEY_PATH = process.env.LIVE_DEPLOYMENT_PRIVATE_KEY_PATH
const DEPLOYMENT_KEY_ID = process.env.LIVE_DEPLOYMENT_KEY_ID
const DEPLOYMENT_CLIENT_ID = process.env.LIVE_DEPLOYMENT_CLIENT_ID ?? 'deployment-bootstrap'
const ACCESS_CONTROL_URL = process.env.LIVE_ACCESS_CONTROL_URL ?? 'http://localhost:3007'
const POSTGRES_CONTAINER = process.env.LIVE_POSTGRES_CONTAINER ?? 'infra-postgres-1'

const required = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`Missing live E2E environment variable: ${name}`)
  }
  return value
}

const configureRegularBffAccessTokens = async (
  request: APIRequestContext,
  adminToken: string
): Promise<void> => {
  const clientsResponse = await request.get(
    `${KEYCLOAK_BASE_URL}/admin/realms/${REALM}/clients?clientId=bff-confidential`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  )
  const clientsResponseBody = await clientsResponse.text()
  expect(clientsResponse.ok(), clientsResponseBody).toBeTruthy()
  const clients = JSON.parse(clientsResponseBody) as Array<Record<string, unknown>>
  expect(clients).toHaveLength(1)

  const client = clients[0]
  const attributes =
    client.attributes && typeof client.attributes === 'object'
      ? { ...(client.attributes as Record<string, string>) }
      : {}
  attributes['client.use.lightweight.access.token.enabled'] = 'false'
  const protocolMappers = Array.isArray(client.protocolMappers) ? [...client.protocolMappers] : []
  const subjectMapper = protocolMappers.find(
    mapper =>
      typeof mapper === 'object' &&
      mapper !== null &&
      (mapper as Record<string, unknown>).name === 'bff-confidential-subject'
  )
  if (subjectMapper) {
    subjectMapper.config = {
      ...(subjectMapper.config as Record<string, string> | undefined),
      'access.token.claim': 'true',
      'lightweight.claim': 'true',
    }
  } else {
    protocolMappers.push({
      name: 'bff-confidential-subject',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-sub-mapper',
      consentRequired: false,
      config: {
        'access.token.claim': 'true',
        'id.token.claim': 'true',
        'userinfo.token.claim': 'true',
        'lightweight.claim': 'true',
      },
    })
  }

  const updateResponse = await request.put(
    `${KEYCLOAK_BASE_URL}/admin/realms/${REALM}/clients/${String(client.id)}`,
    {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { ...client, attributes, protocolMappers },
    }
  )
  expect(updateResponse.ok()).toBeTruthy()
}

const queryCount = (database: string, table: string): number =>
  Number(
    execFileSync(
      'docker',
      [
        'exec',
        POSTGRES_CONTAINER,
        'psql',
        '-U',
        'postgres',
        '-d',
        database,
        '-t',
        '-A',
        '-c',
        `SELECT COUNT(*) FROM ${table};`,
      ],
      { encoding: 'utf8' }
    ).trim()
  )

const sqlLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`

const queryScalar = (database: string, query: string): string =>
  execFileSync(
    'docker',
    ['exec', POSTGRES_CONTAINER, 'psql', '-U', 'postgres', '-d', database, '-t', '-A', '-c', query],
    { encoding: 'utf8' }
  ).trim()

const ensureAccessControlPersonProjection = (personId: string): void => {
  execFileSync(
    'docker',
    [
      'exec',
      POSTGRES_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-d',
      'access_control_service',
      '-c',
      `INSERT INTO people ("Id", "Label") VALUES (${sqlLiteral(personId)}, 'Live E2E bootstrap target') ON CONFLICT ("Id") DO NOTHING;`,
    ],
    { encoding: 'utf8' }
  )
}

const encodeBase64Url = (value: string | object | Buffer): string =>
  Buffer.from(
    typeof value === 'string' || value instanceof Buffer ? value : JSON.stringify(value)
  ).toString('base64url')

const createClientAssertion = async (
  privateKeyPath: string,
  keyId: string,
  clientId: string,
  tokenEndpoint: string
): Promise<string> => {
  const now = Math.floor(Date.now() / 1000)
  const header = encodeBase64Url({ alg: 'RS256', typ: 'JWT', kid: keyId })
  const payload = encodeBase64Url({
    iss: clientId,
    sub: clientId,
    aud: tokenEndpoint,
    iat: now,
    exp: now + 30,
    jti: randomUUID(),
  })
  const privateKey = createPrivateKey(await readFile(privateKeyPath))
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey)
  return `${header}.${payload}.${encodeBase64Url(signature)}`
}

const getDeploymentMachineToken = async (
  request: APIRequestContext,
  privateKeyPath: string,
  keyId: string
): Promise<string> => {
  const tokenEndpoint = `${KEYCLOAK_BASE_URL}/realms/${REALM}/protocol/openid-connect/token`
  const assertion = await createClientAssertion(
    privateKeyPath,
    keyId,
    DEPLOYMENT_CLIENT_ID,
    tokenEndpoint
  )
  const response = await request.post(tokenEndpoint, {
    form: {
      grant_type: 'client_credentials',
      client_id: DEPLOYMENT_CLIENT_ID,
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      scope: 'openid',
    },
  })
  const responseBody = await response.text()
  expect(response.ok(), responseBody).toBeTruthy()
  const body = JSON.parse(responseBody) as { access_token?: unknown }
  expect(typeof body.access_token).toBe('string')
  return body.access_token as string
}

const provisionAdministrator = async (
  request: APIRequestContext,
  machineToken: string,
  targetIssuer: string,
  targetSubject: string
) =>
  request.post(`${ACCESS_CONTROL_URL}/api/v1/internal/bootstrap/administrator`, {
    headers: { Authorization: `Bearer ${machineToken}` },
    data: { issuer: targetIssuer, subject: targetSubject },
  })

const signIn = async (page: Page, username: string, password: string): Promise<void> => {
  await page.goto(`${FRONTEND_URL}/login`)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.locator('input[name="username"]').fill(username)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.waitForURL(`${FRONTEND_URL}/`)
  await expect(page.getByTestId('home-title')).toBeVisible()
}

test.describe('live Administration flow', () => {
  test('persists saves, rejects an unauthorized user, and honors backchannel logout', async ({
    browser,
    page,
    request,
  }) => {
    const adminUserId = required('LIVE_ADMIN_USER_ID', ADMIN_USER_ID)
    const bootstrapTargetUserId = required(
      'LIVE_BOOTSTRAP_TARGET_USER_ID',
      BOOTSTRAP_TARGET_USER_ID
    )
    const adminToken = required('LIVE_KEYCLOAK_ADMIN_TOKEN', ADMIN_TOKEN)
    const adminUsername = required('LIVE_ADMIN_USERNAME', ADMIN_USERNAME)
    const adminPassword = required('LIVE_ADMIN_PASSWORD', ADMIN_PASSWORD)
    const nonAdminUsername = required('LIVE_NON_ADMIN_USERNAME', NON_ADMIN_USERNAME)
    const nonAdminPassword = required('LIVE_NON_ADMIN_PASSWORD', NON_ADMIN_PASSWORD)
    await configureRegularBffAccessTokens(request, adminToken)
    const deploymentPrivateKeyPath = required(
      'LIVE_DEPLOYMENT_PRIVATE_KEY_PATH',
      DEPLOYMENT_PRIVATE_KEY_PATH
    )
    const deploymentKeyId = required('LIVE_DEPLOYMENT_KEY_ID', DEPLOYMENT_KEY_ID)
    const targetIssuer = `${KEYCLOAK_BASE_URL}/realms/${REALM}`
    const roleKey = `live-e2e-${Date.now()}`
    const roleName = 'Live E2E Administrator'
    const fieldName = `Live E2E Field ${Date.now()}`
    const nonAdminLookup = await request.get(
      `${KEYCLOAK_BASE_URL}/admin/realms/${REALM}/users?username=${encodeURIComponent(nonAdminUsername)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    )
    expect(nonAdminLookup.ok()).toBeTruthy()
    const nonAdminUsers = (await nonAdminLookup.json()) as Array<{ id?: unknown }>
    expect(nonAdminUsers).toHaveLength(1)
    expect(typeof nonAdminUsers[0].id).toBe('string')
    const nonAdminSubject = nonAdminUsers[0].id as string
    const adminPersonId = queryScalar(
      'people_service',
      `SELECT "personId" FROM "person_external_identity_links" WHERE "canonicalIssuer" = ${sqlLiteral(targetIssuer)} AND "opaqueSubject" = ${sqlLiteral(adminUserId)} AND "status" = 'ACTIVE' LIMIT 1;`
    )
    expect(adminPersonId).not.toBe('')
    ensureAccessControlPersonProjection(adminPersonId)
    const bootstrapTargetPersonId = queryScalar(
      'people_service',
      `SELECT "personId" FROM "person_external_identity_links" WHERE "canonicalIssuer" = ${sqlLiteral(targetIssuer)} AND "opaqueSubject" = ${sqlLiteral(bootstrapTargetUserId)} AND "status" = 'ACTIVE' LIMIT 1;`
    )
    expect(bootstrapTargetPersonId).not.toBe('')
    ensureAccessControlPersonProjection(bootstrapTargetPersonId)

    const auditCountBeforeBootstrap = queryCount(
      'access_control_service',
      'authorization_administration_audits'
    )
    const machineToken = await getDeploymentMachineToken(
      request,
      deploymentPrivateKeyPath,
      deploymentKeyId
    )
    const machineClaims = JSON.parse(
      Buffer.from(machineToken.split('.')[1], 'base64url').toString('utf8')
    ) as { sub?: unknown }
    expect(typeof machineClaims.sub).toBe('string')
    const deploymentOperatorPrefix = `deployment:${targetIssuer}|`
    const bootstrapResponse = await provisionAdministrator(
      request,
      machineToken,
      targetIssuer,
      bootstrapTargetUserId
    )
    expect(bootstrapResponse.ok(), await bootstrapResponse.text()).toBeTruthy()
    const bootstrapBody = (await bootstrapResponse.json()) as {
      status?: string
    }
    expect(bootstrapBody.status).toMatch(/^(provisioned|already-provisioned)$/)

    const idempotentResponse = await provisionAdministrator(
      request,
      machineToken,
      targetIssuer,
      bootstrapTargetUserId
    )
    expect(idempotentResponse.ok()).toBeTruthy()
    await expect(idempotentResponse.json()).resolves.toEqual({
      status: 'already-provisioned',
    })
    const expectedAuditCount =
      bootstrapBody.status === 'provisioned'
        ? auditCountBeforeBootstrap + 1
        : auditCountBeforeBootstrap
    expect(queryCount('access_control_service', 'authorization_administration_audits')).toBe(
      expectedAuditCount
    )
    expect(
      queryCount(
        'access_control_service',
        `authorization_administration_audits WHERE "Action" = 'bootstrap' AND "TrustedProvisioningActor" LIKE ${sqlLiteral(`${deploymentOperatorPrefix}%|deployment-bootstrap`)} AND "After"::text LIKE ${sqlLiteral(`%${bootstrapTargetPersonId}%`)}`
      )
    ).toBe(1)

    const nonAdminPersonId = queryScalar(
      'people_service',
      `SELECT "personId" FROM "person_external_identity_links" WHERE "canonicalIssuer" = ${sqlLiteral(targetIssuer)} AND "opaqueSubject" = ${sqlLiteral(nonAdminSubject)} AND "status" = 'ACTIVE' LIMIT 1;`
    )
    expect(nonAdminPersonId).not.toBe('')
    expect(
      queryCount(
        'access_control_service',
        `person_functional_role_assignments WHERE "PersonId" = ${sqlLiteral(nonAdminPersonId)} AND "IsActive" = TRUE`
      )
    ).toBe(0)

    await signIn(page, adminUsername, adminPassword)
    await page.goto('/administration/functional-roles')

    await page.getByLabel('Role key').first().fill(roleKey)
    await page.getByLabel('Display name').first().fill(roleName)
    await page.getByRole('button', { name: 'Create role' }).click()
    await expect(page.getByRole('button', { name: new RegExp(roleName) })).toBeVisible()

    await page.getByLabel('Field name').first().fill(fieldName)
    await page.getByLabel('Data type').selectOption('TEXT')
    await page.getByLabel('Visibility').selectOption('MANAGEMENT')
    await page.getByRole('button', { name: 'Create definition' }).click()
    await expect(page.getByText(fieldName, { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: new RegExp(roleName) })).toBeVisible()
    await expect(page.getByText(fieldName, { exact: true })).toBeVisible()

    const rolesBeforeUnauthorized = queryCount('access_control_service', 'functional_roles')
    const fieldsBeforeUnauthorized = queryCount('people_service', 'custom_field_definitions')
    const accessAuditsBeforeUnauthorized = queryCount(
      'access_control_service',
      'authorization_administration_audits'
    )
    const identityAuditsBeforeUnauthorized = queryCount('people_service', 'identity_link_audits')

    const unauthorizedContext = await browser.newContext({ baseURL: FRONTEND_URL })
    const unauthorizedPage = await unauthorizedContext.newPage()
    await signIn(unauthorizedPage, nonAdminUsername, nonAdminPassword)
    await unauthorizedPage.goto('/administration/functional-roles')

    await unauthorizedPage.getByLabel('Role key').first().fill(`forbidden-${Date.now()}`)
    await unauthorizedPage.getByLabel('Display name').first().fill('Forbidden Role')
    await unauthorizedPage.getByRole('button', { name: 'Create role' }).click()
    await expect(unauthorizedPage.getByRole('alert')).toHaveText(
      'You do not have permission to manage functional roles.'
    )

    await unauthorizedPage.getByLabel('Field name').first().fill(`Forbidden Field ${Date.now()}`)
    await unauthorizedPage.getByLabel('Data type').selectOption('TEXT')
    await unauthorizedPage.getByLabel('Visibility').selectOption('MANAGEMENT')
    await unauthorizedPage.getByRole('button', { name: 'Create definition' }).click()
    await expect(
      unauthorizedPage.getByText('You do not have permission to manage custom field definitions.', {
        exact: true,
      })
    ).toBeVisible()
    await unauthorizedContext.close()

    expect(queryCount('access_control_service', 'functional_roles')).toBe(rolesBeforeUnauthorized)
    expect(queryCount('people_service', 'custom_field_definitions')).toBe(fieldsBeforeUnauthorized)
    expect(queryCount('access_control_service', 'authorization_administration_audits')).toBe(
      accessAuditsBeforeUnauthorized
    )
    expect(queryCount('people_service', 'identity_link_audits')).toBe(
      identityAuditsBeforeUnauthorized
    )

    await request
      .post(`${KEYCLOAK_BASE_URL}/admin/realms/${REALM}/users/${adminUserId}/logout`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      .then(response => expect(response.ok()).toBeTruthy())

    await page.goto(`${FRONTEND_URL}/`)
    await expect(page).toHaveURL(/\/login$/)
  })
})
