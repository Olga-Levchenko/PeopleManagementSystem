import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import type { Server } from 'node:http';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { CorrelationIdMiddleware } from '../../../common/middleware/correlation-id.middleware';
import {
  IdentityResolutionController,
  IdentityResolutionProblemDetailsFilter,
} from '../identity-resolution.controller';
import { IdentityResolutionService } from '../identity-resolution.service';
import { InternalServiceAuthGuard } from '../internal-service-auth.guard';

describe('IdentityResolutionController', () => {
  let app: INestApplication;
  let authorizer: { authorize: jest.Mock };
  let resolver: { resolve: jest.Mock };
  const problemBody = (value: unknown) =>
    value as { status: number; detail: string };
  const server = () => app.getHttpServer() as unknown as Server;

  beforeEach(async () => {
    authorizer = { authorize: jest.fn() };
    resolver = { resolve: jest.fn() };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [IdentityResolutionController],
      providers: [
        InternalServiceAuthGuard,
        {
          provide: 'IInternalServiceAuthorizer',
          useValue: authorizer,
        },
        {
          provide: IdentityResolutionService,
          useValue: resolver,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new IdentityResolutionProblemDetailsFilter());
    const correlation = new CorrelationIdMiddleware();
    app.use(correlation.use.bind(correlation));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns exactly personId and propagates correlation ID for an authorized resolution', async () => {
    authorizer.authorize.mockResolvedValue({
      outcome: 'authenticated',
      context: {
        serviceName: 'fabricated-access-control',
        authenticationId: 'fabricated-authentication',
      },
    });
    resolver.resolve.mockResolvedValue({
      outcome: 'resolved',
      personId: '11111111-1111-4111-8111-111111111111',
    });

    const response = await request(server())
      .post('/api/v1/internal/identity-mappings/resolve')
      .set('x-correlation-id', 'fabricated-correlation')
      .send({
        issuer: 'https://id.example.test/realms/people-management',
        subject: 'fabricated-subject',
      })
      .expect(200);

    const successBody = response.body as { personId: string };
    expect(successBody).toEqual({
      personId: '11111111-1111-4111-8111-111111111111',
    });
    expect(Object.keys(successBody)).toEqual(['personId']);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.headers['x-correlation-id']).toBe('fabricated-correlation');
    expect(resolver.resolve).toHaveBeenCalledWith(
      'https://id.example.test/realms/people-management',
      'fabricated-subject',
    );
  });

  it.each([
    ['missing authentication', { outcome: 'missing' }, 401],
    ['unauthorized service', { outcome: 'unauthorized' }, 403],
  ])(
    'returns a safe problem response for %s',
    async (_name, result, status) => {
      authorizer.authorize.mockResolvedValue(result);

      const response = await request(server())
        .post('/api/v1/internal/identity-mappings/resolve')
        .send({
          issuer: 'https://id.example.test/realms/people-management',
          subject: 'subject',
        })
        .expect(status);

      expect(response.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(problemBody(response.body).status).toBe(status);
      expect(JSON.stringify(response.body)).not.toContain('subject');
      expect(JSON.stringify(response.body)).not.toContain('token');
      expect(resolver.resolve).not.toHaveBeenCalled();
    },
  );

  it('maps unavailable authorization to 503', async () => {
    authorizer.authorize.mockRejectedValue(new Error('credential details'));

    const response = await request(server())
      .post('/api/v1/internal/identity-mappings/resolve')
      .send({
        issuer: 'https://id.example.test/realms/people-management',
        subject: 'subject',
      })
      .expect(503);

    expect(response.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(problemBody(response.body).detail).not.toContain('credential');
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it.each([
    ['missing mapping', { outcome: 'missing' }, 404],
    ['ambiguous mapping', { outcome: 'ambiguous' }, 409],
    ['database failure', { outcome: 'unavailable' }, 503],
  ])('maps resolver outcome %s safely', async (_name, result, status) => {
    authorizer.authorize.mockResolvedValue({
      outcome: 'authenticated',
      context: {},
    });
    resolver.resolve.mockResolvedValue(result);

    const response = await request(server())
      .post('/api/v1/internal/identity-mappings/resolve')
      .send({
        issuer: 'https://id.example.test/realms/people-management',
        subject: 'subject',
      })
      .expect(status);

    expect(response.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(problemBody(response.body).status).toBe(status);
    expect(JSON.stringify(response.body)).not.toContain('subject');
  });

  it('returns 400 for invalid DTO shape without calling the resolver', async () => {
    authorizer.authorize.mockResolvedValue({
      outcome: 'authenticated',
      context: {},
    });

    const response = await request(server())
      .post('/api/v1/internal/identity-mappings/resolve')
      .send({
        issuer: 'https://id.example.test/realms/people-management',
        subject: '',
        unexpected: 'nope',
      })
      .expect(400);

    expect(response.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(resolver.resolve).not.toHaveBeenCalled();
  });
});
