import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import type {
  AccessRoleResolution,
  AccessRoleResolutionPort,
} from '../src/modules/profile/profile.ports';
import { NEITHER_LINE_RESOLUTION } from '../src/modules/profile/profile.ports';
import { PrismaService } from '../src/prisma/prisma.service';

const SERVICE_ROOT = path.resolve(__dirname, '..');
const MANAGER_SECTION_ACCESS = {
  s1: { level: 'ReadWrite' as const },
  s2: { level: 'ReadWrite' as const },
  s10: { level: 'Read' as const },
  s11: { level: 'Read' as const },
};

describe('Saved views (e2e)', () => {
  jest.setTimeout(240_000);

  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let currentViewerId: string;
  let resolveMock: jest.Mock;
  let resolveBatchMock: jest.Mock;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('people_service_saved_views_e2e')
      .start();

    const databaseUrl = container.getConnectionUri();

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: SERVICE_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
      shell: true,
    });

    const configOverrides: Record<string, string> = {
      PORT: '3002',
      CORS_ORIGIN: 'http://localhost:4200',
      DATABASE_URL: databaseUrl,
      RABBITMQ_URL: 'amqp://stub:stub@localhost:5672',
      RABBITMQ_EXCHANGE: 'people.relationships',
      OUTBOX_PUBLISHER_RETRY_LIMIT: '5',
      OUTBOX_STALE_LOCK_MINUTES: '10',
      OUTBOX_PUBLISHER_INTERVAL_MS: '999999999',
      KEYCLOAK_BASE_URL: 'http://localhost:8080',
      KEYCLOAK_REALM: 'people-management',
      ACCESS_CONTROL_SERVICE_BASE_URL: 'http://stub-access-control:3007',
    };

    resolveMock = jest.fn();
    resolveBatchMock = jest.fn();
    const fakeAccessRoleResolution: AccessRoleResolutionPort = {
      resolve: resolveMock,
      resolveBatch: resolveBatchMock,
    };

    jest
      .spyOn(JwtAuthGuard.prototype, 'canActivate')
      .mockImplementation((context: ExecutionContext) => {
        const httpRequest = context
          .switchToHttp()
          .getRequest<{ user?: { sub?: string } }>();
        httpRequest.user = { sub: currentViewerId };
        return true;
      });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        getOrThrow: (key: string) => {
          const value = configOverrides[key];
          if (value === undefined) {
            throw new Error(`Missing config override for ${key}`);
          }
          return value;
        },
        get: (key: string) => configOverrides[key],
      })
      .overrideProvider('AccessRoleResolutionPort')
      .useValue(fakeAccessRoleResolution)
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

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates, lists, shares, and blocks recipient updates', async () => {
    const owner = await prisma.person.create({
      data: { fullName: 'View Owner' },
    });
    const recipient = await prisma.person.create({
      data: { fullName: 'View Recipient' },
    });
    await prisma.person.create({
      data: {
        fullName: 'Managed Report',
        managerId: owner.id,
        countryCity: 'Kyiv',
      },
    });
    await prisma.person.create({
      data: {
        fullName: 'Hidden Report',
        managerId: recipient.id,
        countryCity: 'Kyiv',
      },
    });

    currentViewerId = owner.id;
    const managerResolution: AccessRoleResolution = {
      reportingLine: true,
      projectLine: false,
      peoplePartnerLine: false,
      fullProfileAccessLine: false,
      managerSectionAccess: MANAGER_SECTION_ACCESS,
      peoplePartnerSectionAccess: null,
      fullProfileAccessSectionAccess: null,
    };
    resolveMock.mockResolvedValue(managerResolution);
    resolveBatchMock.mockImplementation(
      (_viewer: string, subjectPersonIds: readonly string[]) => {
        const results = new Map<string, AccessRoleResolution>();
        for (const subjectPersonId of subjectPersonIds) {
          results.set(subjectPersonId, managerResolution);
        }
        return Promise.resolve(results);
      },
    );

    const createResponse = await request(app.getHttpServer())
      .post('/employees/saved-views')
      .send({
        name: 'Kyiv team',
        pageSize: 25,
        configuration: {
          visibleColumnKeys: ['fullName', 'countryCity'],
          filters: { countryCity: 'Kyiv' },
        },
      })
      .expect(201);

    const created = createResponse.body as { id: string; isOwner: boolean };
    expect(created.isOwner).toBe(true);

    await request(app.getHttpServer())
      .post(`/employees/saved-views/${created.id}/shares`)
      .send({ recipientPersonId: recipient.id })
      .expect(201);

    currentViewerId = recipient.id;
    const listResponse = await request(app.getHttpServer())
      .get('/employees/saved-views')
      .expect(200);
    const listed = listResponse.body as Array<{ id: string; isOwner: boolean }>;
    expect(
      listed.some((view) => view.id === created.id && view.isOwner === false),
    ).toBe(true);

    await request(app.getHttpServer())
      .patch(`/employees/saved-views/${created.id}`)
      .send({ name: 'Hijacked' })
      .expect(403);

    currentViewerId = owner.id;
    await request(app.getHttpServer())
      .delete(`/employees/saved-views/${created.id}/shares/${recipient.id}`)
      .expect(204);

    currentViewerId = recipient.id;
    const afterRevoke = await request(app.getHttpServer())
      .get('/employees/saved-views')
      .expect(200);
    const revokedList = afterRevoke.body as Array<{ id: string }>;
    expect(revokedList.some((view) => view.id === created.id)).toBe(false);
  });

  it('viewer scoped list rejects management-only filters for recipients', async () => {
    const owner = await prisma.person.create({
      data: { fullName: 'Scoped Owner' },
    });
    const recipient = await prisma.person.create({
      data: { fullName: 'Scoped Recipient' },
    });
    const report = await prisma.person.create({
      data: {
        fullName: 'Scoped Report',
        managerId: owner.id,
      },
    });

    const managementField = await prisma.customFieldDefinition.create({
      data: {
        name: 'Internal Grade',
        visibility: 'MANAGEMENT',
        isActive: true,
      },
    });
    await prisma.customFieldValue.create({
      data: {
        personId: report.id,
        definitionId: managementField.id,
        value: 'Senior',
      },
    });

    const customFieldKey = `custom:${managementField.id}`;
    const managerResolution: AccessRoleResolution = {
      reportingLine: true,
      projectLine: false,
      peoplePartnerLine: false,
      fullProfileAccessLine: false,
      managerSectionAccess: MANAGER_SECTION_ACCESS,
      peoplePartnerSectionAccess: null,
      fullProfileAccessSectionAccess: null,
    };

    currentViewerId = owner.id;
    resolveMock.mockResolvedValue(managerResolution);
    resolveBatchMock.mockImplementation(
      (_viewer: string, subjectPersonIds: readonly string[]) => {
        const results = new Map<string, AccessRoleResolution>();
        for (const subjectPersonId of subjectPersonIds) {
          results.set(subjectPersonId, managerResolution);
        }
        return Promise.resolve(results);
      },
    );

    const createResponse = await request(app.getHttpServer())
      .post('/employees/saved-views')
      .send({
        name: 'Senior only',
        pageSize: 25,
        configuration: {
          visibleColumnKeys: ['fullName'],
          filters: {
            customFieldFilters: { [customFieldKey]: 'Senior' },
          },
        },
      })
      .expect(201);

    const created = createResponse.body as { id: string };

    const ownerCatalogResponse = await request(app.getHttpServer())
      .get('/employees/field-catalog')
      .expect(200);
    const ownerCatalog = ownerCatalogResponse.body as {
      fields: Array<{ key: string }>;
    };
    expect(
      ownerCatalog.fields.some((field) => field.key === customFieldKey),
    ).toBe(true);

    await request(app.getHttpServer())
      .post(`/employees/saved-views/${created.id}/shares`)
      .send({ recipientPersonId: recipient.id })
      .expect(201);

    currentViewerId = recipient.id;
    resolveMock.mockResolvedValue(NEITHER_LINE_RESOLUTION);
    resolveBatchMock.mockImplementation(
      (_viewer: string, subjectPersonIds: readonly string[]) => {
        const results = new Map<string, AccessRoleResolution>();
        for (const subjectPersonId of subjectPersonIds) {
          results.set(subjectPersonId, NEITHER_LINE_RESOLUTION);
        }
        return Promise.resolve(results);
      },
    );

    const sharedViewResponse = await request(app.getHttpServer())
      .get('/employees/saved-views')
      .expect(403);
    expect(sharedViewResponse.body).toMatchObject({
      statusCode: 403,
      error: 'COLLEAGUE_BROWSE_RESTRICTED',
    });

    const recipientCatalogResponse = await request(app.getHttpServer())
      .get('/employees/field-catalog')
      .expect(200);
    const recipientCatalog = recipientCatalogResponse.body as {
      fields: Array<{ key: string }>;
    };
    expect(
      recipientCatalog.fields.some((field) => field.key === customFieldKey),
    ).toBe(false);

    await request(app.getHttpServer())
      .get('/employees')
      .query({ [customFieldKey]: 'Senior' })
      .expect(400);
  });
});
