import path from 'node:path';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
// AppModule is deliberately NOT imported statically: its ConfigModule.forRoot(...) validates
// KEYCLOAK_BASE_URL/KEYCLOAK_REALM eagerly at module-evaluation time, which (because ES imports
// are hoisted) would run before this file's beforeAll ever sets those variables from the started
// container. Load it with a plain `require()` instead, inside beforeAll, after process.env is
// set — a dynamic `import()` would need --experimental-vm-modules under ts-jest's CommonJS
// transform, which this service (no Prisma WASM client) doesn't otherwise need.
import type { AppModule as AppModuleType } from '../src/app.module';

// Realm/client/user provisioned by this story's own keycloak/realm-export.json — kept in
// sync with that file's values, not independently invented here.
const REALM = 'people-management';
const REALM_EXPORT_PATH = path.resolve(
  __dirname,
  '../keycloak/realm-export.json',
);
const TEST_USERNAME = 'story1-11.test-user';
const TEST_PASSWORD = 'Story1-11-TestPassword!';
const CLIENT_ID = 'bff-confidential';
const CLIENT_SECRET = 'local-dev-bff-confidential-secret';

type DiscoveryDocument = { issuer: string; jwks_uri: string };
type TokenResponse = { access_token: string; token_type: string };
type AuthConfigResponse = { issuer: string; jwksUri: string; realm: string };

const decodeJwtPart = (part: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;

describe('Platform authentication via Keycloak (integration)', () => {
  let container: StartedTestContainer;
  let keycloakBaseUrl: string;
  let app: INestApplication<App>;

  beforeAll(async () => {
    container = await new GenericContainer('quay.io/keycloak/keycloak:26.0')
      .withExposedPorts(8080)
      .withEnvironment({
        KEYCLOAK_ADMIN: 'admin',
        KEYCLOAK_ADMIN_PASSWORD: 'admin',
      })
      .withCopyFilesToContainer([
        {
          source: REALM_EXPORT_PATH,
          target: '/opt/keycloak/data/import/realm-export.json',
        },
      ])
      .withCommand(['start-dev', '--import-realm'])
      .withWaitStrategy(Wait.forLogMessage(/Listening on:/))
      .withStartupTimeout(180_000)
      .start();

    keycloakBaseUrl = `http://${container.getHost()}:${container.getMappedPort(8080)}`;

    process.env.KEYCLOAK_BASE_URL = keycloakBaseUrl;
    process.env.KEYCLOAK_REALM = REALM;
    process.env.CORS_ORIGIN = 'http://localhost:4200';
    process.env.PORT = '0';

    // Deliberately deferred to runtime (see the import comment above); a top-of-file `import`
    // would run too early.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { AppModule } = require('../src/app.module') as {
      AppModule: typeof AppModuleType;
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts's bootstrap so the real /api/v1/... route the AC references exists.
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  }, 60_000);

  it('provisions the configured realm with no manual Admin Console step', async () => {
    const response = await fetch(
      `${keycloakBaseUrl}/realms/${REALM}/.well-known/openid-configuration`,
    );

    expect(response.status).toBe(200);
    const discovery = (await response.json()) as DiscoveryDocument;
    expect(discovery.issuer).toBe(`${keycloakBaseUrl}/realms/${REALM}`);
  });

  it('returns a well-formed, non-expired JWT for a direct-grant login by the seeded test user', async () => {
    const response = await fetch(
      `${keycloakBaseUrl}/realms/${REALM}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          username: TEST_USERNAME,
          password: TEST_PASSWORD,
          scope: 'openid',
        }),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as TokenResponse;
    expect(body.token_type).toBe('Bearer');

    const [headerPart, payloadPart, signaturePart] =
      body.access_token.split('.');
    expect(signaturePart).toBeTruthy();
    expect(decodeJwtPart(headerPart)).toEqual(
      expect.objectContaining({ typ: 'JWT' }),
    );

    const payload = decodeJwtPart(payloadPart);
    expect(payload.iss).toBe(`${keycloakBaseUrl}/realms/${REALM}`);
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp as number).toBeGreaterThan(Date.now() / 1000);
  });

  it('rejects a direct-grant login with the wrong password', async () => {
    const response = await fetch(
      `${keycloakBaseUrl}/realms/${REALM}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          username: TEST_USERNAME,
          password: 'not-the-right-password',
        }),
      },
    );

    expect(response.status).toBe(401);
  });

  it("GET /api/v1/auth/config matches Keycloak's real discovery document for the configured realm", async () => {
    const discoveryResponse = await fetch(
      `${keycloakBaseUrl}/realms/${REALM}/.well-known/openid-configuration`,
    );
    const discovery = (await discoveryResponse.json()) as DiscoveryDocument;

    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/config')
      .expect(200);
    const body = response.body as AuthConfigResponse;

    expect(body.issuer).toBe(discovery.issuer);
    expect(body.jwksUri).toBe(discovery.jwks_uri);
    expect(body.realm).toBe(REALM);
  });
});
