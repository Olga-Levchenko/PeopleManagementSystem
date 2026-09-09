import { createServer } from 'node:http'
import { generateKeyPairSync, randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'

const REPO_ROOT = resolve(import.meta.dirname, '../../..')
const FRONTEND_ROOT = resolve(import.meta.dirname, '..')
const REALM_SOURCE = resolve(
  REPO_ROOT,
  'services/authentication-service/keycloak/realm-export.json'
)
const REALM = 'people-management'
const DATABASES = ['bff_session', 'people_service', 'access_control_service']
const KEY_CLIENTS = [
  ['bff-confidential', 'bff'],
  ['people-service', 'people'],
  ['access-control-service', 'access-control'],
  ['deployment-bootstrap', 'deployment'],
]
const FIXTURE_PERSON_IDS = {
  admin: 'cccccccc-0000-0000-0000-000000000001',
  nonAdmin: 'cccccccc-0000-0000-0000-000000000002',
  bootstrapTarget: 'cccccccc-0000-0000-0000-000000000019',
}
const HR_ADMIN_ROLE_ID = '55555555-0000-0000-0000-000000000005'

const processes = []
const containers = []
let tempDir
const networks = []
let runFailed = false

const commandName = command =>
  process.platform === 'win32' && ['npm', 'npx'].includes(command) ? `${command}.cmd` : command
const useShell = command => process.platform === 'win32' && ['npm', 'npx'].includes(command)

const run = (command, args, options = {}) => {
  const result = spawnSync(commandName(command), args, {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    timeout: options.timeout ?? 120_000,
    windowsHide: true,
    shell: useShell(command),
  })
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}): ${`${result.stderr ?? ''}${result.stdout ?? ''}`.slice(-4000)}`
    )
  }
  return typeof result.stdout === 'string' ? result.stdout.trim() : ''
}

const redact = value =>
  value
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[REDACTED KEY]')
    .replace(
      /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      '[REDACTED TOKEN]'
    )

const startProcess = (name, command, args, env, cwd) => {
  const logPath = join(tempDir, `${name}.log`)
  const child = spawn(commandName(command), args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: useShell(command),
  })
  const append = chunk =>
    writeFile(logPath, redact(chunk.toString()), { flag: 'a' }).catch(() => {})
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  processes.push(child)
  return child
}

const availablePort = async () => {
  const server = createServer()
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
  const { port } = server.address()
  await new Promise(resolvePromise => server.close(resolvePromise))
  return port
}

const waitFor = async (label, check, timeout = 120_000) => {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try {
      if (await check()) return
    } catch (error) {
      lastError = error
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500))
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`)
}

