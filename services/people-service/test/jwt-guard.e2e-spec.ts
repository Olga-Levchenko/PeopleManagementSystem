import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import path from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';
import { UnavailableRelationshipPermissionAdapter } from '../src/modules/organisational-relationships/organisational-relationships.ports';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Proves the four I/O-matrix rows of `spec-1-11c-verified-identity-propagation.md` end-to-end
 * against a real, ephemeral Keycloak (Testcontainers), reusing `authentication-service`'s own
 * `keycloak/realm-export.json` -- the same realm/client/test user `spec-1-11b`'s BFF suite already
 * proved works (`services/bff/test/jwt-guard.e2e-spec.ts`, the pattern this file mirrors). Requires
 * Docker locally/in CI, but nothing else real: `PrismaService` is overridden below with a stub, so
 * this suite runs without a real Postgres/RabbitMQ ("Testcontainers-only", per this story's own
 * Verification section). `test/app.e2e-spec.ts` is the *other* e2e file in this service, and it
 * still needs a real, already-running Postgres -- do not run the full `test:e2e` suite without one
 * (this is also why `people-service-ci.yml` does not set `run_e2e: true`; see deferred-work.md).
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

// Any well-formed UUIDs -- ParseUUIDPipe only runs after the guard (Nest's pipeline order is
// guards, then pipes), so these values never affect the guard-related assertions below; the
// valid-token case needs a real UUID so the request reaches the controller instead of failing
// route-parameter validation first.
const SOME_PERSON_ID = '11111111-1111-4111-8111-111111111111';
const SOME_MANAGER_ID = '22222222-2222-4222-8222-222222222222';

interface TokenResponse {
  access_token: string;
}

/**
 * A minimal `PrismaService` stand-in -- this suite has no real Postgres. Every write path under
 * test rejects at the permission-check stub (`UnavailableRelationshipPermissionAdapter.canChange`)
 * before ever touching Prisma: `OrganisationalRelationshipsService.changePersonRelationship`/
 * `changeDepartmentManager` both call `assertPermission` before `this.prisma.$transaction`. So
 * nothing under test here actually depends on this stub's behavior beyond letting the app boot:
 * `$runCommandRaw` satisfies `PrismaHealthIndicator.pingCheck` (used by `/health`), and
 * `$transaction` satisfies `OutboxPublisherService`'s scheduled background publish loop, which
 * runs once at `onModuleInit` and every `OUTBOX_PUBLISHER_INTERVAL_MS` regardless of any request
 * under test -- rejecting it is caught and logged internally by that service, never surfaced here.
 */
function fakePrismaService() {
  return {
    $runCommandRaw: jest.fn().mockResolvedValue({ ok: 1 }),
    $transaction: jest
      .fn()
      .mockRejectedValue(new Error('Prisma is not available in this suite')),
  };
}

describe('JWT guard (e2e)', () => {
  jest.setTimeout(180_000);

  let container: StartedTestContainer;
  let baseUrl: string;
  let app: INestApplication<App>;

  async function obtainToken(): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
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

    container = await new GenericContainer('quay.io/keycloak/keycloak:26.0')
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
    // actually forwards to. Mirrors services/bff/test/jwt-guard.e2e-spec.ts's identical fix.
    const host =
      container.getHost() === 'localhost' ? '127.0.0.1' : container.getHost();
    baseUrl = `http://${host}:${container.getMappedPort(8080)}`;

    // See the module-level comment: overriding ConfigService (rather than process.env) is what
    // actually gets the container's real KEYCLOAK_BASE_URL/KEYCLOAK_REALM into JwtStrategy.
    const configOverrides: Record<string, string> = {
      KEYCLOAK_BASE_URL: baseUrl,
      KEYCLOAK_REALM: REALM,
      // Defaults for keys this suite never exercises meaningfully -- PrismaService is overridden
      // below (see fakePrismaService), so DATABASE_URL is never actually read by a real Prisma
      // client, and RabbitMqOutboxBroker never really connects because OutboxPublisherService's
      // claimPending() always rejects first. Kept so any incidental getOrThrow() call still
      // resolves instead of throwing.
      PORT: '3002',
      CORS_ORIGIN: 'http://localhost:4200',
      DATABASE_URL: 'postgresql://stub:stub@localhost:5432/stub',
      RABBITMQ_URL: 'amqp://stub:stub@localhost:5672',
      RABBITMQ_EXCHANGE: 'people.relationships',
      OUTBOX_PUBLISHER_RETRY_LIMIT: '5',
      OUTBOX_STALE_LOCK_MINUTES: '10',
      // Deliberately huge, not the service's real default: OutboxPublisherService's background
      // interval fires against fakePrismaService's always-rejecting $transaction regardless of
      // any request under test (see that helper's own doc comment). A short interval floods this
      // suite's ~30s run with a "Scheduled outbox publication failed" log line roughly once a
      // second; this value keeps it from ever firing during the run without disabling the
      // service outright.
      OUTBOX_PUBLISHER_INTERVAL_MS: '999999999',
      ACCESS_CONTROL_SERVICE_BASE_URL: 'http://stub-access-control:3007',
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
  });

  it('missing token: 401, controller (and the permission-check stub) never reached', async () => {
    const canChangeSpy = jest.spyOn(
      UnavailableRelationshipPermissionAdapter.prototype,
      'canChange',
    );

    await request(app.getHttpServer())
      .patch(`/organisational-relationships/people/${SOME_PERSON_ID}/manager`)
      .send({ relatedPersonId: SOME_MANAGER_ID })
      .expect(401);

    expect(canChangeSpy).not.toHaveBeenCalled();
  });

  it('valid token: reaches the controller, RequestActorContext resolves, and fails at the permission stub -- not at authentication', async () => {
    const canChangeSpy = jest.spyOn(
      UnavailableRelationshipPermissionAdapter.prototype,
      'canChange',
    );
    const { access_token: accessToken } = await obtainToken();
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8'),
    ) as { sub: string };

    const res = await request(app.getHttpServer())
      .patch(`/organisational-relationships/people/${SOME_PERSON_ID}/manager`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ relatedPersonId: SOME_MANAGER_ID })
      .expect(401);

    // Distinguishes this 401 from the guard's own generic one: this exact message only comes from
    // OrganisationalRelationshipsService.assertPermission, reached only once RequestActorContext
    // has already resolved a verified actorId from the token -- proving authentication itself
    // passed and the request failed at the still-deferred permission check instead.
    expect((res.body as { message: string }).message).toBe(
      'Relationship authorization is unavailable',
    );
    expect(canChangeSpy).toHaveBeenCalledTimes(1);
    // Not just "was called" -- proves RequestActorContext.actorId actually resolved to *this*
    // token's real sub claim, not some other value (e.g. a stale mock, an empty string that
    // happened to still fail permission, or a swapped argument position).
    expect(canChangeSpy).toHaveBeenCalledWith(
      payload.sub,
      SOME_PERSON_ID,
      'reports_to',
    );
  });

  it('malformed token: 401', async () => {
    await request(app.getHttpServer())
      .patch(`/organisational-relationships/people/${SOME_PERSON_ID}/manager`)
      .set('Authorization', 'Bearer not-a-jwt')
      .send({ relatedPersonId: SOME_MANAGER_ID })
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
      .patch(`/organisational-relationships/people/${SOME_PERSON_ID}/manager`)
      .set('Authorization', `Bearer ${tamperedToken}`)
      .send({ relatedPersonId: SOME_MANAGER_ID })
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
        .patch(`/organisational-relationships/people/${SOME_PERSON_ID}/manager`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ relatedPersonId: SOME_MANAGER_ID })
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
