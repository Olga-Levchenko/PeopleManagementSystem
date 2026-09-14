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
import type { RisksPermissionsCheckPort } from '../src/modules/risks/permissions-client';
import type { IdentityResolutionPort } from '../src/modules/identity/identity-resolution.port';
import { PrismaService } from '../src/prisma/prisma.service';
import { installJwtAuthGuardBypass } from './support/e2e-auth.helpers';
import { resetRiskE2eState } from './support/e2e-db.helpers';

describe('Risks (e2e)', () => {
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

  function authedGet(path: string) {
    return request(app.getHttpServer())
      .get(path)
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
    const fakePermissionsCheck: RisksPermissionsCheckPort = {
      hasCreateEditRisksPermission: permissionMock,
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
      .overrideProvider('RisksPermissionsCheckPort')
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
    await resetRiskE2eState(prisma);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    permissionMock.mockResolvedValue(true);
    await resetRiskE2eState(prisma);
  });

  function resolution(
    overrides: Partial<AccessRoleResolution>,
  ): AccessRoleResolution {
    return { ...NO_ACCESS_RESOLUTION, ...overrides };
  }

  it('happy path: append and read history with summary and trend', async () => {
    const viewerPersonId = randomUUID();
    const subjectId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));

    await authedPost('/risks')
      .send({
        subjectPersonId: subjectId,
        level: 'medium',
        description: 'Initial concern',
        recordedAt: '2026-09-01',
      })
      .expect(201);

    const second = await authedPost('/risks')
      .send({
        subjectPersonId: subjectId,
        level: 'high',
        description: 'Escalated',
        recordedAt: '2026-09-10',
      })
      .expect(201);

    expect(
      (second.body as { trendDirection: string | null }).trendDirection,
    ).toBe('up');

    const history = await authedGet(
      `/risks?subjectPersonId=${subjectId}`,
    ).expect(200);
    const body = history.body as {
      summary: {
        currentLevel: string;
        isActive: boolean;
        recordedAt: string;
      };
      records: Array<{ level: string; trendDirection: string | null }>;
    };
    expect(body.summary.currentLevel).toBe('high');
    expect(body.summary.isActive).toBe(true);
    expect(body.records).toHaveLength(2);
    expect(body.records[0].level).toBe('high');
    expect(body.records[0].trendDirection).toBe('up');
    expect(body.records[1].trendDirection).toBeNull();
  });

  it('returns 403 on self-subject POST', async () => {
    const viewerPersonId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;

    await authedPost('/risks')
      .send({
        subjectPersonId: viewerPersonId,
        level: 'medium',
        description: 'Self risk',
      })
      .expect(403);

    expect(permissionMock).not.toHaveBeenCalled();
    expect(resolveMock).not.toHaveBeenCalled();
    expect(await prisma.riskRecord.count()).toBe(0);
  });

  it('returns 403 on self-subject GET', async () => {
    const viewerPersonId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;

    await authedGet(`/risks?subjectPersonId=${viewerPersonId}`).expect(403);

    expect(permissionMock).not.toHaveBeenCalled();
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it('FPA-only line can append and read', async () => {
    const viewerPersonId = randomUUID();
    const subjectId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;
    resolveMock.mockResolvedValue(resolution({ fullProfileAccessLine: true }));

    await authedPost('/risks')
      .send({
        subjectPersonId: subjectId,
        level: 'need_attention',
        description: 'FPA holder note',
      })
      .expect(201);

    const history = await authedGet(
      `/risks?subjectPersonId=${subjectId}`,
    ).expect(200);
    expect((history.body as { records: unknown[] }).records).toHaveLength(1);
  });

  it('FPA self-subject returns 403 even with FPA line', async () => {
    const viewerPersonId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;
    resolveMock.mockResolvedValue(resolution({ fullProfileAccessLine: true }));

    await authedPost('/risks')
      .send({
        subjectPersonId: viewerPersonId,
        level: 'medium',
        description: 'Should fail',
      })
      .expect(403);

    await authedGet(`/risks?subjectPersonId=${viewerPersonId}`).expect(403);
  });

  it.each(['uppercase subject', 'uppercase viewer'])(
    'denies FPA self-access with %s',
    async (variant) => {
      const personId = 'abcdefab-1234-4234-8234-abcdefabcdef';
      currentViewerSub = randomUUID();
      currentViewerPersonId =
        variant === 'uppercase viewer' ? personId.toUpperCase() : personId;
      const subjectId =
        variant === 'uppercase subject' ? personId.toUpperCase() : personId;
      resolveMock.mockResolvedValue(
        resolution({ fullProfileAccessLine: true }),
      );

      await authedPost('/risks')
        .send({
          subjectPersonId: subjectId,
          level: 'medium',
          description: 'Self risk',
        })
        .expect(403);
      await authedGet(`/risks?subjectPersonId=${subjectId}`).expect(403);
      expect(permissionMock).not.toHaveBeenCalled();
      expect(resolveMock).not.toHaveBeenCalled();
      expect(await prisma.riskRecord.count()).toBe(0);
    },
  );

  it('keeps one history and trend across subject UUID spellings', async () => {
    const subjectId = 'abcdefab-1234-4234-8234-abcdefabcdef';
    currentViewerSub = randomUUID();
    currentViewerPersonId = randomUUID();
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));

    await authedPost('/risks')
      .send({
        subjectPersonId: subjectId.toUpperCase(),
        level: 'medium',
        description: 'Initial concern',
        recordedAt: '2024-02-28',
      })
      .expect(201);
    const created = await authedPost('/risks')
      .send({
        subjectPersonId: subjectId,
        level: 'high',
        description: 'Escalation',
        recordedAt: '2024-02-29',
      })
      .expect(201);
    expect((created.body as { trendDirection: string }).trendDirection).toBe(
      'up',
    );

    const lower = await authedGet(`/risks?subjectPersonId=${subjectId}`).expect(
      200,
    );
    const upper = await authedGet(
      `/risks?subjectPersonId=${subjectId.toUpperCase()}`,
    ).expect(200);
    expect(upper.body).toEqual(lower.body);
    expect((lower.body as { records: unknown[] }).records).toHaveLength(2);
    expect(
      await prisma.riskRecord.count({ where: { subjectPersonId: subjectId } }),
    ).toBe(2);
  });

  it('returns 403 for out-of-scope subject', async () => {
    const viewerPersonId = randomUUID();
    const subjectId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;
    resolveMock.mockResolvedValue(NO_ACCESS_RESOLUTION);

    await authedPost('/risks')
      .send({
        subjectPersonId: subjectId,
        level: 'medium',
        description: 'Out of scope',
      })
      .expect(403);

    await authedGet(`/risks?subjectPersonId=${subjectId}`).expect(403);
  });

  it('returns empty history with null summary when no records exist', async () => {
    const viewerPersonId = randomUUID();
    const subjectId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));

    const res = await authedGet(`/risks?subjectPersonId=${subjectId}`).expect(
      200,
    );
    expect(res.body).toEqual({
      canAppend: true,
      summary: {
        currentLevel: null,
        isActive: false,
        recordedAt: null,
      },
      records: [],
    });
  });

  it('returns 400 for future recordedAt', async () => {
    const viewerPersonId = randomUUID();
    const subjectId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));

    await authedPost('/risks')
      .send({
        subjectPersonId: subjectId,
        level: 'medium',
        description: 'Future dated',
        recordedAt: '2099-01-01',
      })
      .expect(400);

    expect(await prisma.riskRecord.count()).toBe(0);
  });

  it.each([
    '2026-02-30',
    '2025-02-29',
    '2026-04-31',
    0,
    1709164800000,
    '2024-02-29T00:00:00.000Z',
    null,
  ])(
    'rejects invalid calendar-date input %p without persisting',
    async (recordedAt) => {
      currentViewerSub = randomUUID();
      currentViewerPersonId = randomUUID();
      resolveMock.mockResolvedValue(resolution({ reportingLine: true }));
      await authedPost('/risks')
        .send({
          subjectPersonId: randomUUID(),
          level: 'medium',
          description: 'Invalid date',
          recordedAt,
        })
        .expect(400);
      expect(await prisma.riskRecord.count()).toBe(0);
    },
  );

  it('accepts a valid leap day without shifting the date', async () => {
    currentViewerSub = randomUUID();
    currentViewerPersonId = randomUUID();
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));
    const created = await authedPost('/risks')
      .send({
        subjectPersonId: randomUUID(),
        level: 'medium',
        description: 'Leap day',
        recordedAt: '2024-02-29',
      })
      .expect(201);
    expect((created.body as { recordedAt: string }).recordedAt).toBe(
      '2024-02-29T00:00:00.000Z',
    );
  });

  it('downgrade to low sets isActive false on summary', async () => {
    const viewerPersonId = randomUUID();
    const subjectId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));

    await authedPost('/risks')
      .send({
        subjectPersonId: subjectId,
        level: 'medium',
        description: 'Was active',
        recordedAt: '2026-09-01',
      })
      .expect(201);

    await authedPost('/risks')
      .send({
        subjectPersonId: subjectId,
        level: 'low',
        description: 'Downgraded',
        recordedAt: '2026-09-11',
      })
      .expect(201);

    const history = await authedGet(
      `/risks?subjectPersonId=${subjectId}`,
    ).expect(200);
    const summary = (
      history.body as { summary: { isActive: boolean; currentLevel: string } }
    ).summary;
    expect(summary.currentLevel).toBe('low');
    expect(summary.isActive).toBe(false);
  });

  it('unchanged consecutive levels have null trendDirection', async () => {
    const viewerPersonId = randomUUID();
    const subjectId = randomUUID();
    currentViewerSub = randomUUID();
    currentViewerPersonId = viewerPersonId;
    resolveMock.mockResolvedValue(resolution({ reportingLine: true }));

    await authedPost('/risks')
      .send({
        subjectPersonId: subjectId,
        level: 'medium',
        description: 'First',
        recordedAt: '2026-09-01',
      })
      .expect(201);

    const second = await authedPost('/risks')
      .send({
        subjectPersonId: subjectId,
        level: 'medium',
        description: 'Still medium',
        recordedAt: '2026-09-05',
      })
      .expect(201);

    expect(
      (second.body as { trendDirection: string | null }).trendDirection,
    ).toBeNull();
  });

  it('returns 400 when required body fields are missing', async () => {
    currentViewerSub = randomUUID();
    currentViewerPersonId = randomUUID();

    await authedPost('/risks')
      .send({ subjectPersonId: randomUUID() })
      .expect(400);
  });
});
