import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import expressSession from 'express-session';
import path from 'path';
import request from 'supertest';
import { App } from 'supertest/types';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';

/**
 * End-to-end tests for the full PKCE OIDC session lifecycle (Story 1.12) and the persistent
 * session-store fix (Story 1.13). Drives the five-endpoint BFF auth flow
 * (/login → Keycloak → /callback → /me → /logout) against a real ephemeral Keycloak container
 * using headless HTTP redirect-following.
 *
 * No browser binary is required. Keycloak's login form is parsed from HTML and submitted as
 * application/x-www-form-urlencoded via axios with maxRedirects:0, giving full control over
 * each redirect hop.
 *
 * Container setup mirrors jwt-guard.e2e-spec.ts: same image, same realm-export.json, same
 * ConfigService override pattern. Docker is required for this suite.
 */

const REALM = 'people-management';
const CLIENT_SECRET = 'local-dev-bff-confidential-secret';
const TEST_USERNAME = 'story1-11.test-user';
const TEST_PASSWORD = 'Story1-11-TestPassword!';

/**
 * BFF listen port — offset from the default 3001 to avoid collisions with a running dev server.
 * The test BFF app listens here for /login, but the OIDC callback URL uses port 3001 (see below).
 */
const BFF_PORT = 3091;

/**
 * The OIDC callback URL sent to Keycloak as redirect_uri. Must match one of the redirectUris
 * registered in realm-export.json's bff-confidential client.
 *
 * realm-export.json registers `http://localhost:3001/*` (wildcard). We use the 3001 base URL
 * so Keycloak accepts the redirect_uri without modification to realm-export.json.
 *
 * Keycloak redirects the user-agent (in this case the test) to this URL. The test never
 * actually follows the redirect to port 3001 — it extracts the path+query from the Location
 * header and replays it directly on the test app via app.getHttpServer() (supertest), bypassing
 * the network port entirely. The BFF test server's listen port (3091) is irrelevant here.
 */
const OIDC_CALLBACK_URL = 'http://localhost:3001/api/v1/auth/callback';

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

/**
 * Extract cookies from an axios response's set-cookie header and return them as a flat
 * `name=value` string suitable for a Cookie request header.
 */
