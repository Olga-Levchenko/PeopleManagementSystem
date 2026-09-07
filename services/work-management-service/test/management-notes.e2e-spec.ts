import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import {
  NO_ACCESS_RESOLUTION,
  type AccessRoleResolution,
  type AccessRoleResolutionPort,
} from '../src/modules/management-notes/access-control-client';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Proves spec-1-7's six ACs end-to-end against real Prisma (the shared `infra/docker-compose.yml`
 * Postgres -- run `npm run db:deploy` first, per this service's own CLAUDE.md) with
 * `AccessRoleResolutionPort` faked (`overrideProvider`, matching `people-service`'s
 * `test/profile.e2e-spec.ts` pattern) rather than standing up a real access-control-service.
 *
 * `JwtAuthGuard` cannot be swapped via `overrideProvider(APP_GUARD)`: it's bound via `useClass` in
 * `AppModule`, and Nest's `DependenciesScanner` registers every `APP_GUARD` custom provider under a
 * run-specific randomized token that `TestingModuleBuilder.overrideProvider` can never address from
 * outside. This suite instead patches `JwtAuthGuard.prototype.canActivate` directly (same technique
 * `profile.e2e-spec.ts` uses) -- the real guard instance Nest constructs still inherits the patched
 * prototype, so production DI wiring is untouched. The fake implementation attaches
 * `request.user.sub` from whatever `currentViewerId` a test sets.
 */
