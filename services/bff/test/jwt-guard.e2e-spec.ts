import { Controller, Get, INestApplication, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import expressSession from 'express-session';
import { generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import path from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { Issuer } from 'openid-client';
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
  jest.setTimeout(360_000);

  let container: StartedTestContainer;
  let baseUrl: string;
  let app: INestApplication<App>;
  let jwksServer: Server;
  let tokenClient: {
    grant: (body: Record<string, string>) => Promise<{ access_token?: string }>;
  };

  async function obtainToken(): Promise<TokenResponse> {
    const tokenSet = await tokenClient.grant({
      grant_type: 'password',
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
      scope: 'openid',
    });
    if (!tokenSet.access_token) {
      throw new Error(
        'Direct-grant token response did not contain an access token.',
      );
    }
    return { access_token: tokenSet.access_token };
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

  async function configureClientJwks(
    adminToken: string,
    jwksUrl: string,
  ): Promise<void> {
    const clientsRes = await fetch(
      `${baseUrl}/admin/realms/${REALM}/clients?clientId=${CLIENT_ID}`,
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const clients = (await clientsRes.json()) as Array<Record<string, unknown>>;
    const client = clients[0];
    const clientId = client?.id;
    if (typeof clientId !== 'string') {
      throw new Error('BFF client was not imported into Keycloak.');
    }

    const attributes = {
      ...((client.attributes as Record<string, string> | undefined) ?? {}),
      'use.jwks.url': 'true',
      'jwks.url': jwksUrl,
      'jwks.string': '',
    };
    const updateRes = await fetch(
      `${baseUrl}/admin/realms/${REALM}/clients/${clientId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...client,
          clientAuthenticatorType: 'client-jwt',
          directAccessGrantsEnabled: true,
          attributes,
        }),
      },
    );
    if (!updateRes.ok) {
      throw new Error(
        `Failed to configure BFF client JWKS: ${updateRes.status} ${await updateRes.text()}`,
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
      .withExtraHosts([
        { host: 'host.docker.internal', ipAddress: 'host-gateway' },
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
      .withStartupTimeout(300_000)
      .start();

    // Force IPv4: on this host "localhost" resolves to an address family whose Docker Desktop
    // port-forward jwks-rsa's plain http/https client can't reach (Node's dual-stack
    // auto-select-family AggregateError), even though undici's global fetch (used elsewhere in
    // this suite) reaches it fine. 127.0.0.1 is unambiguous and matches what Docker Desktop
    // actually forwards to.
    const host =
      container.getHost() === 'localhost' ? '127.0.0.1' : container.getHost();
    baseUrl = `http://${host}:${container.getMappedPort(8080)}`;

    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateJwk = privateKey.export({ format: 'jwk' }) as Record<
      string,
      unknown
    >;
    privateJwk.kid = 'bff-jwt-guard-e2e-key';
    privateJwk.alg = 'RS256';
    privateJwk.use = 'sig';
    const publicJwk = {
      kty: privateJwk.kty,
      n: privateJwk.n,
      e: privateJwk.e,
      kid: privateJwk.kid,
      alg: privateJwk.alg,
      use: privateJwk.use,
    };
    jwksServer = createServer((_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ keys: [publicJwk] }));
    });
    await new Promise<void>((resolve) => {
      jwksServer.listen(0, '0.0.0.0', resolve);
    });
    const jwksAddress = jwksServer.address();
    if (!jwksAddress || typeof jwksAddress === 'string') {
      throw new Error('The BFF E2E JWKS server did not expose a TCP port.');
    }
    await configureClientJwks(
      await obtainAdminToken(),
      `http://host.docker.internal:${jwksAddress.port}/jwks.json`,
    );
    const issuer = await Issuer.discover(`${baseUrl}/realms/${REALM}`);
    const clientJwks = JSON.parse(
      JSON.stringify({ keys: [privateJwk] }),
    ) as ConstructorParameters<typeof issuer.Client>[1];
    tokenClient = new issuer.Client(
      {
        client_id: CLIENT_ID,
        token_endpoint_auth_method: 'private_key_jwt',
        token_endpoint_auth_signing_alg: 'RS256',
      },
      clientJwks,
    );

    // See the module-level comment: overriding ConfigService (rather than process.env) is what
    // actually gets the container's real KEYCLOAK_BASE_URL/KEYCLOAK_REALM into JwtStrategy.
    const configOverrides: Record<string, string> = {
      KEYCLOAK_BASE_URL: baseUrl,
      KEYCLOAK_REALM: REALM,
      KEYCLOAK_CLIENT_PRIVATE_KEY_PATH:
        process.env.KEYCLOAK_CLIENT_PRIVATE_KEY_PATH!,
      KEYCLOAK_CLIENT_KEY_ID: 'test-key',
      KEYCLOAK_CLIENT_AUTH_SIGNING_ALG: 'RS256',
      // Defaults for keys this suite never exercises via HTTP (organisational-relationships'
      // upstream call, main.ts's own bootstrap, session middleware) -- kept so any incidental
      // getOrThrow() call still resolves instead of throwing.
      PORT: '3001',
      CORS_ORIGIN: 'http://localhost:4200',
      PEOPLE_SERVICE_URL: 'http://localhost:3002',
      ACCESS_CONTROL_SERVICE_BASE_URL: 'http://localhost:3007',
      SESSION_SECRET: 'jwt-guard-e2e-test-session-secret-min32!!',
      OIDC_CALLBACK_URL: 'http://localhost:3001/api/v1/auth/callback',
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

    // JwtAuthGuard.canActivate (Story 1.12) reads req.session.userId before enforcing the
    // session-only browser boundary. Without this middleware req.session is undefined and the
    // guard throws a TypeError → 500.
    app.use(
      expressSession({
        secret: configOverrides.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: 'lax', secure: false },
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((resolve, reject) => {
      if (!jwksServer) {
        resolve();
        return;
      }
      jwksServer.close((error) => (error ? reject(error) : resolve()));
    });
    await container?.stop();
  });

  it('missing token: 401, never reaches the controller', async () => {
    await request(app.getHttpServer()).get('/__test-probe/whoami').expect(401);
  });

  it('valid bearer token without a BFF session: 401, browser token is not accepted', async () => {
    const { access_token: accessToken } = await obtainToken();

    await request(app.getHttpServer())
      .get('/__test-probe/whoami')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
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

    it('PATCH /organisational-relationships/.../manager with a bearer token but no session: 401', async () => {
      const { access_token: accessToken } = await obtainToken();

      const fetchSpy = jest.spyOn(globalThis, 'fetch');

      await request(app.getHttpServer())
        .patch('/organisational-relationships/people/some-person-id/manager')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ relatedPersonId: 'some-manager-id' });

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