const httpJson = async (url, options) => {
  const response = await fetch(url, options)
  const body = await response.text()
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${body.slice(0, 500)}`)
  return body ? JSON.parse(body) : undefined
}

const httpReachable = async url => {
  const response = await fetch(url)
  return response.status < 600
}

const startContainer = (name, args) => {
  run('docker', ['run', '-d', '--name', name, ...args])
  containers.push(name)
}

const mappedPort = name => Number(run('docker', ['port', name, '5432/tcp']).split(':').pop())

const waitForContainer = name =>
  waitFor(`${name} health`, () => {
    const status = run('docker', ['inspect', '-f', '{{.State.Health.Status}}', name])
    return status === 'healthy'
  })

const psql = (container, database, sql) =>
  run('docker', [
    'exec',
    container,
    'psql',
    '-U',
    'postgres',
    '-d',
    database,
    '-v',
    'ON_ERROR_STOP=1',
    '-t',
    '-A',
    '-c',
    sql,
  ])

const sqlLiteral = value => `'${value.replaceAll("'", "''")}'`

const diagnoseManageCustomFields = container => {
  const personId = FIXTURE_PERSON_IDS.admin
  const roleId = HR_ADMIN_ROLE_ID
  const diagnostic = psql(
    container,
    'access_control_service',
    `WITH actor AS (
       SELECT ${sqlLiteral(personId)}::uuid AS person_id
     ),
     active_assignment AS (
       SELECT p."Id", p."AssignedAtUtc", p."RevokedAtUtc", p."IsActive"
       FROM person_functional_role_assignments p, actor a
       WHERE p."PersonId" = a.person_id
         AND p."FunctionalRoleId" = ${sqlLiteral(roleId)}::uuid
     ),
     matching_grant AS (
       SELECT g."Id", g."Scope", p."IsActive" AS permission_active, r."IsActive" AS role_active
       FROM functional_role_permission_grants g
       INNER JOIN permissions p ON p."Id" = g."PermissionId"
       INNER JOIN functional_roles r ON r."Id" = g."FunctionalRoleId"
       WHERE g."FunctionalRoleId" = ${sqlLiteral(roleId)}::uuid
         AND p."Key" = 'manage-custom-fields'
     )
     SELECT json_build_object(
       'person_exists', EXISTS (SELECT 1 FROM people WHERE "Id" = ${sqlLiteral(personId)}::uuid),
       'active_assignment', EXISTS (
         SELECT 1 FROM active_assignment WHERE "IsActive" AND "RevokedAtUtc" IS NULL
       ),
       'active_hr_admin_role', EXISTS (
         SELECT 1 FROM functional_roles WHERE "Id" = ${sqlLiteral(roleId)}::uuid AND "IsActive"
       ),
       'active_permission', EXISTS (
         SELECT 1 FROM permissions WHERE "Key" = 'manage-custom-fields' AND "IsActive"
       ),
       'null_scope_grant', EXISTS (
         SELECT 1 FROM matching_grant
         WHERE "Scope" IS NULL AND permission_active AND role_active
       ),
       'final_granted', EXISTS (
         SELECT 1
         FROM active_assignment a
         INNER JOIN matching_grant g ON g.role_active AND g.permission_active AND g."Scope" IS NULL
         WHERE a."IsActive" AND a."RevokedAtUtc" IS NULL
       ),
       'assignments', COALESCE((
         SELECT json_agg(json_build_object(
           'id', "Id",
           'assignedAtUtc', "AssignedAtUtc",
           'revokedAtUtc', "RevokedAtUtc",
           'isActive', "IsActive"
         ) ORDER BY "AssignedAtUtc")
         FROM active_assignment
       ), '[]'::json)
     );`
  )
  console.error(`[live-e2e diagnostic] manage-custom-fields: ${diagnostic}`)
}

const createKeys = async () => {
  const keys = {}
  for (const [clientId, fileName] of KEY_CLIENTS) {
    const keyId = `${fileName}-${cryptoRandomSuffix()}`
    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
      publicKeyEncoding: { format: 'jwk' },
    })
    const privatePath = join(tempDir, `${fileName}.key.pem`)
    await writeFile(privatePath, privateKey, { mode: 0o600 })
    keys[clientId] = {
      keyId,
      privatePath,
      jwk: { ...publicKey, kid: keyId, use: 'sig', alg: 'RS256' },
    }
  }
  return keys
}

const cryptoRandomSuffix = () => Math.random().toString(36).slice(2, 10)

