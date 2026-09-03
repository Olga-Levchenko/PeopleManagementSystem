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

  async function seedSubject(
    overrides: Record<string, unknown> = {},
    { seedRecords = true }: { seedRecords?: boolean } = {},
  ) {
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

    if (seedRecords) {
      // S10: one leave entry (used to verify date-only restriction for Colleague)
      await prisma.leave.create({
        data: {
          personId: subject.id,
          startDate: new Date('2024-08-01T00:00:00.000Z'),
          endDate: new Date('2024-08-14T00:00:00.000Z'),
          leaveType: 'vacation',
        },
      });

      // S11: one project assignment (used to verify project-name-only restriction for Colleague)
      await prisma.personProjectAssignment.create({
        data: {
          personId: subject.id,
          projectName: 'Project Beta',
          role: 'Developer',
          startDate: new Date('2023-06-01T00:00:00.000Z'),
          endDate: new Date('2024-06-01T00:00:00.000Z'),
        },
      });

      // S16: one MANAGEMENT-visibility field and one COLLEAGUE-visibility field.
      // Used to verify per-field filtering -- management field should appear only for Manager/PP
      // audiences and be absent for Colleague and Self (management fields are not for the subject
      // about themselves per the S16 matrix row).
      const mgmtFieldDef = await prisma.customFieldDefinition.create({
        data: {
          name: 'Internal Grade',
          visibility: 'MANAGEMENT',
          isActive: true,
        },
      });
      const colleagueFieldDef = await prisma.customFieldDefinition.create({
        data: {
          name: 'Office Location',
          visibility: 'COLLEAGUE',
          isActive: true,
        },
      });
      await prisma.customFieldValue.create({
        data: {
          personId: subject.id,
          definitionId: mgmtFieldDef.id,
          value: 'Senior',
        },
      });
      await prisma.customFieldValue.create({
        data: {
          personId: subject.id,
          definitionId: colleagueFieldDef.id,
          value: 'Kyiv office',
        },
      });
    }

    return { subject, manager, peoplePartner, department };
  }

  it('Self: full s1+s2+s10+s11+s16, resolver never called; management field absent from s16, colleague field present', async () => {
    const { subject } = await seedSubject();
    currentViewerId = subject.id;

    const res = await request(app.getHttpServer())
      .get(`/people/${subject.id}/profile`)
      .expect(200);

    expect(Object.keys(res.body as object).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
      's2',
    ]);
    expect(resolveMock).not.toHaveBeenCalled();
    const body = res.body as {
      s10: Array<Record<string, unknown>>;
      s11: Array<Record<string, unknown>>;
      s16: Array<{ fieldId: string; name: string; value: string }>;
    };
    // Self sees full S10 including leaveType
    expect(body.s10).toHaveLength(1);
    expect(body.s10[0]).toHaveProperty('leaveType', 'vacation');
    // Self sees full S11 including role and dates
    expect(body.s11).toHaveLength(1);
    expect(body.s11[0]).toHaveProperty('projectName', 'Project Beta');
    expect(body.s11[0]).toHaveProperty('role', 'Developer');
    // MANAGEMENT_FIELD_SELF: management-visibility field absent for Self
    const s16Names = body.s16.map((f) => f.name);
    expect(s16Names).not.toContain('Internal Grade');
    // COLLEAGUE_FIELD_ALL: colleague-visibility field present for Self
    expect(s16Names).toContain('Office Location');
  });

  it('Reporting line: ReadWrite s1 / Read s2 / Read s10/s11 -> all four sections + s16 present; both management and colleague fields visible', async () => {
    const { subject } = await seedSubject();
    currentViewerId = 'viewer-reporting-line';
    resolveMock.mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'Read' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
        s16: { level: 'ReadWrite' },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/people/${subject.id}/profile`)
      .expect(200);

    const body = res.body as {
      s1: { manager: unknown };
      s2: unknown;
      s10: Array<Record<string, unknown>>;
      s11: Array<Record<string, unknown>>;
      s16: Array<{ fieldId: string; name: string; value: string }>;
    };
    expect(Object.keys(res.body as object).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
      's2',
    ]);
    expect(body.s1.manager).toMatchObject({ fullName: 'Manager Testenko' });
    // Manager sees full S10 with leaveType
    expect(body.s10[0]).toHaveProperty('leaveType', 'vacation');
    // Manager sees full S11 with role
    expect(body.s11[0]).toHaveProperty('projectName', 'Project Beta');
    expect(body.s11[0]).toHaveProperty('role', 'Developer');
    // MANAGEMENT_FIELD_MANAGER: management audience sees both management and colleague fields
    const s16Names = body.s16.map((f) => f.name);
    expect(s16Names).toContain('Internal Grade');
    expect(s16Names).toContain('Office Location');
  });

  it('PP line: peoplePartnerLine true with ReadWrite s1/s2 and Read s10/s11 -> all four sections + s16 present; management field visible', async () => {
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
        s10: { level: 'Read' },
        s11: { level: 'Read' },
        s16: { level: 'ReadWrite' },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/people/${subject.id}/profile`)
      .expect(200);

    const body = res.body as {
      s1: { manager: unknown };
      s2: unknown;
      s10: Array<Record<string, unknown>>;
      s11: Array<Record<string, unknown>>;
      s16: Array<{ fieldId: string; name: string; value: string }>;
    };
    expect(Object.keys(res.body as object).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
      's2',
    ]);
    expect(body.s1.manager).toMatchObject({ fullName: 'Manager Testenko' });
    // PP sees full S10/S11 data (isColleague: false)
    expect(body.s10[0]).toHaveProperty('leaveType', 'vacation');
    expect(body.s11[0]).toHaveProperty('role', 'Developer');
    // PP gets management-level S16: both management and colleague fields visible
    const s16Names = body.s16.map((f) => f.name);
    expect(s16Names).toContain('Internal Grade');
    expect(s16Names).toContain('Office Location');
  });

  it('Narrowed Project line + PP line together: PP is the only line granting S2, must not be dropped by checking Manager first', async () => {
    const { subject } = await seedSubject();
    currentViewerId = 'viewer-project-and-pp-line';
    resolveMock.mockResolvedValue({
      reportingLine: false,
      projectLine: true,
      peoplePartnerLine: true,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'None' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
        s16: { level: 'ReadWrite' },
      },
      peoplePartnerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
        s16: { level: 'ReadWrite' },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/people/${subject.id}/profile`)
      .expect(200);

    expect(Object.keys(res.body as object).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
      's2',
    ]);
  });

  it('Project line only, narrowed: s2 key absent (not null) from the actual JSON, s10/s11+s16 present with full field data', async () => {
    const { subject } = await seedSubject();
    currentViewerId = 'viewer-project-line';
    resolveMock.mockResolvedValue({
      reportingLine: false,
      projectLine: true,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'None' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
        s16: { level: 'ReadWrite' },
      },
    });

    const res = await request(app.getHttpServer())
      .get(`/people/${subject.id}/profile`)
      .expect(200);

    const body = res.body as {
      s10: Array<Record<string, unknown>>;
      s11: Array<Record<string, unknown>>;
      s16: Array<{ name: string }>;
    };
    expect(Object.keys(res.body as object).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
    ]);
    // Project-line is NOT a Colleague (isColleague: false) -- gets full S10/S11 data
    expect(body.s10[0]).toHaveProperty('leaveType', 'vacation');
    expect(body.s11[0]).toHaveProperty('role', 'Developer');
    // Project-line DM/PM gets management-level S16 (management audience)
    const s16Names = body.s16.map((f) => f.name);
    expect(s16Names).toContain('Internal Grade');
  });

  it('Colleague: neither line qualifies -> exactly s1+s10+s11+s16 (whitelist); s2 absent, leaveType stripped, role/dates stripped; management field absent from s16', async () => {
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

    // COLLEAGUE_WHITELIST_KEYS: exactly s1, s10, s11, s16
    expect(Object.keys(res.body as object).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
    ]);

    const body = res.body as {
      s10: Array<Record<string, unknown>>;
      s11: Array<Record<string, unknown>>;
      s16: Array<{ name: string }>;
    };
    // S10: dates present, leaveType absent
    expect(body.s10).toHaveLength(1);
    expect(body.s10[0]).toHaveProperty('startDate');
    expect(body.s10[0]).toHaveProperty('endDate');
    expect(body.s10[0]).not.toHaveProperty('leaveType');
    // S11: projectName present, role/startDate/endDate absent
    expect(body.s11).toHaveLength(1);
    expect(body.s11[0]).toHaveProperty('projectName', 'Project Beta');
    expect(body.s11[0]).not.toHaveProperty('role');
    expect(body.s11[0]).not.toHaveProperty('startDate');
    expect(body.s11[0]).not.toHaveProperty('endDate');
    // MANAGEMENT_FIELD_COLLEAGUE: management field absent from s16
    const s16Names = body.s16.map((f) => f.name);
    expect(s16Names).not.toContain('Internal Grade');
    // COLLEAGUE_FIELD_ALL: colleague-visibility field present in s16
    expect(s16Names).toContain('Office Location');
  });

  it('EMPTY_RECORDS: subject with no leaves, assignments, or custom field values -> s10:[], s11:[], s16:[] all present as empty arrays for Colleague', async () => {
    const { subject } = await seedSubject({}, { seedRecords: false });
    currentViewerId = 'viewer-colleague-empty';
    resolveMock.mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      managerSectionAccess: null,
    });

    const res = await request(app.getHttpServer())
      .get(`/people/${subject.id}/profile`)
      .expect(200);

    expect(Object.keys(res.body as object).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
    ]);
    const body = res.body as {
      s10: unknown[];
      s11: unknown[];
      s16: unknown[];
    };
    expect(body.s10).toEqual([]);
    expect(body.s11).toEqual([]);
    // NO_VALUES: s16 always present even when there are no custom field values
    expect(body.s16).toEqual([]);
  });

  it('Resolver unreachable: resolver rejects/fails closed -> still 200, Colleague whitelist s1+s10+s11+s16, not a 5xx', async () => {
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

    expect(Object.keys(res.body as object).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
    ]);
  });

  it('Unknown subjectPersonId: 404 NotFoundException', async () => {
    currentViewerId = 'viewer-unknown-subject';

    await request(app.getHttpServer())
      .get('/people/00000000-0000-4000-8000-000000000000/profile')
      .expect(404);

    expect(resolveMock).not.toHaveBeenCalled();
  });
});
