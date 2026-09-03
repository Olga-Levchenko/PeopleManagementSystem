import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';

describe('Functional roles BFF HTTP contract (e2e)', () => {
  let app: INestApplication<App>;
  let upstream: jest.MockedFunction<typeof fetch>;

  beforeEach(async () => {
    upstream = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    jest.spyOn(globalThis, 'fetch').mockImplementation(upstream);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JwtAuthGuard)
      .useClass(TestAuthenticationGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app.close();
  });

  it('forwards authenticated requests and preserves bearer, correlation, and idempotency headers', async () => {
    upstream.mockResolvedValue(jsonResponse(200, { roles: [] }));

    await request(app.getHttpServer())
      .get('/api/v1/functional-roles')
      .set('Authorization', 'Bearer test-only-token')
      .set('x-correlation-id', 'contract-correlation')
      .set('X-Test-Sub', 'test-sub')
      .expect(200);

    const [rolesUrl, rolesInit] = upstream.mock.calls[0] as [
      string,
      RequestInit,
    ];
    const rolesHeaders = rolesInit.headers as Record<string, string>;
    expect(rolesUrl).toBe('http://localhost:3007/api/v1/functional-roles');
    expect(rolesInit.method).toBe('GET');
    expect(rolesHeaders.authorization).toBe('Bearer test-only-token');
    expect(rolesHeaders['x-correlation-id']).toBe('contract-correlation');

    upstream.mockResolvedValue(
      jsonResponse(200, {
        id: 'grant-1',
        roleKey: 'unit-manager',
        permissionKey: 'view-dashboard',
        scope: '{"dashboardType":"unit-manager"}',
      }),
    );

    await request(app.getHttpServer())
      .put('/api/v1/functional-roles/unit-manager/permissions/view-dashboard')
      .set('Authorization', 'Bearer test-only-token')
      .set('x-correlation-id', 'grant-correlation')
      .set('idempotency-key', 'grant-idempotency')
      .set('X-Test-Sub', 'test-sub')
      .send({ scope: { dashboardType: 'unit-manager' } })
      .expect(200)
      .expect((response) => {
        const body = response.body as { scope: string };
        expect(body.scope).toBe('{"dashboardType":"unit-manager"}');
      });

    const [grantUrl, grantInit] = upstream.mock.lastCall as [
      string,
      RequestInit,
    ];
    const grantHeaders = grantInit.headers as Record<string, string>;
    expect(grantUrl).toBe(
      'http://localhost:3007/api/v1/functional-roles/unit-manager/permissions/view-dashboard',
    );
    expect(grantHeaders.authorization).toBe('Bearer test-only-token');
    expect(grantHeaders['x-correlation-id']).toBe('grant-correlation');
    expect(grantHeaders['idempotency-key']).toBe('grant-idempotency');
  });

  it('returns 401 without authentication and never calls upstream', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/functional-roles')
      .expect(401);

    expect(upstream).not.toHaveBeenCalled();
  });

  it('maps upstream statuses and hides upstream error details', async () => {
    for (const status of [400, 403, 404, 409, 503]) {
      upstream.mockResolvedValue(
        jsonResponse(status, {
          message: 'upstream secret',
          connectionString: 'not-for-clients',
        }),
      );

      const response = await request(app.getHttpServer())
        .get('/api/v1/functional-roles/missing-role')
        .set('X-Test-Sub', 'test-sub');

      expect(response.status).toBe(status);
      expect(JSON.stringify(response.body)).not.toContain('upstream secret');
      expect(JSON.stringify(response.body)).not.toContain('connectionString');
    }
  });

  it('returns 400 for DTO validation before calling upstream', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/functional-roles')
      .set('X-Test-Sub', 'test-sub')
      .send({
        roleKey: 'INVALID ROLE',
        displayName: 'Valid display name',
        unexpected: 'rejected',
      })
      .expect(400);

    expect(upstream).not.toHaveBeenCalled();
  });

  it('maps a network failure to 503 without leaking the upstream exception', async () => {
    upstream.mockRejectedValue(new Error('connection secret'));

    const response = await request(app.getHttpServer())
      .get('/api/v1/functional-roles')
      .set('X-Test-Sub', 'test-sub');

    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('connection secret');
  });

  it('returns the authoritative normalized role-permission listing', async () => {
    upstream.mockResolvedValue(
      jsonResponse(200, {
        grants: [
          {
            id: 'grant-1',
            roleKey: 'unit-manager',
            permissionKey: 'view-dashboard',
            scope: '{"dashboardType":"unit-manager"}',
          },
        ],
      }),
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/functional-roles/unit-manager/permissions')
      .set('X-Test-Sub', 'test-sub')
      .expect(200);

    const body = response.body as {
      grants: Array<{ scope: string }>;
    };
    expect(body.grants[0].scope).toBe('{"dashboardType":"unit-manager"}');
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

class TestAuthenticationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requestContext = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { sub: string };
    }>();
    const sub = requestContext.headers['x-test-sub'];
    if (!sub) {
      throw new UnauthorizedException();
    }

    requestContext.user = { sub };
    return true;
  }
}