const startJwksServer = async (keys, name, network) => {
  for (const [clientId, fileName] of KEY_CLIENTS) {
    await writeFile(
      join(tempDir, `${fileName}.jwk.json`),
      JSON.stringify({ keys: [keys[clientId].jwk] })
    )
  }
  const script = [
    "const http=require('http'),fs=require('fs');",
    "const routes={'/bff/jwks.json':'/keys/bff.jwk.json','/people/jwks.json':'/keys/people.jwk.json','/access-control/jwks.json':'/keys/access-control.jwk.json','/deployment/jwks.json':'/keys/deployment.jwk.json'};",
    "http.createServer((q,r)=>{const f=routes[q.url];if(!f){r.writeHead(404);return r.end()}r.writeHead(200,{'content-type':'application/json'});r.end(fs.readFileSync(f))}).listen(8080,'0.0.0.0')",
  ].join('')
  startContainer(name, [
    '--network',
    network,
    '--network-alias',
    'jwks',
    '-v',
    `${tempDir}:/keys:ro`,
    'node:22-alpine',
    'node',
    '-e',
    script,
  ])
  await waitFor('JWKS container', () => {
    const status = run('docker', ['inspect', '-f', '{{.State.Running}}', name])
    return status === 'true'
  })
}

const buildRealm = async (keys, ports) => {
  const realm = JSON.parse(await readFile(REALM_SOURCE, 'utf8'))
  const urls = {
    'bff-confidential': 'http://jwks:8080/bff/jwks.json',
    'people-service': 'http://jwks:8080/people/jwks.json',
    'access-control-service': 'http://jwks:8080/access-control/jwks.json',
    'deployment-bootstrap': 'http://jwks:8080/deployment/jwks.json',
  }
  for (const client of realm.clients ?? []) {
    const key = keys[client.clientId]
    if (key) {
      client.attributes = {
        ...client.attributes,
        'jwks.url': urls[client.clientId],
        'use.jwks.url': 'true',
      }
    }
    if (client.clientId === 'bff-confidential') {
      client.redirectUris = [
        `http://127.0.0.1:${ports.frontend}/*`,
        `http://127.0.0.1:${ports.bff}/*`,
      ]
      client.webOrigins = [`http://127.0.0.1:${ports.frontend}`]
      client.attributes = {
        ...client.attributes,
        'post.logout.redirect.uris': `http://127.0.0.1:${ports.frontend}/*`,
        'backchannel.logout.url': `http://host.docker.internal:${ports.bff}/api/v1/auth/backchannel-logout`,
        'client.use.lightweight.access.token.enabled': 'false',
      }
    }
  }
  const realmPath = join(tempDir, 'realm-export.json')
  await writeFile(realmPath, JSON.stringify(realm, null, 2))
  return { realmPath, users: realm.users ?? [] }
}

