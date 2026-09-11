import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { IdentityResolutionService } from '../src/modules/identity-mappings/identity-resolution.service';
import type {
  AccessRoleResolution,
  AccessRoleResolutionPort,
} from '../src/modules/profile/profile.ports';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  E2E_JWT_ISSUER,
  createIdentityResolutionStub,
  installJwtAuthGuardBypass,
} from './support/e2e-auth.helpers';

const SERVICE_ROOT = path.resolve(__dirname, '..');
const MANAGER_SECTION_ACCESS = {
  s1: { level: 'ReadWrite' as const },
  s2: { level: 'ReadWrite' as const },
  s10: { level: 'Read' as const },
  s11: { level: 'Read' as const },
};

describe('Employees (e2e)', () => {
  jest.setTimeout(240_000);

  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let currentViewerId: string;
  let resolveMock: jest.Mock;
  let resolveBatchMock: jest.Mock;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('people_service_employees_e2e')
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
      OIDC_ALLOWED_ISSUERS: E2E_JWT_ISSUER,
      ACCESS_CONTROL_SERVICE_BASE_URL: 'http://stub-access-control:3007',
    };

    resolveMock = jest.fn();
    resolveBatchMock = jest.fn();
    const fakeAccessRoleResolution: AccessRoleResolutionPort = {
      resolve: resolveMock,
      resolveBatch: resolveBatchMock,
    };

    installJwtAuthGuardBypass();

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
      .overrideProvider(IdentityResolutionService)
      .useValue(createIdentityResolutionStub(() => currentViewerId))
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

  it('returns a field catalog and paginated list with batch resolve for catalog and one per list page', async () => {
    const viewer = await prisma.person.create({
      data: {
        fullName: 'Viewer Manager',
        reports: {
          create: [{ fullName: 'Report One', countryCity: 'Kyiv' }],
        },
      },
      include: { reports: true },
    });
    currentViewerId = viewer.id;
    const subjectId = viewer.reports[0].id;

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

    const catalogResponse = await request(app.getHttpServer())
      .get('/employees/field-catalog')
      .expect(200);
    const catalogBody = catalogResponse.body as {
      fields: Array<{ key: string }>;
    };

    expect(
      catalogBody.fields.some((field) => field.key === 'yearsWithCompany'),
    ).toBe(true);
    expect(resolveBatchMock).toHaveBeenCalledTimes(1);

    const listResponse = await request(app.getHttpServer())
      .get('/employees?page=1&pageSize=50')
      .expect(200);
    const listBody = listResponse.body as {
      items: Array<{ values: { fullName?: string } }>;
    };

    expect(resolveBatchMock).toHaveBeenCalledTimes(3);
    expect(resolveBatchMock).toHaveBeenNthCalledWith(
      3,
      viewer.id,
      expect.arrayContaining([subjectId]),
    );
    expect(
      listBody.items.some((item) => item.values.fullName === 'Report One'),
    ).toBe(true);
  });

  it('lists 500+ employees within the NFR-2 budget using one batch resolve', async () => {
    const viewer = await prisma.person.create({
      data: { fullName: 'Perf Viewer' },
    });
    currentViewerId = viewer.id;

    const people = Array.from({ length: 520 }, (_, index) => ({
      fullName: `Employee ${String(index).padStart(3, '0')}`,
      countryCity: 'Kyiv',
      startDate: new Date(2015, 0, 1),
      managerId: viewer.id,
    }));
    await prisma.person.createMany({ data: people });

    const allIds = await prisma.person.findMany({
      where: { managerId: viewer.id },
      select: { id: true },
      orderBy: { fullName: 'asc' },
    });

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

    const started = Date.now();
    const response = await request(app.getHttpServer())
      .get('/employees?page=1&pageSize=100&countryCity=Kyiv')
      .expect(200);
    const elapsedMs = Date.now() - started;
    const responseBody = response.body as {
      totalCount: number;
      items: unknown[];
    };

    expect(responseBody.totalCount).toBeGreaterThanOrEqual(500);
    expect(responseBody.items.length).toBe(100);
    expect(resolveBatchMock).toHaveBeenCalledTimes(2);
    const listBatchCall = resolveBatchMock.mock.calls[1] as
      [string, string[]] | undefined;
    expect(listBatchCall?.[1]).toHaveLength(100);
    expect(elapsedMs).toBeLessThan(2000);
    expect(allIds.length).toBeGreaterThanOrEqual(500);
  });
});
