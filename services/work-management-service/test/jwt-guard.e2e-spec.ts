import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import path from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';
import type { AccessRoleResolutionPort } from '../src/modules/management-notes/access-control-client';
import { NO_ACCESS_RESOLUTION } from '../src/modules/management-notes/access-control-client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  STORY_1_11_PERSON_ID,
  createStory111IdentityResolutionStub,
} from './support/e2e-auth.helpers';

/**
 * Proves this service's own JWT guard end-to-end against a real, ephemeral Keycloak
 * (Testcontainers), reusing `authentication-service`'s own `keycloak/realm-export.json` -- the
 * same realm/client/test user `people-service`'s own `test/jwt-guard.e2e-spec.ts` already proved
 * works, and the pattern this file mirrors (auth module ported byte-for-byte, per spec-1-7's own
 * Code Map). Requires Docker locally/in CI, but nothing else real: `PrismaService` and
 * `AccessRoleResolutionPort` are both overridden below with stubs/fakes, so this suite runs
 * without a real Postgres or a real access-control-service.
 *
 * `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM` can't simply be set on `process.env` before building the
 * testing module: `ConfigModule.forRoot()` (and therefore `JwtStrategy`'s derived issuer/jwksUri)
 * reads `process.env` synchronously the moment `AppModule`'s `@Module()` decorator is evaluated,
 * i.e. at this file's static `import` time -- before the container's real mapped port is even
 * known. Instead, `ConfigService` itself is overridden on the compiled testing module so
 * `JwtStrategy` (constructed from that same DI container) resolves the container's real
 * `KEYCLOAK_BASE_URL`/`KEYCLOAK_REALM`, without needing a second, freshly-required copy of
 * `AppModule`'s module graph (which would create a second `Reflector`/DI registry and break
 * `JwtAuthGuard`'s own constructor injection).
 */

const REALM = 'people-management';
const CLIENT_ID = 'bff-confidential';
const CLIENT_SECRET = 'local-dev-bff-confidential-secret';
const TEST_USERNAME = 'story1-11.test-user';
const TEST_PASSWORD = 'Story1-11-TestPassword!';

const SOME_SUBJECT_ID = '11111111-1111-4111-8111-111111111111';

interface TokenResponse {
  access_token: string;
}

/**
 * A minimal `PrismaService` stand-in -- this suite has no real Postgres. Every route under test
 * either rejects at the resolved-access check (`ManagementNotesService.resolveAccess`, backed by
 * the faked `AccessRoleResolutionPort` below) before ever touching Prisma, or -- for the valid-
 * token/no-access case -- never reaches a Prisma call at all (`listNotes` throws
 * `ForbiddenException` before calling `findMany`). `$runCommandRaw` satisfies
 * `PrismaHealthIndicator.pingCheck` (used by `/health`, a `@Public()` route this suite also
 * exercises).
 */
function fakePrismaService() {
  return {
    $runCommandRaw: jest.fn().mockResolvedValue({ ok: 1 }),
  };
}

