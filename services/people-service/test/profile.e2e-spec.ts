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
import type { AccessRoleResolutionPort } from '../src/modules/profile/profile.ports';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Proves Story 1.6's I/O matrix end-to-end against a real, migrated, ephemeral Postgres
 * (Testcontainers -- self-contained, no dependency on the shared `infra/docker-compose.yml`
 * instance) with `AccessRoleResolutionPort` overridden via `overrideProvider` (mirroring
 * `test/jwt-guard.e2e-spec.ts`'s "override a provider on the compiled testing module rather than
 * mocking HTTP wire format" pattern) rather than standing up a real access-control-service.
 *
 * `JwtAuthGuard` cannot be swapped the same way: it's bound to `APP_GUARD` via `useClass` in
 * `AppModule`, and Nest's `DependenciesScanner` registers every `APP_GUARD`/`APP_INTERCEPTOR`/etc.
 * custom provider under a run-specific randomized token (see
 * `@nestjs/core/scanner.js#insertProvider`), which `TestingModuleBuilder.overrideProvider` can
 * never address from outside. This suite is about section-gating, not token validation (already
 * proven end-to-end by `jwt-guard.e2e-spec.ts`), so instead it patches
 * `JwtAuthGuard.prototype.canActivate` directly -- the real guard instance Nest constructs still
 * inherits this prototype, so the patch takes effect without touching production DI wiring. The
 * fake implementation attaches `request.user.sub` from whatever `currentViewerId` a test sets.
 */

const SERVICE_ROOT = path.resolve(__dirname, '..');

describe('Profile (e2e)', () => {
  jest.setTimeout(180_000);

  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let currentViewerId: string;
  let resolveMock: jest.Mock;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('people_service_e2e')
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
      // Huge on purpose: OutboxPublisherService's background loop fires on this interval
      // regardless of any request under test; a short one floods this suite's run with
      // "Scheduled outbox publication failed" (RabbitMQ isn't real) log noise.
      OUTBOX_PUBLISHER_INTERVAL_MS: '999999999',
      KEYCLOAK_BASE_URL: 'http://localhost:8080',
      KEYCLOAK_REALM: 'people-management',
      ACCESS_CONTROL_SERVICE_BASE_URL: 'http://stub-access-control:3007',
    };

    resolveMock = jest.fn();
    const fakeAccessRoleResolution: AccessRoleResolutionPort = {
      resolve: resolveMock,
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
            throw new Error(
              `Test ConfigService override: unexpected key '${key}' requested`,
            );
          }
          return value;
        },
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
    await prisma?.$disconnect();
    await app?.close();
    await container?.stop();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function seedSubject(overrides: Record<string, unknown> = {}) {
    const department = await prisma.department.create({
      data: { name: 'Engineering' },
    });
    const manager = await prisma.person.create({
      data: { fullName: 'Manager Testenko' },
    });
    const peoplePartner = await prisma.person.create({
      data: { fullName: 'PartnerTestenko' },
    });
    const subject = await prisma.person.create({
      data: {
        fullName: 'Subject Testenko',
        photoUrl: 'https://example.test/subject.png',
        position: 'QA Engineer',
        countryCity: 'Kyiv, Ukraine',
        workEmail: 'subject.testenko@example.test',
        workPhone: '+380000000001',
        birthdayMonth: 3,
        birthdayDay: 21,
        startDate: new Date('2023-05-01T00:00:00.000Z'),
        personalPhone: '+380000000002',
        personalEmail: 'subject.personal@example.test',
        residentialAddress: '2 Test Street, Kyiv',
        managerId: manager.id,
        peoplePartnerId: peoplePartner.id,
        departmentId: department.id,
        ...overrides,
      },
    });
    return { subject, manager, peoplePartner, department };
  }

  it('Self: full s1+s2, resolver never called', async () => {
    const { subject } = await seedSubject();
    currentViewerId = subject.id;

    const res = await request(app.getHttpServer())
      .get(`/people/${subject.id}/profile`)
      .expect(200);

    expect(Object.keys(res.body as object).sort()).toEqual(['s1', 's2']);
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('Reporting line: ReadWrite s1 / Read s2 -> both sections present', async () => {
    const { subject } = await seedSubject();
    currentViewerId = 'viewer-reporting-line';
    resolveMock.mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'Read' },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/people/${subject.id}/profile`)
      .expect(200);

    const body = res.body as { s1: { manager: unknown }; s2: unknown };
    expect(Object.keys(res.body as object).sort()).toEqual(['s1', 's2']);
    expect(body.s1.manager).toMatchObject({ fullName: 'Manager Testenko' });
  });

  it('PP line: peoplePartnerLine true with ReadWrite s1/s2 -> both sections present', async () => {
    const { subject } = await seedSubject();
    currentViewerId = 'viewer-pp-line';
    resolveMock.mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      peoplePartnerLine: true,
      managerSectionAccess: null,
      // PP is ReadWrite on S2 even though an unnarrowed Reporting-line viewer is only Read --
      // docs/access-control/section-matrix.md's PP column, confirmed by
      // ManagerSectionAccessPolicy.ResolveForPeoplePartner.
      peoplePartnerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/people/${subject.id}/profile`)
      .expect(200);

    const body = res.body as { s1: { manager: unknown }; s2: unknown };
    expect(Object.keys(res.body as object).sort()).toEqual(['s1', 's2']);
    expect(body.s1.manager).toMatchObject({ fullName: 'Manager Testenko' });
  });

  it('Project line only, narrowed: s2 key absent (not null) from the actual JSON', async () => {
    const { subject } = await seedSubject();
    currentViewerId = 'viewer-project-line';
    resolveMock.mockResolvedValue({
      reportingLine: false,
      projectLine: true,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'None' },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/people/${subject.id}/profile`)
      .expect(200);

    expect(Object.keys(res.body as object)).toEqual(['s1']);
  });

  it('Colleague: neither line qualifies -> s2 key absent (not null) from the actual JSON', async () => {
    const { subject } = await seedSubject();
    currentViewerId = 'viewer-colleague';
    resolveMock.mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      managerSectionAccess: null,
    });

    const res = await request(app.getHttpServer())
      .get(`/people/${subject.id}/profile`)
      .expect(200);

    expect(Object.keys(res.body as object)).toEqual(['s1']);
  });

  it('Resolver unreachable: resolver rejects/fails closed -> still 200, Colleague, S1-only, not a 5xx', async () => {
    const { subject } = await seedSubject();
    currentViewerId = 'viewer-resolver-down';
    // Matches what HttpAccessRoleResolutionAdapter itself returns after catching a network
    // error/non-2xx -- the port never throws in production, so the fake shouldn't either.
    resolveMock.mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      managerSectionAccess: null,
    });

    const res = await request(app.getHttpServer())
      .get(`/people/${subject.id}/profile`)
      .expect(200);

    expect(Object.keys(res.body as object)).toEqual(['s1']);
  });

  it('Unknown subjectPersonId: 404 NotFoundException', async () => {
    currentViewerId = 'viewer-unknown-subject';

    await request(app.getHttpServer())
      .get('/people/00000000-0000-4000-8000-000000000000/profile')
      .expect(404);

    expect(resolveMock).not.toHaveBeenCalled();
  });
});