const getAdminToken = async keycloakPort => {
  const body = await httpJson(
    `http://127.0.0.1:${keycloakPort}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: 'admin',
        password: 'admin',
      }),
    }
  )
  return body.access_token
}

const ensureTestUser = async (keycloakPort, adminToken, username, password, profile) => {
  const baseUrl = `http://127.0.0.1:${keycloakPort}/admin/realms/${REALM}/users`
  const headers = { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }
  const existing = await httpJson(`${baseUrl}?username=${encodeURIComponent(username)}`, {
    headers,
  })
  const user = {
    username,
    enabled: true,
    email: profile.email,
    emailVerified: true,
    firstName: profile.firstName,
    lastName: profile.lastName,
  }
  if (existing[0]?.id) {
    const response = await fetch(`${baseUrl}/${existing[0].id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(user),
    })
    if (!response.ok) {
      throw new Error(`Could not update disposable user ${username}: ${response.status}`)
    }
    return { username, password, id: existing[0].id }
  }
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...user,
      credentials: [{ type: 'password', value: password, temporary: false }],
    }),
  })
  if (!response.ok)
    throw new Error(`Could not create disposable user ${username}: ${response.status}`)
  const created = await httpJson(`${baseUrl}?username=${encodeURIComponent(username)}`, { headers })
  if (!created[0]?.id) throw new Error(`Could not resolve disposable user ${username}`)
  return { username, password, id: created[0].id }
}

const stopAll = async () => {
  for (const child of processes.reverse()) {
    if (!child.killed) {
      if (process.platform === 'win32' && child.pid) {
        try {
          run('taskkill', ['/PID', String(child.pid), '/T', '/F'], { timeout: 30_000 })
        } catch {}
      } else {
        child.kill('SIGTERM')
      }
    }
  }
  for (const name of containers.reverse()) {
    try {
      run('docker', ['rm', '-f', name], { timeout: 30_000 })
    } catch {}
  }
  for (const network of networks.reverse()) {
    try {
      run('docker', ['network', 'rm', network], { timeout: 30_000 })
    } catch {}
  }
  if (tempDir && runFailed) {
    const failureDir = resolve(FRONTEND_ROOT, 'test-results', `live-e2e-failure-${Date.now()}`)
    await mkdir(failureDir, { recursive: true })
    for (const name of ['bff', 'people-service', 'access-control-service', 'frontend']) {
      try {
        await copyFile(join(tempDir, `${name}.log`), join(failureDir, `${name}.log`))
      } catch {}
    }
    console.error(`Non-secret failure logs saved to ${failureDir}`)
  }
  if (tempDir) await rm(tempDir, { recursive: true, force: true })
}

const main = async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'pms-live-e2e-'))
  const suffix = cryptoRandomSuffix()
  const names = {
    postgres: `pms-live-postgres-${suffix}`,
    rabbit: `pms-live-rabbit-${suffix}`,
    keycloak: `pms-live-keycloak-${suffix}`,
    jwks: `pms-live-jwks-${suffix}`,
  }
  const network = `pms-live-network-${suffix}`
  run('docker', ['network', 'create', network])
  networks.push(network)
  const ports = {
    frontend: await availablePort(),
    bff: await availablePort(),
    people: await availablePort(),
    accessControl: await availablePort(),
    keycloak: await availablePort(),
  }
  const keys = await createKeys()
  await startJwksServer(keys, names.jwks, network)

  startContainer(names.postgres, [
    '-e',
    'POSTGRES_USER=postgres',
    '-e',
    'POSTGRES_PASSWORD=postgres',
    '-e',
    'POSTGRES_DB=postgres',
    '--health-cmd',
    'pg_isready -U postgres',
    '--health-interval',
    '2s',
    '--health-timeout',
    '2s',
    '--health-retries',
    '30',
    '-p',
    '127.0.0.1::5432',
    'postgres:18-alpine',
  ])
  await waitForContainer(names.postgres)
  const postgresPort = mappedPort(names.postgres)
  for (const database of DATABASES.slice(1)) {
    psql(names.postgres, 'postgres', `CREATE DATABASE ${database};`)
  }
  psql(names.postgres, 'postgres', 'CREATE DATABASE bff_session;')
  const databaseUrl = database =>
    `postgresql://postgres:postgres@127.0.0.1:${postgresPort}/${database}`
  startContainer(names.rabbit, [
    '-e',
    'RABBITMQ_DEFAULT_USER=guest',
    '-e',
    'RABBITMQ_DEFAULT_PASS=guest',
    '--health-cmd',
    'rabbitmq-diagnostics -q ping',
    '--health-interval',
    '2s',
    '--health-timeout',
    '2s',
    '--health-retries',
    '30',
    '-p',
    '127.0.0.1::5672',
    'rabbitmq:4-management-alpine',
  ])
  await waitForContainer(names.rabbit)
  const rabbitPort = Number(run('docker', ['port', names.rabbit, '5672/tcp']).split(':').pop())

  const realmData = await buildRealm(keys, ports)
  startContainer(names.keycloak, [
    '--network',
    network,
    '-e',
    'KEYCLOAK_ADMIN=admin',
    '-e',
    'KEYCLOAK_ADMIN_PASSWORD=admin',
    '-p',
    `127.0.0.1:${ports.keycloak}:8080`,
    '-v',
    `${realmData.realmPath}:/opt/keycloak/data/import/realm-export.json:ro`,
    'quay.io/keycloak/keycloak:26.2.5',
    'start-dev',
    '--import-realm',
  ])
  await waitFor('Keycloak', async () => {
    const response = await fetch(`http://127.0.0.1:${ports.keycloak}/realms/${REALM}`)
    return response.ok
  })
  const adminToken = await getAdminToken(ports.keycloak)
  await waitFor('Keycloak realm administration API', async () => {
    const response = await fetch(
      `http://127.0.0.1:${ports.keycloak}/admin/realms/${REALM}/clients?clientId=bff-confidential`,
      { headers: { authorization: `Bearer ${adminToken}` } }
    )
    return response.ok
  })
  const adminUser = await ensureTestUser(
    ports.keycloak,
    adminToken,
    'story1-11.test-user',
    'Story1-11-TestPassword!',
    {
      email: 'story1-11.admin@example.test',
      firstName: 'E2E',
      lastName: 'Administrator',
    }
  )
  const nonAdminUser = await ensureTestUser(
    ports.keycloak,
    adminToken,
    'story1-11.test-nonadmin',
    'Story1-11-NonAdminPassword!',
    {
      email: 'story1-11.nonadmin@example.test',
      firstName: 'E2E',
      lastName: 'StandardUser',
    }
  )
  const bootstrapTargetUser = await ensureTestUser(
    ports.keycloak,
    adminToken,
    'story1-11.test-bootstrap-target',
    'Story1-11-BootstrapPassword!',
    {
      email: 'story1-11.bootstrap@example.test',
      firstName: 'E2E',
      lastName: 'BootstrapTarget',
    }
  )

  const common = {
    NODE_ENV: 'test',
    KEYCLOAK_BASE_URL: `http://127.0.0.1:${ports.keycloak}`,
    KEYCLOAK_REALM: REALM,
    RABBITMQ_URL: `amqp://guest:guest@127.0.0.1:${rabbitPort}`,
    RABBITMQ_EXCHANGE: 'people.relationships',
  }
  const bffEnv = {
    ...common,
    PORT: String(ports.bff),
    CORS_ORIGIN: `http://127.0.0.1:${ports.frontend}`,
    PEOPLE_SERVICE_URL: `http://127.0.0.1:${ports.people}`,
    ACCESS_CONTROL_SERVICE_BASE_URL: `http://127.0.0.1:${ports.accessControl}`,
    KEYCLOAK_CLIENT_PRIVATE_KEY_PATH: keys['bff-confidential'].privatePath,
    KEYCLOAK_CLIENT_KEY_ID: keys['bff-confidential'].keyId,
    KEYCLOAK_CLIENT_AUTH_SIGNING_ALG: 'RS256',
    SESSION_SECRET: cryptoRandomSuffix().padEnd(32, 's'),
    OIDC_CALLBACK_URL: `http://127.0.0.1:${ports.bff}/api/v1/auth/callback`,
    DATABASE_URL: databaseUrl('bff_session'),
  }
  const peopleEnv = {
    ...common,
    PORT: String(ports.people),
    CORS_ORIGIN: `http://127.0.0.1:${ports.frontend}`,
    DATABASE_URL: databaseUrl('people_service'),
    OIDC_ALLOWED_ISSUERS: `http://127.0.0.1:${ports.keycloak}/realms/${REALM}`,
    ACCESS_CONTROL_SERVICE_BASE_URL: `http://127.0.0.1:${ports.accessControl}`,
    SERVICE_AUTH_PRIVATE_KEY_PATH: keys['people-service'].privatePath,
    SERVICE_AUTH_KEY_ID: keys['people-service'].keyId,
    SERVICE_AUTH_SIGNING_ALG: 'RS256',
  }
  const accessEnv = {
    ASPNETCORE_ENVIRONMENT: 'Development',
    PORT: String(ports.accessControl),
    CORS_ORIGIN: `http://127.0.0.1:${ports.frontend}`,
    ConnectionStrings__Postgres: `Host=127.0.0.1;Port=${postgresPort};Database=access_control_service;Username=postgres;Password=postgres`,
    RABBITMQ_HOST: '127.0.0.1',
    RABBITMQ_PORT: String(rabbitPort),
    RABBITMQ_USER: 'guest',
    RABBITMQ_PASSWORD: 'guest',
    PEOPLE_SERVICE_BASE_URL: `http://127.0.0.1:${ports.people}`,
    OIDC_ALLOWED_ISSUERS: `http://127.0.0.1:${ports.keycloak}/realms/${REALM}`,
    OIDC_AUDIENCE: 'bff-confidential',
    SERVICE_AUTH_PRIVATE_KEY_PATH: keys['access-control-service'].privatePath,
    SERVICE_AUTH_KEY_ID: keys['access-control-service'].keyId,
  }

  run('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: resolve(REPO_ROOT, 'services/people-service'),
    env: { ...process.env, ...peopleEnv },
  })
  run(
    'dotnet',
    [
      'ef',
      'database',
      'update',
      '--configuration',
      'Release',
      '--project',
      'src/AccessControlService.Infrastructure',
      '--startup-project',
      'src/AccessControlService.Api',
    ],
    {
      cwd: resolve(REPO_ROOT, 'services/access-control-service'),
      env: { ...process.env, ...accessEnv },
    }
  )
  psql(
    names.postgres,
    'bff_session',
    'CREATE TABLE IF NOT EXISTS "session" ("sid" varchar NOT NULL PRIMARY KEY, "sess" json NOT NULL, "expire" timestamp(6) NOT NULL);'
  )
  if (
    !psql(names.postgres, 'bff_session', "SELECT to_regclass('public.session');").includes(
      'session'
    )
  )
    throw new Error('session table was not created')
  const issuer = `http://127.0.0.1:${ports.keycloak}/realms/${REALM}`
  psql(
    names.postgres,
    'people_service',
    `INSERT INTO people (id, "fullName") VALUES
    (${sqlLiteral(FIXTURE_PERSON_IDS.admin)}, 'Live E2E Administrator'),
    (${sqlLiteral(FIXTURE_PERSON_IDS.nonAdmin)}, 'Live E2E Standard User'),
    (${sqlLiteral(FIXTURE_PERSON_IDS.bootstrapTarget)}, 'Live E2E Bootstrap Target');`
  )
  psql(
    names.postgres,
    'people_service',
    `INSERT INTO person_external_identity_links
      (id, "personId", "canonicalIssuer", "opaqueSubject", status, "linkedAtUtc", "createdAtUtc", "updatedAtUtc")
      VALUES
      (${sqlLiteral(randomUUID())}, ${sqlLiteral(FIXTURE_PERSON_IDS.admin)}, ${sqlLiteral(issuer)}, ${sqlLiteral(adminUser.id)}, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      (${sqlLiteral(randomUUID())}, ${sqlLiteral(FIXTURE_PERSON_IDS.nonAdmin)}, ${sqlLiteral(issuer)}, ${sqlLiteral(nonAdminUser.id)}, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      (${sqlLiteral(randomUUID())}, ${sqlLiteral(FIXTURE_PERSON_IDS.bootstrapTarget)}, ${sqlLiteral(issuer)}, ${sqlLiteral(bootstrapTargetUser.id)}, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`
  )
  psql(
    names.postgres,
    'access_control_service',
    `INSERT INTO people ("Id", "Label") VALUES
    (${sqlLiteral(FIXTURE_PERSON_IDS.admin)}, 'Live E2E Administrator'),
    (${sqlLiteral(FIXTURE_PERSON_IDS.nonAdmin)}, 'Live E2E Standard User'),
    (${sqlLiteral(FIXTURE_PERSON_IDS.bootstrapTarget)}, 'Live E2E Bootstrap Target');
    INSERT INTO person_functional_role_assignments
      ("Id", "PersonId", "FunctionalRoleId", "IsActive", "AssignedAtUtc", "RevokedAtUtc")
    VALUES
      (${sqlLiteral(randomUUID())}, ${sqlLiteral(FIXTURE_PERSON_IDS.admin)}, ${sqlLiteral(HR_ADMIN_ROLE_ID)}, TRUE, CURRENT_TIMESTAMP, NULL);`
  )

  startProcess(
    'access-control-service',
    'dotnet',
    [
      'run',
      '--configuration',
      'Release',
      '--project',
      'src/AccessControlService.Api',
      '--no-launch-profile',
      '--no-build',
    ],
    accessEnv,
    resolve(REPO_ROOT, 'services/access-control-service')
  )
  startProcess(
    'people-service',
    'npm',
    ['run', 'start'],
    peopleEnv,
    resolve(REPO_ROOT, 'services/people-service')
  )
  startProcess('bff', 'npm', ['run', 'start'], bffEnv, resolve(REPO_ROOT, 'services/bff'))
  startProcess(
    'frontend',
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(ports.frontend)],
    {
      VITE_API_BASE_URL: `http://127.0.0.1:${ports.bff}`,
    },
    FRONTEND_ROOT
  )
  await waitFor('frontend', () => httpReachable(`http://127.0.0.1:${ports.frontend}/login`))
  await waitFor('BFF', () => httpReachable(`http://127.0.0.1:${ports.bff}/api/health`))
  await waitFor('people-service', () =>
    httpReachable(`http://127.0.0.1:${ports.people}/api/health`)
  )
  await waitFor('access-control-service', () =>
    httpReachable(`http://127.0.0.1:${ports.accessControl}/api/v1/health`)
  )

  if (process.env.LIVE_E2E_KEEP_ALIVE === '1') {
    console.log(`Manual environment ready: http://127.0.0.1:${ports.frontend}/`)
    console.log('Press Ctrl+C to stop the disposable environment and clean up.')
    await new Promise(resolve => {
      process.once('SIGINT', resolve)
      process.once('SIGTERM', resolve)
    })
    return
  }

  const env = {
    ...process.env,
    LIVE_FRONTEND_URL: `http://127.0.0.1:${ports.frontend}`,
    LIVE_KEYCLOAK_BASE_URL: `http://127.0.0.1:${ports.keycloak}`,
    LIVE_ADMIN_USER_ID: adminUser.id,
    LIVE_ADMIN_USERNAME: adminUser.username,
    LIVE_ADMIN_PASSWORD: adminUser.password,
    LIVE_NON_ADMIN_USERNAME: nonAdminUser.username,
    LIVE_NON_ADMIN_PASSWORD: nonAdminUser.password,
    LIVE_BOOTSTRAP_TARGET_USER_ID: bootstrapTargetUser.id,
    LIVE_KEYCLOAK_ADMIN_TOKEN: adminToken,
    LIVE_DEPLOYMENT_PRIVATE_KEY_PATH: keys['deployment-bootstrap'].privatePath,
    LIVE_DEPLOYMENT_KEY_ID: keys['deployment-bootstrap'].keyId,
    LIVE_ACCESS_CONTROL_URL: `http://127.0.0.1:${ports.accessControl}`,
    LIVE_POSTGRES_CONTAINER: names.postgres,
  }
  try {
    run('npx', ['playwright', 'test', 'e2e/administration.live.spec.ts'], {
      cwd: FRONTEND_ROOT,
      env,
      stdio: 'inherit',
      timeout: 300_000,
    })
  } catch (error) {
    diagnoseManageCustomFields(names.postgres)
    throw error
  }
}

try {
  await main()
} catch (error) {
  runFailed = true
  console.error(`Live E2E harness failed: ${error.message}`)
  if (tempDir) console.error(`Non-secret failure logs were written to ${tempDir}`)
  process.exitCode = 1
} finally {
  await stopAll()
}