function extractCookiesFromAxiosResponse(
  headers: Record<string, string | string[] | undefined>,
): string {
  const raw = headers['set-cookie'];
  if (!raw) return '';
  const cookies = Array.isArray(raw) ? raw : [raw];
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

/**
 * Merge two cookie strings, de-duplicating by name (later values win). Used to accumulate
 * cookies across multiple redirect hops.
 */
function mergeCookies(existing: string, incoming: string): string {
  if (!incoming) return existing;
  if (!existing) return incoming;
  const map = new Map<string, string>();
  for (const pair of [...existing.split('; '), ...incoming.split('; ')]) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 0) continue;
    const name = pair.slice(0, eqIdx).trim();
    const value = pair.slice(eqIdx + 1).trim();
    if (name) map.set(name, value);
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

// ---------------------------------------------------------------------------
// HTML form parsing
// ---------------------------------------------------------------------------

/**
 * Parse the Keycloak login-form HTML and return the POST action URL and all hidden input values.
 * Keycloak renders a standard HTML form; the action URL contains session_code and other
 * server-side CSRF parameters baked as query params.
 */
function parseLoginForm(html: string): {
  action: string;
  hidden: Record<string, string>;
} {
  const actionMatch = /<form[^>]+action="([^"]+)"/i.exec(html);
  if (!actionMatch) {
    throw new Error('Could not locate <form action> in Keycloak login HTML');
  }
  // Keycloak HTML-encodes & as &amp; inside attribute values.
  const action = actionMatch[1].replace(/&amp;/g, '&');

  const hidden: Record<string, string> = {};
  const hiddenRe = /<input[^>]+type="hidden"[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = hiddenRe.exec(html)) !== null) {
    const nameMatch = /name="([^"]+)"/.exec(match[0]);
    const valueMatch = /value="([^"]*)"/.exec(match[0]);
    if (nameMatch) {
      hidden[nameMatch[1]] = valueMatch ? valueMatch[1] : '';
    }
  }
  return { action, hidden };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('OIDC session e2e (Story 1.13)', () => {
  jest.setTimeout(180_000);

  let container: StartedTestContainer;
  let keycloakBaseUrl: string;
  let app: INestApplication<App>;

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

    // Force IPv4 to avoid dual-stack resolution issues -- see jwt-guard.e2e-spec.ts comment.
    const host =
      container.getHost() === 'localhost' ? '127.0.0.1' : container.getHost();
    keycloakBaseUrl = `http://${host}:${container.getMappedPort(8080)}`;

    // ConfigService override -- mirrors jwt-guard.e2e-spec.ts; ConfigModule.forRoot() reads
    // process.env at AppModule import time (before beforeAll), so we must override ConfigService
    // on the compiled testing module rather than setting process.env.
    const configOverrides: Record<string, string> = {
      KEYCLOAK_BASE_URL: keycloakBaseUrl,
      KEYCLOAK_REALM: REALM,
      KEYCLOAK_CLIENT_SECRET: CLIENT_SECRET,
      SESSION_SECRET: 'e2e-test-session-secret-minimum-32-chars!!',
      OIDC_CALLBACK_URL: OIDC_CALLBACK_URL,
      PORT: String(BFF_PORT),
      CORS_ORIGIN: 'http://localhost:4200',
      PEOPLE_SERVICE_URL: 'http://localhost:3002',
      ACCESS_CONTROL_SERVICE_BASE_URL: 'http://localhost:3007',
      // DATABASE_URL intentionally absent: MemoryStore is used for e2e tests.
      // MemoryStore implements .all() so back-channel logout store-scan works.
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string, defaultValue?: unknown) => {
          return key in configOverrides ? configOverrides[key] : defaultValue;
        },
        getOrThrow: (key: string) => {
          const value = configOverrides[key];
          if (value === undefined) {
            throw new Error(`Test ConfigService: unexpected key '${key}'`);
          }
          return value;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();

    // Re-apply main.ts bootstrap settings. The Test runner does not invoke bootstrap(),
    // so global prefix, versioning, pipes, and middleware must be registered explicitly.
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

    // Session middleware (MemoryStore -- no DATABASE_URL in test config).
    app.use(
      expressSession({
        secret: configOverrides.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
        },
      }),
    );

    app.enableCors({
      origin: configOverrides.CORS_ORIGIN,
      credentials: true,
    });

    await app.listen(BFF_PORT);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  // ---------------------------------------------------------------------------
  // Login helper -- drives the full PKCE flow and returns the BFF session cookie.
  // ---------------------------------------------------------------------------

  async function performLogin(): Promise<string> {
    // Step 1: GET /login -- BFF stores oidcState/oidcVerifier in session and redirects to Keycloak.
    const loginRes = await axios.get(
      `http://127.0.0.1:${BFF_PORT}/api/v1/auth/login`,
      {
        maxRedirects: 0,
        validateStatus: (s) => s >= 300 && s < 400,
      },
    );

    let cookieJar = extractCookiesFromAxiosResponse(
      loginRes.headers as Record<string, string | string[] | undefined>,
    );
    const keycloakAuthUrl = loginRes.headers['location'] as string;
    if (!keycloakAuthUrl) {
      throw new Error(
        'No Location header from /login -- expected redirect to Keycloak',
      );
    }

    // Step 2: GET Keycloak's authorization URL, following each redirect manually.
    // Keycloak issues one or more 302s before serving the login form, setting AUTH_SESSION_ID
    // and KC_RESTART cookies on those intermediate responses. Using maxRedirects>0 silently drops
    // those cookies; without them the credential POST (step 3) returns 400 from Keycloak.
    let keycloakCookies = '';
    let loginFormHtml = '';
    {
      let url = keycloakAuthUrl;
      for (let hop = 0; hop < 6; hop++) {
        const hopRes = await axios.get<string>(url, {
          maxRedirects: 0,
          validateStatus: (s) => s >= 200 && s < 400,
          headers: keycloakCookies ? { Cookie: keycloakCookies } : {},
        });
        const incoming = extractCookiesFromAxiosResponse(
          hopRes.headers as Record<string, string | string[] | undefined>,
        );
        keycloakCookies = mergeCookies(keycloakCookies, incoming);
        if (hopRes.status >= 200 && hopRes.status < 300) {
          loginFormHtml = hopRes.data;
          break;
        }
        const nextUrl = hopRes.headers['location'] as string;
        if (!nextUrl) {
          throw new Error(
            'Keycloak redirect missing Location header during auth page fetch',
          );
        }
        url = nextUrl;
      }
      if (!loginFormHtml) {
        throw new Error(
          'Did not reach Keycloak login form after following redirects',
        );
      }
    }
    const { action, hidden } = parseLoginForm(loginFormHtml);

    // Step 3: POST credentials + hidden inputs to the Keycloak form action.
    // Keycloak validates and redirects to OIDC_CALLBACK_URL with ?code=...&state=...
    // AUTH_SESSION_ID / KC_RESTART (from step 2) must be sent or Keycloak returns 400.
    const formBody = new URLSearchParams({
      username: TEST_USERNAME,
      password: TEST_PASSWORD,
      ...hidden,
    });

    const credentialRes = await axios.post(action, formBody.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(keycloakCookies ? { Cookie: keycloakCookies } : {}),
      },
      maxRedirects: 0,
      validateStatus: (s) => s >= 300 && s < 400,
    });

    const callbackUrl = credentialRes.headers['location'] as string;
    if (!callbackUrl) {
      throw new Error(
        'No Location header after credential POST -- expected redirect to BFF callback',
      );
    }

    // Step 4: Send the callback to the BFF. We use supertest (via app.getHttpServer()) rather
    // than axios here because we need the session cookie to be sent to *the test app instance*,
    // not to the actual localhost:BFF_PORT socket. The callback URL from Keycloak uses the
    // registered OIDC_CALLBACK_URL host/port; we parse out the path+query and replay it on
    // the test server's HTTP server.
    const parsedCallback = new URL(callbackUrl);
    const callbackPathWithQuery = `${parsedCallback.pathname}${parsedCallback.search}`;

    const callbackRes = await request(app.getHttpServer())
      .get(callbackPathWithQuery)
      .set('Cookie', cookieJar);

    // The callback endpoint redirects to '/' after populating the session. Merge any new
    // Set-Cookie headers so we carry the updated session ID.
    const newCookies = Array.isArray(callbackRes.headers['set-cookie'])
      ? (callbackRes.headers['set-cookie'] as string[])
          .map((c) => c.split(';')[0])
          .join('; ')
      : ((callbackRes.headers['set-cookie'] as string | undefined) ?? '').split(
          ';',
        )[0];

    cookieJar = mergeCookies(cookieJar, newCookies);

    // The callback endpoint always responds with 302 on success (redirects to CORS_ORIGIN '/').
    // Any other status means the code exchange failed.
    if (callbackRes.status !== 302) {
      throw new Error(
        `Callback returned unexpected status ${callbackRes.status}; body: ${JSON.stringify(callbackRes.body)}`,
      );
    }

    return cookieJar;
  }

  // ---------------------------------------------------------------------------
  // Scenario: /me without session cookie → 401
  // ---------------------------------------------------------------------------

  it('/me without session cookie: 401 Unauthorized', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  // ---------------------------------------------------------------------------
  // Scenario: /callback with no query params → 400
  // ---------------------------------------------------------------------------

  it('/callback with no state or code query params: 400 Bad Request', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/callback').expect(400);
  });

  // ---------------------------------------------------------------------------
  // Scenario: /callback with wrong state → 400, no session populated
  // ---------------------------------------------------------------------------

  it('/callback with wrong state: 400 Bad Request, session stays unauthenticated', async () => {
    // Initiate login to create a session with a real oidcState stored.
    const loginRes = await axios.get(
      `http://127.0.0.1:${BFF_PORT}/api/v1/auth/login`,
      {
        maxRedirects: 0,
        validateStatus: (s) => s >= 300 && s < 400,
      },
    );
    const cookieJar = extractCookiesFromAxiosResponse(
      loginRes.headers as Record<string, string | string[] | undefined>,
    );

    // Send callback with the wrong state.
    await request(app.getHttpServer())
      .get('/api/v1/auth/callback')
      .set('Cookie', cookieJar)
      .query({ state: 'tampered-state-value', code: 'fake-code' })
      .expect(400);

    // Session must not have been populated with userId.
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', cookieJar)
      .expect(401);
  });

  // ---------------------------------------------------------------------------
  // Scenario: full happy path — login → /me → logout → 401
  // ---------------------------------------------------------------------------

  it('full PKCE happy path: login → /me 200 { sub, email } → logout → /me 401', async () => {
    const sessionCookie = await performLogin();

    // /me must return the authenticated user's sub and email.
    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie)
      .expect(200);

    const meBody = meRes.body as { sub: string; email: string };
    expect(typeof meBody.sub).toBe('string');
    expect(meBody.sub.length).toBeGreaterThan(0);
    expect(typeof meBody.email).toBe('string');

    // POST /logout destroys the session and redirects to Keycloak end_session or /login.
    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', sessionCookie);
    expect([200, 302, 303]).toContain(logoutRes.status);

    // The same cookie must no longer authenticate.
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Cookie', sessionCookie)
      .expect(401);
  });

  // ---------------------------------------------------------------------------
  // Scenario: back-channel logout endpoint guards
  // ---------------------------------------------------------------------------

  it('POST /backchannel-logout with missing logout_token: 400 Bad Request', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/backchannel-logout')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('')
      .expect(400);
  });

  it('POST /backchannel-logout with invalid (non-JWT) logout_token: 400 Bad Request', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/backchannel-logout')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('logout_token=this-is-not-a-jwt')
      .expect(400);
  });

  it('POST /backchannel-logout with well-formed but unverifiable JWT: 400 Bad Request', async () => {
    // A structurally valid JWT with an HS256 signature that Keycloak never issued -- openid-client
    // must reject it during JWKS verification, returning 400 to the caller.
    const fakeHeader = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const fakePayload = Buffer.from(
      JSON.stringify({
        sub: 'fake-sub',
        iat: Math.floor(Date.now() / 1000),
        events: {},
      }),
    ).toString('base64url');
    const fakeJwt = `${fakeHeader}.${fakePayload}.fake-signature`;

    await request(app.getHttpServer())
      .post('/api/v1/auth/backchannel-logout')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(`logout_token=${fakeJwt}`)
      .expect(400);
  });
});