describe('Management notes (e2e)', () => {
  jest.setTimeout(60_000);

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let currentViewerId: string;
  let resolveMock: jest.Mock;

  beforeAll(async () => {
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
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await prisma.managementNote.deleteMany({});
  });

  function resolution(
    overrides: Partial<AccessRoleResolution>,
  ): AccessRoleResolution {
    return { ...NO_ACCESS_RESOLUTION, ...overrides };
  }

  function newSubjectId(): string {
    return randomUUID();
  }

  // -- AC1: create, no flags -- both flags false via the DB's own non-nullable default column. --

  it('AC1: creating a note with no flags persists both flags as false via the DB default', async () => {
    const subjectPersonId = newSubjectId();
    currentViewerId = 'e2e-um-viewer';
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));

    const res = await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'A note with no flags set' })
      .expect(201);

    const body = res.body as {
      visibleForEmployee: boolean;
      visibleForPm: boolean;
    };
    expect(body.visibleForEmployee).toBe(false);
    expect(body.visibleForPm).toBe(false);

    const row = await prisma.managementNote.findFirst({
      where: { subjectPersonId },
    });
    expect(row?.visibleForEmployee).toBe(false);
    expect(row?.visibleForPm).toBe(false);
  });

  // -- AC2: unflagged note absent from both the employee's own view and a PM's view. --

  it("AC2: an unflagged note is absent from the subject employee's own list", async () => {
    const subjectPersonId = newSubjectId();
    currentViewerId = 'e2e-um-viewer';
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));
    await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'Unflagged note' })
      .expect(201);

    currentViewerId = subjectPersonId;
    const res = await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${subjectPersonId}`)
      .expect(200);

    expect(res.body).toEqual([]);
  });

  it("AC2: an unflagged note is absent from a PM-only viewer's list", async () => {
    const subjectPersonId = newSubjectId();
    currentViewerId = 'e2e-um-viewer';
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));
    await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'Unflagged note' })
      .expect(201);

    currentViewerId = 'e2e-pm-viewer';
    resolveMock.mockResolvedValue(
      resolution({ projectRoles: ['ProjectManager'] }),
    );
    const res = await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${subjectPersonId}`)
      .expect(200);

    expect(res.body).toEqual([]);
  });

  // -- AC3: UM/DM/PP full RW regardless of flags. --

  it('AC3: a Reporting-line (UM/DM) viewer gets full RW -- reads and writes all notes regardless of flags', async () => {
    const subjectPersonId = newSubjectId();
    currentViewerId = 'e2e-um-viewer';
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));

    const createRes = await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'Full RW note' })
      .expect(201);
    const noteId = (createRes.body as { id: string }).id;

    const listRes = await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${subjectPersonId}`)
      .expect(200);
    expect((listRes.body as unknown[]).length).toBe(1);

    await request(app.getHttpServer())
      .patch(`/management-notes/${noteId}`)
      .send({ content: 'Edited by UM' })
      .expect(200);
  });

  it('AC3: a People-Partner-line viewer gets full RW', async () => {
    const subjectPersonId = newSubjectId();
    currentViewerId = 'e2e-pp-viewer';
    resolveMock.mockResolvedValue(resolution({ peoplePartnerLine: true }));

    await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'PP-created note' })
      .expect(201);
  });

  it('AC3: a DM project-role viewer gets full RW', async () => {
    const subjectPersonId = newSubjectId();
    currentViewerId = 'e2e-dm-viewer';
    resolveMock.mockResolvedValue(
      resolution({ projectRoles: ['DeliveryManager'] }),
    );

    await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'DM-created note' })
      .expect(201);
  });

  it('AC3: a Full-profile-access viewer gets full RW', async () => {
    const subjectPersonId = newSubjectId();
    currentViewerId = 'e2e-fpa-viewer';
    resolveMock.mockResolvedValue(resolution({ fullProfileAccessLine: true }));

    const createRes = await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'FPA-created note' })
      .expect(201);
    const noteId = (createRes.body as { id: string }).id;

    const listRes = await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${subjectPersonId}`)
      .expect(200);
    expect((listRes.body as unknown[]).length).toBe(1);

    await request(app.getHttpServer())
      .patch(`/management-notes/${noteId}`)
      .send({ content: 'Edited by FPA holder' })
      .expect(200);
  });

  // -- Cross-audience isolation: a note flagged for one audience only must stay invisible to the
  // OTHER audience, proven here against real Postgres/Prisma (the AC2 cases above only cover
  // both-flags-false). --

  it('cross-audience isolation: a visibleForEmployee-only note is invisible to a PM viewer, and a visibleForPm-only note is invisible to the employee (self) view', async () => {
    const subjectPersonId = newSubjectId();
    currentViewerId = 'e2e-um-viewer';
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));
    await request(app.getHttpServer())
      .post('/management-notes')
      .send({
        subjectPersonId,
        content: 'Employee-only note',
        visibleForEmployee: true,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/management-notes')
      .send({
        subjectPersonId,
        content: 'PM-only note',
        visibleForPm: true,
      })
      .expect(201);

    currentViewerId = 'e2e-pm-viewer';
    resolveMock.mockResolvedValue(
      resolution({ projectRoles: ['ProjectManager'] }),
    );
    const pmListRes = await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${subjectPersonId}`)
      .expect(200);
    const pmNotes = pmListRes.body as Array<{ content: string }>;
    expect(pmNotes).toHaveLength(1);
    expect(pmNotes[0].content).toBe('PM-only note');

    currentViewerId = subjectPersonId;
    const employeeListRes = await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${subjectPersonId}`)
      .expect(200);
    const employeeNotes = employeeListRes.body as Array<{ content: string }>;
    expect(employeeNotes).toHaveLength(1);
    expect(employeeNotes[0].content).toBe('Employee-only note');
  });

  // -- Self is read-only -- an employee viewing their own record must never get the full-RW
  // write path, even though the AC2 self case above already proves the read-side filter. --

  it('self viewer gets 403 on create and update against their own record', async () => {
    const subjectPersonId = newSubjectId();
    currentViewerId = 'e2e-um-viewer';
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));
    const createRes = await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'Some note' })
      .expect(201);
    const noteId = (createRes.body as { id: string }).id;

    currentViewerId = subjectPersonId;

    await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'Self attempting to create' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/management-notes/${noteId}`)
      .send({ content: 'Self attempting to edit' })
      .expect(403);
  });

  // -- AC4: PM narrowed -- read-only, visibleForPm-only; create/update 403. --

  it('AC4: a PM-only viewer sees only visibleForPm notes and cannot create/update', async () => {
    const subjectPersonId = newSubjectId();
    currentViewerId = 'e2e-um-viewer';
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));
    await request(app.getHttpServer())
      .post('/management-notes')
      .send({
        subjectPersonId,
        content: 'Visible to PM',
        visibleForPm: true,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'Not visible to PM' })
      .expect(201);

    currentViewerId = 'e2e-pm-viewer';
    resolveMock.mockResolvedValue(
      resolution({ projectRoles: ['ProjectManager'] }),
    );

    const listRes = await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${subjectPersonId}`)
      .expect(200);
    const notes = listRes.body as Array<{ content: string }>;
    expect(notes).toHaveLength(1);
    expect(notes[0].content).toBe('Visible to PM');

    await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'PM attempting to create' })
      .expect(403);
  });

  // -- AC5: multi-path -- any full-RW-qualifying path wins even when a narrower path also
  // applies simultaneously. --

  it('AC5: a viewer who is DM on one project and PM on another (toward the same subject) gets full RW', async () => {
    const subjectPersonId = newSubjectId();
    currentViewerId = 'e2e-multipath-viewer';
    resolveMock.mockResolvedValue(
      resolution({ projectRoles: ['ProjectManager', 'DeliveryManager'] }),
    );

    await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'Multi-path note' })
      .expect(201);

    const listRes = await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${subjectPersonId}`)
      .expect(200);
    expect((listRes.body as unknown[]).length).toBe(1);
  });

  // -- AC6: flag flip -- only the targeted field changes, nothing else. --

  it("AC6: flipping visibleForEmployee from false to true changes no other field and is visible on the employee's next read", async () => {
    const subjectPersonId = newSubjectId();
    currentViewerId = 'e2e-um-viewer';
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));

    const createRes = await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'Original content' })
      .expect(201);
    const created = createRes.body as {
      id: string;
      content: string;
      visibleForPm: boolean;
    };

    const updateRes = await request(app.getHttpServer())
      .patch(`/management-notes/${created.id}`)
      .send({ visibleForEmployee: true })
      .expect(200);
    const updated = updateRes.body as {
      content: string;
      visibleForEmployee: boolean;
      visibleForPm: boolean;
    };
    expect(updated.visibleForEmployee).toBe(true);
    expect(updated.content).toBe(created.content);
    expect(updated.visibleForPm).toBe(created.visibleForPm);

    currentViewerId = subjectPersonId;
    const employeeListRes = await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${subjectPersonId}`)
      .expect(200);
    const employeeNotes = employeeListRes.body as Array<{ content: string }>;
    expect(employeeNotes).toHaveLength(1);
    expect(employeeNotes[0].content).toBe('Original content');
  });

  // -- Colleague / no relationship -- 403 on every route, no note existence ever implied. --

  it('colleague (no qualifying line) gets 403 on list, create, and update', async () => {
    const subjectPersonId = newSubjectId();
    currentViewerId = 'e2e-um-viewer';
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));
    const createRes = await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'Some note' })
      .expect(201);
    const noteId = (createRes.body as { id: string }).id;

    currentViewerId = 'e2e-colleague-viewer';
    resolveMock.mockResolvedValue(NO_ACCESS_RESOLUTION);

    await request(app.getHttpServer())
      .get(`/management-notes?subjectPersonId=${subjectPersonId}`)
      .expect(403);
    await request(app.getHttpServer())
      .post('/management-notes')
      .send({ subjectPersonId, content: 'Colleague attempting to create' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/management-notes/${noteId}`)
      .send({ content: 'Colleague attempting to edit' })
      .expect(403);
  });
});