describe('JWT guard (e2e)', () => {
  jest.setTimeout(180_000);

  let container: StartedTestContainer;
  let baseUrl: string;
  let app: INestApplication<App>;
  let resolveMock: jest.Mock;

  async function obtainToken(): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
      scope: 'openid people-service-audience',
    });

    const res = await fetch(
      `${baseUrl}/realms/${REALM}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    if (!res.ok) {
      throw new Error(
        `Direct-grant token request failed: ${res.status} ${await res.text()}`,
      );
    }

    return (await res.json()) as TokenResponse;
  }

  async function obtainAdminToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: 'admin',
      password: 'admin',
    });

    const res = await fetch(
      `${baseUrl}/realms/master/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    if (!res.ok) {
      throw new Error(
        `Admin token request failed: ${res.status} ${await res.text()}`,
      );
    }

    const json = (await res.json()) as TokenResponse;
    return json.access_token;
  }

  async function configureDirectGrantClient(): Promise<void> {
    const adminToken = await obtainAdminToken();
    const clientsResponse = await fetch(
      `${baseUrl}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
      },
    );
    if (!clientsResponse.ok) {
      throw new Error(
        `Failed to find direct-grant client: ${clientsResponse.status} ${await clientsResponse.text()}`,
      );
    }

    const clients = (await clientsResponse.json()) as Array<
      Record<string, unknown>
    >;
    const client = clients[0];
    const clientId = client?.id;
    if (typeof clientId !== 'string') {
      throw new Error('Direct-grant client was not imported into Keycloak.');
    }

    const updateResponse = await fetch(
      `${baseUrl}/admin/realms/${REALM}/clients/${clientId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...client,
          clientAuthenticatorType: 'client-secret',
          directAccessGrantsEnabled: true,
          secret: CLIENT_SECRET,
        }),
      },
    );
    if (!updateResponse.ok) {
      throw new Error(
        `Failed to configure direct-grant client: ${updateResponse.status} ${await updateResponse.text()}`,
      );
    }
  }

  /**
   * Flips this realm's `accessTokenLifespan` so the "expired token" scenario can be proven with a
   * real, correctly-signed Keycloak token (rather than a hand-crafted one, which this suite has no
   * private key to sign) without waiting out the realm's real 300s default lifespan.
   */
  async function setAccessTokenLifespan(seconds: number): Promise<void> {
    const adminToken = await obtainAdminToken();
    const realmUrl = `${baseUrl}/admin/realms/${REALM}`;

    const getRes = await fetch(realmUrl, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!getRes.ok) {
      throw new Error(
        `Failed to read realm representation: ${getRes.status} ${await getRes.text()}`,
      );
    }
    const realmRepresentation = (await getRes.json()) as Record<
      string,
      unknown
    >;
    realmRepresentation.accessTokenLifespan = seconds;

    const putRes = await fetch(realmUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(realmRepresentation),
    });
    if (!putRes.ok) {
      throw new Error(
        `Failed to update realm accessTokenLifespan: ${putRes.status} ${await putRes.text()}`,
      );
    }
  }

  beforeAll(async () => {
    const realmExportPath = path.resolve(
      __dirname,
      '../../authentication-service/keycloak/realm-export.json',
    );

    container = await new GenericContainer('quay.io/keycloak/keycloak:26.2.5')
      .withCopyFilesToContainer([
        {
          source: realmExportPath,
          target: '/opt/keycloak/data/import/realm-export.json',
        },
      ])
      .withEnvironment({
        KEYCLOAK_ADMIN: 'admin',
        KEYCLOAK_ADMIN_PASSWORD: 'admin',
      })
      .withCommand(['start-dev', '--import-realm'])
      .withExposedPorts(8080)
      .withWaitStrategy(
        Wait.forHttp(
          `/realms/${REALM}/.well-known/openid-configuration`,
          8080,
        ).forStatusCode(200),
      )
      .withStartupTimeout(120_000)
      .start();

    // Force IPv4: on this host "localhost" resolves to an address family whose Docker Desktop
    // port-forward jwks-rsa's plain http/https client can't reach (Node's dual-stack
    // auto-select-family AggregateError), even though undici's global fetch (used elsewhere in
    // this suite) reaches it fine. 127.0.0.1 is unambiguous and matches what Docker Desktop
    // actually forwards to. Mirrors people-service's/the BFF's identical fix.
    const host =
      container.getHost() === 'localhost' ? '127.0.0.1' : container.getHost();
    baseUrl = `http://${host}:${container.getMappedPort(8080)}`;
    await configureDirectGrantClient();

    // See the module-level comment: overriding ConfigService (rather than process.env) is what
    // actually gets the container's real KEYCLOAK_BASE_URL/KEYCLOAK_REALM into JwtStrategy.
    const configOverrides: Record<string, string> = {
      KEYCLOAK_BASE_URL: baseUrl,
      KEYCLOAK_REALM: REALM,
      // Defaults for keys this suite never exercises meaningfully -- PrismaService and
      // AccessRoleResolutionPort are both overridden below, so DATABASE_URL/
      // ACCESS_CONTROL_SERVICE_BASE_URL are never actually read by a real client. Kept so any
      // incidental getOrThrow() call still resolves instead of throwing.
      PORT: '3004',
      CORS_ORIGIN: 'http://localhost:4200',
      DATABASE_URL: 'postgresql://stub:stub@localhost:5432/stub',
      ACCESS_CONTROL_SERVICE_BASE_URL: 'http://stub-access-control:3007',
      PEOPLE_SERVICE_BASE_URL: 'http://stub-people:3002',
    };

    resolveMock = jest.fn().mockResolvedValue(NO_ACCESS_RESOLUTION);
    const fakeAccessRoleResolution: AccessRoleResolutionPort = {
      resolve: resolveMock,
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        getOrThrow: (key: string) => {
          const value = configOverrides[key];
          if (value === undefined) {
            throw new Error(
              `Test ConfigService override: unexpected key '${key}' requested`,
            );
          }
          return value;
        },
      })
      .overrideProvider(PrismaService)
      .useValue(fakePrismaService())
      .overrideProvider('AccessRoleResolutionPort')
      .useValue(fakeAccessRoleResolution)
      .overrideProvider('IdentityResolutionPort')
      .useValue(createStory111IdentityResolutionStub())
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resolveMock.mockClear();
    resolveMock.mockResolvedValue(NO_ACCESS_RESOLUTION);
  });

  it('missing token: 401, controller (and the access resolver) never reached', async () => {
    await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${SOME_SUBJECT_ID}`)
      .expect(401);

    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('missing token on POST: 401, controller (and the access resolver) never reached', async () => {
    await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId: SOME_SUBJECT_ID, content: 'x' })
      .expect(401);

    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('missing token on PATCH: 401, controller (and the access resolver) never reached', async () => {
    await request(app.getHttpServer())
      .patch(`/management-notes/${SOME_SUBJECT_ID}`)
      .send({ content: 'x' })
      .expect(401);

    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('missing token on PATCH action-items complete: 401', async () => {
    await request(app.getHttpServer())
      .patch(`/action-items/${SOME_SUBJECT_ID}/complete`)
      .send({})
      .expect(401);

    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('missing token on PATCH action-items cancel: 401', async () => {
    await request(app.getHttpServer())
      .patch(`/action-items/${SOME_SUBJECT_ID}/cancel`)
      .send({ cancelReason: 'x' })
      .expect(401);

    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('missing token on GET action-items mine: 401', async () => {
    await request(app.getHttpServer()).get('/action-items/mine').expect(401);

    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('valid token: reaches the controller, RequestActorContext resolves, and fails at the access-role check -- not at authentication', async () => {
    const { access_token: accessToken } = await obtainToken();

    // No qualifying line at all -- the fake resolver's default NO_ACCESS_RESOLUTION -- so the
    // request reaches ManagementNotesService.resolveAccess and is rejected there (403), proving
    // authentication itself already passed.
    await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${SOME_SUBJECT_ID}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    // Not just "was called" -- proves RequestActorContext mapped the token's Keycloak principal
    // to the seeded platform Person.id, not the raw sub claim.
    expect(resolveMock).toHaveBeenCalledWith(
      STORY_1_11_PERSON_ID,
      SOME_SUBJECT_ID,
      accessToken,
    );
  });

  it('malformed token: 401', async () => {
    await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${SOME_SUBJECT_ID}`)
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('tampered-signature token: 401', async () => {
    const { access_token: accessToken } = await obtainToken();
    const [header, payload, signature] = accessToken.split('.');
    // Flip a character in the middle of the signature, not the last one -- base64url's final
    // character can encode padding bits that don't affect the decoded byte value, so mutating it
    // can silently leave the decoded signature bytes (and therefore verification) unchanged.
    const midIndex = Math.floor(signature.length / 2);
    const flippedChar = signature[midIndex] === 'A' ? 'B' : 'A';
    const tamperedSignature =
      signature.slice(0, midIndex) +
      flippedChar +
      signature.slice(midIndex + 1);
    const tamperedToken = `${header}.${payload}.${tamperedSignature}`;

    await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${SOME_SUBJECT_ID}`)
      .set('Authorization', `Bearer ${tamperedToken}`)
      .expect(401);
  });

  it('expired token: 401', async () => {
    await setAccessTokenLifespan(1);
    try {
      const { access_token: accessToken } = await obtainToken();
      // JwtStrategy sets a 5s clockTolerance (real clock-drift leeway), so a 1s-lifespan token
      // stays acceptable for up to ~6s past issuance -- wait comfortably past that, not just past
      // the raw 1s lifespan, or this would spuriously pass while still inside the tolerance window.
      await new Promise((resolve) => setTimeout(resolve, 8000));

      await request(app.getHttpServer())
        .get(`/management-notes?subjectPersonId=${SOME_SUBJECT_ID}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    } finally {
      await setAccessTokenLifespan(300);
    }
  });

  it('/health (GET): 200, unaffected by the guard, no Authorization header needed', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as { status: string };
        expect(body.status).toBe('ok');
      });
  });
});
