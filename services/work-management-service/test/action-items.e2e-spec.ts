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
import { resetActionItemE2eState } from './support/e2e-db.helpers';

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
});
