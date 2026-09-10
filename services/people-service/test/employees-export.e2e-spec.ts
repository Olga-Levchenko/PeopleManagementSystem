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
import ExcelJS from 'exceljs';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import type {
  AccessRoleResolution,
  AccessRoleResolutionPort,
} from '../src/modules/profile/profile.ports';
import { PrismaService } from '../src/prisma/prisma.service';

const SERVICE_ROOT = path.resolve(__dirname, '..');
const MANAGER_SECTION_ACCESS = {
  s1: { level: 'ReadWrite' as const },
  s2: { level: 'ReadWrite' as const },
  s10: { level: 'Read' as const },
  s11: { level: 'Read' as const },
};

describe('Employees export (e2e)', () => {
  jest.setTimeout(240_000);

  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let currentViewerId: string;
  let resolveMock: jest.Mock;
  let resolveBatchMock: jest.Mock;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('people_service_employees_export_e2e')
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

  beforeEach(async () => {
    jest.clearAllMocks();
    await prisma.person.deleteMany();
  });

  const seedManagerViewerWithReports = async (reportNames: string[]) => {
    const viewer = await prisma.person.create({
      data: {
        fullName: 'Export Viewer',
        reports: {
          create: reportNames.map((fullName) => ({
            fullName,
            countryCity: 'Kyiv',
          })),
        },
      },
      include: { reports: true },
    });
    currentViewerId = viewer.id;

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

    return viewer;
  };

  it('downloads an xlsx file with catalog headers and all matching rows', async () => {
    await seedManagerViewerWithReports(['Report Alpha', 'Report Beta']);

    const response = await request(app.getHttpServer())
      .get('/employees/export?columns=fullName,position&countryCity=Kyiv')
      .expect(200)
      .buffer(true)
      .parse((responsePayload, callback) => {
        const chunks: Buffer[] = [];
        responsePayload.on('data', (chunk: Buffer) => chunks.push(chunk));
        responsePayload.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toContain(
      'employees-export.xlsx',
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body as Buffer);
    const worksheet = workbook.getWorksheet('Employees');
    expect(worksheet).toBeDefined();

    const headerRow = worksheet!.getRow(1);
    expect(headerRow.getCell(1).value).toBe('Full name');
    expect(headerRow.getCell(2).value).toBe('Position');

    const dataRows = worksheet!.rowCount - 1;
    expect(dataRows).toBe(2);
    expect(worksheet!.getRow(2).getCell(1).value).toBe('Report Alpha');
    expect(worksheet!.getRow(3).getCell(1).value).toBe('Report Beta');
  });

  it('returns 400 when columns contains an unknown catalog key', async () => {
    await seedManagerViewerWithReports(['Report One']);

    const response = await request(app.getHttpServer())
      .get('/employees/export?columns=fullName,not-in-catalog')
      .expect(400);

    const body = response.body as { message?: string | string[] };
    const message = Array.isArray(body.message)
      ? body.message.join(' ')
      : String(body.message ?? '');
    expect(message).toContain('not-in-catalog');
  });

  it('returns 400 when columns is empty', async () => {
    await seedManagerViewerWithReports(['Report One']);

    await request(app.getHttpServer())
      .get('/employees/export?columns=')
      .expect(400);
  });
});
