import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  NO_ACCESS_RESOLUTION,
  type AccessRoleResolution,
  type AccessRoleResolutionPort,
} from '../src/modules/management-notes/access-control-client';
import type { PermissionsCheckPort } from '../src/modules/action-items/permissions-client';
import type { IdentityResolutionPort } from '../src/modules/identity/identity-resolution.port';
import { PrismaService } from '../src/prisma/prisma.service';
import { installJwtAuthGuardBypass } from './support/e2e-auth.helpers';
import { ACTION_ITEM_DESCRIPTION_MAX_LENGTH } from '../src/modules/action-items/dto/create-action-item.dto';
import { resetActionItemE2eState } from './support/e2e-db.helpers';

function utcTodayWithTime(hours: number, minutes: number): Date {
  const value = new Date();
  value.setUTCHours(hours, minutes, 0, 0);
  return value;
}

describe('Action items (e2e)', () => {
  jest.setTimeout(60_000);

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let currentViewerSub = '';
  let currentViewerPersonId = '';
  let resolveMock: jest.Mock;
  let permissionMock: jest.Mock;
  let identityResolveMock: jest.Mock;

  const E2E_AUTH = 'Bearer e2e-test-token';

  function authedPost(path: string) {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', E2E_AUTH);
  }

  function authedPatch(path: string) {
    return request(app.getHttpServer())
      .patch(path)
      .set('Authorization', E2E_AUTH);
  }

  async function seedOpenItem(overrides: {
    assigneePersonId: string;
    authorPersonId: string;
    dueDate?: Date;
    status?: 'open' | 'completed' | 'cancelled';
    source?: 'manual' | 'campaign';
    completionDate?: Date | null;
    cancelReason?: string | null;
  }) {
    return prisma.actionItem.create({
      data: {
        title: 'E2E action item',
        assigneePersonId: overrides.assigneePersonId,
        authorPersonId: overrides.authorPersonId,
        dueDate: overrides.dueDate ?? new Date('2026-10-15T00:00:00.000Z'),
        status: overrides.status ?? 'open',
        source: overrides.source ?? 'manual',
        completionDate: overrides.completionDate ?? null,
        cancelReason: overrides.cancelReason ?? null,
      },
    });
  }

  beforeAll(async () => {
    resolveMock = jest.fn();
    permissionMock = jest.fn().mockResolvedValue(true);
    identityResolveMock = jest
      .fn()
      .mockImplementation((_iss: string, sub: string) => {
        if (sub === currentViewerSub) {
          return Promise.resolve({
            outcome: 'resolved' as const,
            personId: currentViewerPersonId,
          });
        }
        return Promise.resolve({ outcome: 'missing' as const });
      });

    const fakeAccessRoleResolution: AccessRoleResolutionPort = {
      resolve: resolveMock,
    };
    const fakePermissionsCheck: PermissionsCheckPort = {
      hasCreateActionItemsPermission: permissionMock,
    };
    const fakeIdentityResolution: IdentityResolutionPort = {
      resolve: identityResolveMock,
    };

    installJwtAuthGuardBypass(() => currentViewerSub);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('AccessRoleResolutionPort')
      .useValue(fakeAccessRoleResolution)
      .overrideProvider('PermissionsCheckPort')
      .useValue(fakePermissionsCheck)
      .overrideProvider('IdentityResolutionPort')
      .useValue(fakeIdentityResolution)
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

  beforeEach(async () => {
    await resetActionItemE2eState(prisma);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    permissionMock.mockResolvedValue(true);
    await resetActionItemE2eState(prisma);
  });

  function resolution(
    overrides: Partial<AccessRoleResolution>,
  ): AccessRoleResolution {
    return { ...NO_ACCESS_RESOLUTION, ...overrides };
  }

  it('creates an action item when permission and reportingLine qualify', async () => {
    const viewerPersonId = randomUUID();
    const viewerSub = randomUUID();
    const assigneeId = randomUUID();
    currentViewerSub = viewerSub;
    currentViewerPersonId = viewerPersonId;
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));

    const res = await authedPost('/action-items')
      .send({
        title: 'Schedule 1:1',
        assigneePersonId: assigneeId,
        dueDate: '2026-10-15T00:00:00.000Z',
      })
      .expect(201);

    const body = res.body as {
      id: string;
      title: string;
      assigneePersonId: string;
      authorPersonId: string;
      status: string;
      source: string;
    };
    expect(body.title).toBe('Schedule 1:1');
    expect(body.assigneePersonId).toBe(assigneeId);
    expect(body.authorPersonId).toBe(viewerPersonId);
    expect(body.status).toBe('open');
    expect(body.source).toBe('manual');
    expect(resolveMock).toHaveBeenCalledWith(
      viewerPersonId,
      assigneeId,
      'e2e-test-token',
    );

    const row = await prisma.actionItem.findUnique({
      where: { id: body.id },
    });
    expect(row?.authorPersonId).toBe(viewerPersonId);
    expect(row?.source).toBe('manual');
  });

  it('self-assign succeeds with permission only (no relationship resolve)', async () => {
    const viewerPersonId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;

    const res = await authedPost('/action-items')
      .send({
        title: 'Personal follow-up',
        assigneePersonId: viewerPersonId,
        dueDate: '2026-10-20T00:00:00.000Z',
      })
      .expect(201);

    expect(resolveMock).not.toHaveBeenCalled();
    expect((res.body as { assigneePersonId: string }).assigneePersonId).toBe(
      viewerPersonId,
    );
  });

  it('returns 403 when assignee is out of scope', async () => {
    const viewerPersonId = randomUUID();
    const assigneeId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;
    resolveMock.mockResolvedValue(NO_ACCESS_RESOLUTION);

    await authedPost('/action-items')
      .send({
        title: 'Should not create',
        assigneePersonId: assigneeId,
        dueDate: '2026-10-15T00:00:00.000Z',
      })
      .expect(403);

    const count = await prisma.actionItem.count();
    expect(count).toBe(0);
  });

  it('returns 403 when permission is granted but no qualifying line toward another assignee', async () => {
    const viewerPersonId = randomUUID();
    const assigneeId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;
    permissionMock.mockResolvedValue(true);
    resolveMock.mockResolvedValue(NO_ACCESS_RESOLUTION);

    await authedPost('/action-items')
      .send({
        title: 'Permission without relationship',
        assigneePersonId: assigneeId,
        dueDate: '2026-10-15T00:00:00.000Z',
      })
      .expect(403);
  });

  it('accepts seeded platform Person.id shape for assigneePersonId', async () => {
    const viewerPersonId = 'cccccccc-0000-0000-0000-000000000006';
    const assigneeId = 'cccccccc-0000-0000-0000-00000000000b';
    currentViewerSub = 'c772d28a-1442-41a9-ac6f-af4cc14af5ae';
    currentViewerPersonId = viewerPersonId;
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));

    const res = await authedPost('/action-items')
      .send({
        title: 'Seeded person id shape',
        assigneePersonId: assigneeId,
        dueDate: '2026-10-15T00:00:00.000Z',
      })
      .expect(201);

    expect((res.body as { assigneePersonId: string }).assigneePersonId).toBe(
      assigneeId,
    );
  });

  it('returns 400 when required body fields are missing', async () => {
    currentViewerSub = randomUUID();
    currentViewerPersonId = randomUUID();

    await authedPost('/action-items')
      .send({ title: 'Missing assignee and due date' })
      .expect(400);
  });

  it('returns isOverdue=true on create when due date is before today (UTC)', async () => {
    const viewerPersonId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));

    const res = await authedPost('/action-items')
      .send({
        title: 'Past due item',
        assigneePersonId: randomUUID(),
        dueDate: '2020-01-01T00:00:00.000Z',
      })
      .expect(201);

    expect((res.body as { isOverdue: boolean }).isOverdue).toBe(true);
  });

  it('returns isOverdue=false on create when due date is today UTC (non-midnight time)', async () => {
    const viewerPersonId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));

    const res = await authedPost('/action-items')
      .send({
        title: 'Due today',
        assigneePersonId: randomUUID(),
        dueDate: utcTodayWithTime(18, 30).toISOString(),
      })
      .expect(201);

    const body = res.body as { isOverdue: boolean; status: string };
    expect(body.status).toBe('open');
    expect(body.isOverdue).toBe(false);
  });

  it('concurrent complete: exactly one succeeds and one returns 409', async () => {
    const assigneeId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = assigneeId;
    const item = await seedOpenItem({
      assigneePersonId: assigneeId,
      authorPersonId: randomUUID(),
    });

    const [first, second] = await Promise.all([
      authedPatch(`/action-items/${item.id}/complete`).send({}),
      authedPatch(`/action-items/${item.id}/complete`).send({}),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const row = await prisma.actionItem.findUnique({ where: { id: item.id } });
    expect(row?.status).toBe('completed');
    expect(row?.completionDate).toBeTruthy();
  });

  it('persists trimmed cancelReason on cancel', async () => {
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = authorId;
    const item = await seedOpenItem({
      assigneePersonId: randomUUID(),
      authorPersonId: authorId,
    });

    const res = await authedPatch(`/action-items/${item.id}/cancel`)
      .send({ cancelReason: '  trimmed reason  ' })
      .expect(200);

    expect((res.body as { cancelReason: string }).cancelReason).toBe(
      'trimmed reason',
    );
    const row = await prisma.actionItem.findUnique({ where: { id: item.id } });
    expect(row?.cancelReason).toBe('trimmed reason');
  });

  it('assignee completes an open action item', async () => {
    const assigneeId = randomUUID();
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = assigneeId;
    const item = await seedOpenItem({
      assigneePersonId: assigneeId,
      authorPersonId: authorId,
    });

    const res = await authedPatch(`/action-items/${item.id}/complete`)
      .send({})
      .expect(200);

    const body = res.body as {
      status: string;
      completionDate: string;
      isOverdue: boolean;
    };
    expect(body.status).toBe('completed');
    expect(body.completionDate).toBeTruthy();
    expect(body.isOverdue).toBe(false);

    const row = await prisma.actionItem.findUnique({ where: { id: item.id } });
    expect(row?.status).toBe('completed');
    expect(row?.completionDate).toBeTruthy();
  });

  it('author cancels an open action item with reason', async () => {
    const assigneeId = randomUUID();
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = authorId;
    const item = await seedOpenItem({
      assigneePersonId: assigneeId,
      authorPersonId: authorId,
    });

    const res = await authedPatch(`/action-items/${item.id}/cancel`)
      .send({ cancelReason: 'Superseded by campaign' })
      .expect(200);

    const body = res.body as {
      status: string;
      cancelReason: string;
      completionDate: string | null;
    };
    expect(body.status).toBe('cancelled');
    expect(body.cancelReason).toBe('Superseded by campaign');
    expect(body.completionDate).toBeNull();

    const row = await prisma.actionItem.findUnique({ where: { id: item.id } });
    expect(row?.status).toBe('cancelled');
    expect(row?.cancelReason).toBe('Superseded by campaign');
    expect(row?.completionDate).toBeNull();
  });

  it('returns 403 when non-assignee attempts complete', async () => {
    const assigneeId = randomUUID();
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = authorId;
    const item = await seedOpenItem({
      assigneePersonId: assigneeId,
      authorPersonId: authorId,
    });

    await authedPatch(`/action-items/${item.id}/complete`).send({}).expect(403);
  });

  it('returns 403 when non-author attempts cancel', async () => {
    const assigneeId = randomUUID();
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = assigneeId;
    const item = await seedOpenItem({
      assigneePersonId: assigneeId,
      authorPersonId: authorId,
    });

    await authedPatch(`/action-items/${item.id}/cancel`)
      .send({ cancelReason: 'Should fail' })
      .expect(403);
  });

  it('returns 404 when completing a missing action item', async () => {
    currentViewerSub = randomUUID();
    currentViewerPersonId = randomUUID();

    await authedPatch(`/action-items/${randomUUID()}/complete`)
      .send({})
      .expect(404);
  });

  it('returns 404 when cancelling a missing action item', async () => {
    currentViewerSub = randomUUID();
    currentViewerPersonId = randomUUID();

    await authedPatch(`/action-items/${randomUUID()}/cancel`)
      .send({ cancelReason: 'missing' })
      .expect(404);
  });

  it('returns 409 when completing an already completed item', async () => {
    const assigneeId = randomUUID();
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = assigneeId;
    const item = await seedOpenItem({
      assigneePersonId: assigneeId,
      authorPersonId: authorId,
      status: 'completed',
      completionDate: new Date(),
    });

    await authedPatch(`/action-items/${item.id}/complete`).send({}).expect(409);
  });

  it('returns 409 when completing a cancelled item', async () => {
    const assigneeId = randomUUID();
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = assigneeId;
    const item = await seedOpenItem({
      assigneePersonId: assigneeId,
      authorPersonId: authorId,
      status: 'cancelled',
      cancelReason: 'already cancelled',
    });

    await authedPatch(`/action-items/${item.id}/complete`).send({}).expect(409);
  });

  it('returns 409 when cancelling an already cancelled item', async () => {
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = authorId;
    const item = await seedOpenItem({
      assigneePersonId: randomUUID(),
      authorPersonId: authorId,
      status: 'cancelled',
      cancelReason: 'already cancelled',
    });

    await authedPatch(`/action-items/${item.id}/cancel`)
      .send({ cancelReason: 'again' })
      .expect(409);
  });

  it('returns 409 when cancelling an already completed item', async () => {
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = authorId;
    const item = await seedOpenItem({
      assigneePersonId: randomUUID(),
      authorPersonId: authorId,
      status: 'completed',
      completionDate: new Date(),
    });

    await authedPatch(`/action-items/${item.id}/cancel`)
      .send({ cancelReason: 'too late' })
      .expect(409);
  });

  it('returns 400 when cancel body omits cancelReason', async () => {
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = authorId;
    const item = await seedOpenItem({
      assigneePersonId: randomUUID(),
      authorPersonId: authorId,
    });

    await authedPatch(`/action-items/${item.id}/cancel`).send({}).expect(400);
  });

  it('returns 400 when cancelReason is whitespace only', async () => {
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = authorId;
    const item = await seedOpenItem({
      assigneePersonId: randomUUID(),
      authorPersonId: authorId,
    });

    await authedPatch(`/action-items/${item.id}/cancel`)
      .send({ cancelReason: '   ' })
      .expect(400);
  });

  it('returns 400 when cancelReason exceeds max length', async () => {
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = authorId;
    const item = await seedOpenItem({
      assigneePersonId: randomUUID(),
      authorPersonId: authorId,
    });

    await authedPatch(`/action-items/${item.id}/cancel`)
      .send({
        cancelReason: 'x'.repeat(ACTION_ITEM_DESCRIPTION_MAX_LENGTH + 1),
      })
      .expect(400);
  });

  it('returns 400 when cancel body includes extra fields', async () => {
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = authorId;
    const item = await seedOpenItem({
      assigneePersonId: randomUUID(),
      authorPersonId: authorId,
    });

    await authedPatch(`/action-items/${item.id}/cancel`)
      .send({ cancelReason: 'valid', status: 'completed' })
      .expect(400);
  });

  it('returns 400 when complete body includes extra fields', async () => {
    const assigneeId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = assigneeId;
    const item = await seedOpenItem({
      assigneePersonId: assigneeId,
      authorPersonId: randomUUID(),
    });

    await authedPatch(`/action-items/${item.id}/complete`)
      .send({ note: 'not allowed' })
      .expect(400);
  });

  it('self-assign complete and cancel both succeed while open', async () => {
    const personId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = personId;
    const item = await seedOpenItem({
      assigneePersonId: personId,
      authorPersonId: personId,
    });

    await authedPatch(`/action-items/${item.id}/complete`).send({}).expect(200);

    const item2 = await seedOpenItem({
      assigneePersonId: personId,
      authorPersonId: personId,
    });
    await authedPatch(`/action-items/${item2.id}/cancel`)
      .send({ cancelReason: 'Changed mind' })
      .expect(200);
  });

  it('campaign source item follows the same lifecycle rules', async () => {
    const assigneeId = randomUUID();
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = assigneeId;
    const item = await seedOpenItem({
      assigneePersonId: assigneeId,
      authorPersonId: authorId,
      source: 'campaign',
    });

    const res = await authedPatch(`/action-items/${item.id}/complete`)
      .send({})
      .expect(200);
    expect((res.body as { status: string }).status).toBe('completed');
  });

  it('campaign source item can be cancelled by the author', async () => {
    const assigneeId = randomUUID();
    const authorId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = authorId;
    const item = await seedOpenItem({
      assigneePersonId: assigneeId,
      authorPersonId: authorId,
      source: 'campaign',
    });

    const res = await authedPatch(`/action-items/${item.id}/cancel`)
      .send({ cancelReason: 'Campaign withdrawn' })
      .expect(200);

    expect((res.body as { status: string }).status).toBe('cancelled');
    const row = await prisma.actionItem.findUnique({ where: { id: item.id } });
    expect(row?.source).toBe('campaign');
    expect(row?.cancelReason).toBe('Campaign withdrawn');
  });
});
