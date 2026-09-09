import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import type { Server } from 'node:http';
import type { NextFunction, Request, Response } from 'express';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { CorrelationIdMiddleware } from '../../../common/middleware/correlation-id.middleware';
import {
  BootstrapIdentityResolutionController,
  IdentityResolutionController,
  IdentityResolutionProblemDetailsFilter,
} from '../identity-resolution.controller';
import { IdentityResolutionService } from '../identity-resolution.service';

describe('IdentityResolutionController', () => {
  let app: INestApplication;
  let resolver: { resolve: jest.Mock };
  const problemBody = (value: unknown) =>
    value as { status: number; detail: string };
  const server = () => app.getHttpServer() as unknown as Server;

  beforeEach(async () => {
    resolver = { resolve: jest.fn() };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        IdentityResolutionController,
        BootstrapIdentityResolutionController,
      ],
      providers: [
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
    app.use((request: Request, _response: Response, next: NextFunction) => {
      Object.assign(request, {
        user: {
          iss: 'https://id.example.test/realms/people-management',
          sub: 'fabricated-subject',
        },
      });
      next();
    });
    const correlation = new CorrelationIdMiddleware();
    app.use(correlation.use.bind(correlation));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns exactly personId and propagates correlation ID for an authorized resolution', async () => {
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
    ['missing mapping', { outcome: 'missing' }, 404],
    ['ambiguous mapping', { outcome: 'ambiguous' }, 409],
    ['database failure', { outcome: 'unavailable' }, 503],
  ])('maps resolver outcome %s safely', async (_name, result, status) => {
    resolver.resolve.mockResolvedValue(result);

    const response = await request(server())
      .post('/api/v1/internal/identity-mappings/resolve')
      .send({
        issuer: 'https://id.example.test/realms/people-management',
        subject: 'fabricated-subject',
      })
      .expect(status);

    expect(response.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(problemBody(response.body).status).toBe(status);
    expect(JSON.stringify(response.body)).not.toContain('subject');
  });

  it('returns 400 for invalid DTO shape without calling the resolver', async () => {
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

  it('resolves bootstrap targets without binding the target to the operator token', async () => {
    resolver.resolve.mockResolvedValue({
      outcome: 'resolved',
      personId: '22222222-2222-4222-8222-222222222222',
    });

    const response = await request(server())
      .post('/api/v1/internal/bootstrap/identity-mappings/resolve')
      .send({
        issuer: 'https://id.example.test/realms/people-management',
        subject: 'bootstrap-target-subject',
      })
      .expect(200);

    expect(response.body).toEqual({
      personId: '22222222-2222-4222-8222-222222222222',
    });
    expect(resolver.resolve).toHaveBeenCalledWith(
      'https://id.example.test/realms/people-management',
      'bootstrap-target-subject',
    );
  });

  it('maps bootstrap target lookup outcomes to the contract statuses', async () => {
    resolver.resolve.mockResolvedValue({ outcome: 'missing' });

    const response = await request(server())
      .post('/api/v1/internal/bootstrap/identity-mappings/resolve')
      .send({
        issuer: 'https://id.example.test/realms/people-management',
        subject: 'bootstrap-target-subject',
      })
      .expect(404);

    expect(problemBody(response.body).status).toBe(404);
  });
});
