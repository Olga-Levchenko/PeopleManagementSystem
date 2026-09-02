import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import path from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';

/**
 * Proves the six I/O-matrix rows of `spec-1-11b-bff-jwt-validation.md` end-to-end against a real,
 * ephemeral Keycloak (Testcontainers), reusing `authentication-service`'s own
 * `keycloak/realm-export.json` -- the same realm/client/test user Story 1.11's first slice already
 * proved works. Requires Docker locally/in CI.
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

/**
 * A test-only probe route, added purely so this suite can assert `request.user.sub` over HTTP --
 * no production controller today reads `request.user` (the `organisational-relationships`
 * controller only forwards the raw `Authorization` header, per this story's frozen boundaries).
 * Added alongside `AppModule`'s real imports/providers, so it is still guarded by the real,
 * production `JwtAuthGuard` registered as `APP_GUARD` inside `AppModule`.
 */
interface RequestWithVerifiedUser extends Request {
  user?: { sub?: string };
}

@Controller('__test-probe')
class ProbeController {
  @Get('whoami')
  whoami(@Req() req: RequestWithVerifiedUser) {
    return { sub: req.user?.sub };
  }
}

interface TokenResponse {
  access_token: string;
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
    // actually forwards to.
    const host =
      container.getHost() === 'localhost' ? '127.0.0.1' : container.getHost();
    baseUrl = `http://${host}:${container.getMappedPort(8080)}`;

    // See the module-level comment: overriding ConfigService (rather than process.env) is what
    // actually gets the container's real KEYCLOAK_BASE_URL/KEYCLOAK_REALM into JwtStrategy.
    const configOverrides: Record<string, string> = {
      KEYCLOAK_BASE_URL: baseUrl,
      KEYCLOAK_REALM: REALM,
      // Defaults for keys this suite never exercises via HTTP (organisational-relationships'
      // upstream call, main.ts's own bootstrap) -- kept so any incidental getOrThrow() call
      // still resolves instead of throwing.
      PORT: '3001',
      CORS_ORIGIN: 'http://localhost:4200',
      PEOPLE_SERVICE_URL: 'http://localhost:3002',
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
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
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('missing token: 401, never reaches the controller', async () => {
    await request(app.getHttpServer()).get('/__test-probe/whoami').expect(401);
  });

  it('valid token: request reaches the controller and request.user.sub matches the sub claim', async () => {
    const { access_token: accessToken } = await obtainToken();
    const payload = JSON.parse(
      Buffer.from(accessToken.split('.')[1], 'base64').toString('utf8'),
    ) as { sub: string };

    const res = await request(app.getHttpServer())
      .get('/__test-probe/whoami')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect((res.body as { sub: string }).sub).toBe(payload.sub);
  });

  it('malformed token: 401', async () => {
    await request(app.getHttpServer())
      .get('/__test-probe/whoami')
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
      .get('/__test-probe/whoami')
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
        .get('/__test-probe/whoami')
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

  describe('the guard actually protects a real production route (not just /health and the test probe)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('PATCH /organisational-relationships/.../manager with no token: 401, upstream people-service is never called', async () => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch');

      await request(app.getHttpServer())
        .patch('/organisational-relationships/people/some-person-id/manager')
        .send({ relatedPersonId: 'some-manager-id' })
        .expect(401);

      // Proves the guard actually short-circuited before OrganisationalRelationshipsService's own
      // upstream fetch to people-service -- not just that the HTTP response happened to be 401
      // for some other reason downstream.
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('PATCH /organisational-relationships/.../manager with a valid token: guard lets it through (not 401/403)', async () => {
      const { access_token: accessToken } = await obtainToken();

      // people-service isn't actually running in this suite -- mocked so the request can reach
      // and pass through OrganisationalRelationshipsService without a real upstream dependency.
      // What's under test here is only that the guard let the request through, not what
      // people-service would have done with it.
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: jest.fn().mockResolvedValue({ ok: true }),
      } as unknown as Response);

      const res = await request(app.getHttpServer())
        .patch('/organisational-relationships/people/some-person-id/manager')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ relatedPersonId: 'some-manager-id' });

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
