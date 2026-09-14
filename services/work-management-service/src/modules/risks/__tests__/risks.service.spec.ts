import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  NO_ACCESS_RESOLUTION,
  type AccessRoleResolution,
  type AccessRoleResolutionPort,
} from '../../management-notes/access-control-client';
import type { CreateRiskRecordDto } from '../dto/create-risk-record.dto';
import type { RisksPermissionsCheckPort } from '../permissions-client';
import { RisksService } from '../risks.service';

const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const RECORD_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-09-12T15:00:00.000Z');

const VALID_DTO: CreateRiskRecordDto = {
  subjectPersonId: SUBJECT_ID,
  level: 'medium',
  description: 'Performance concern',
};

function resolution(
  overrides: Partial<AccessRoleResolution>,
): AccessRoleResolution {
  return { ...NO_ACCESS_RESOLUTION, ...overrides };
}

function buildService(
  permissionsCheck: RisksPermissionsCheckPort,
  resolve: AccessRoleResolutionPort['resolve'],
  prismaOverrides: Record<string, unknown> = {},
  resolveBatch?: NonNullable<AccessRoleResolutionPort['resolveBatch']>,
) {
  const prisma = {
    riskRecord: {
      create: jest.fn(),
      findMany: jest.fn(),
      ...prismaOverrides,
    },
  };
  const accessRoleResolution: AccessRoleResolutionPort = {
    resolve,
    resolveBatch,
  };
  const service = new RisksService(
    prisma as unknown as PrismaService,
    permissionsCheck,
    accessRoleResolution,
  );
  return { service, prisma };
}

function riskRow(
  overrides: Partial<{
    id: string;
    subjectPersonId: string;
    authorPersonId: string;
    level: 'low' | 'need_attention' | 'medium' | 'high' | 'leaver';
    description: string;
    details: string | null;
    recordedAt: Date;
    createdAt: Date;
  }> = {},
) {
  return {
    id: RECORD_ID,
    subjectPersonId: SUBJECT_ID,
    authorPersonId: VIEWER_ID,
    level: 'medium' as const,
    description: 'Performance concern',
    details: null,
    recordedAt: new Date('2026-09-10T00:00:00.000Z'),
    createdAt: NOW,
    ...overrides,
  };
}

describe('RisksService', () => {
  const grantedPermission: RisksPermissionsCheckPort = {
    hasCreateEditRisksPermission: jest.fn().mockResolvedValue(true),
  };
  const deniedPermission: RisksPermissionsCheckPort = {
    hasCreateEditRisksPermission: jest.fn().mockResolvedValue(false),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('appendRiskRecord', () => {
    it.each(['append', 'read'])(
      'denies mixed-case self IDs before ACS on %s',
      async (operation) => {
        const viewerId = 'abcdefab-1234-4123-8123-abcdefabcdef';
        const permissionCheck = jest.fn().mockResolvedValue(true);
        const resolve = jest
          .fn()
          .mockResolvedValue(resolution({ fullProfileAccessLine: true }));
        const { service, prisma } = buildService(
          { hasCreateEditRisksPermission: permissionCheck },
          resolve,
        );

        for (const [viewer, subject] of [
          [viewerId, viewerId.toUpperCase()],
          [viewerId.toUpperCase(), viewerId],
        ]) {
          await expect(
            operation === 'append'
              ? service.appendRiskRecord(
                  viewer,
                  { ...VALID_DTO, subjectPersonId: subject },
                  'token',
                )
              : service.getRiskHistory(viewer, subject, 'token'),
          ).rejects.toBeInstanceOf(ForbiddenException);
        }
        expect(permissionCheck).not.toHaveBeenCalled();
        expect(resolve).not.toHaveBeenCalled();
        expect(prisma.riskRecord.create).not.toHaveBeenCalled();
        expect(prisma.riskRecord.findMany).not.toHaveBeenCalled();
      },
    );

    it('uses canonical IDs for ACS, author, persistence and both history queries', async () => {
      const viewerId = 'abcdefab-1234-4123-8123-abcdefabcdef';
      const subjectId = 'abcdefab-5678-4567-8567-abcdefabcdef';
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ reportingLine: true }));
      const { service, prisma } = buildService(grantedPermission, resolve);
      const created = riskRow({
        subjectPersonId: subjectId,
        authorPersonId: viewerId,
      });
      prisma.riskRecord.create.mockResolvedValue(created);
      prisma.riskRecord.findMany.mockResolvedValue([created]);

      await service.appendRiskRecord(
        viewerId.toUpperCase(),
        {
          ...VALID_DTO,
          subjectPersonId: subjectId.toUpperCase(),
          recordedAt: '2024-02-29',
        },
        'token',
      );
      const history = await service.getRiskHistory(
        viewerId.toUpperCase(),
        subjectId.toUpperCase(),
        'token',
      );

      expect(resolve).toHaveBeenCalledTimes(2);
      expect(resolve).toHaveBeenNthCalledWith(1, viewerId, subjectId, 'token');
      expect(resolve).toHaveBeenNthCalledWith(2, viewerId, subjectId, 'token');
      const createCall = prisma.riskRecord.create.mock.calls[0] as [
        {
          data: {
            subjectPersonId: string;
            authorPersonId: string;
            recordedAt: Date;
          };
        },
      ];
      expect(createCall[0].data).toEqual(
        expect.objectContaining({
          subjectPersonId: subjectId,
          authorPersonId: viewerId,
          recordedAt: new Date('2024-02-29T00:00:00.000Z'),
        }) as unknown,
      );
      expect(prisma.riskRecord.findMany).toHaveBeenCalledTimes(2);
      expect(prisma.riskRecord.findMany).toHaveBeenCalledWith({
        where: { subjectPersonId: subjectId },
        orderBy: [{ recordedAt: 'asc' }, { createdAt: 'asc' }],
      });
      expect(history.records).toEqual([
        expect.objectContaining({ subjectPersonId: subjectId }),
      ]);
    });

    it('AC1: reportingLine append persists and returns created row', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ reportingLine: true }));
      const created = riskRow();
      const { service, prisma } = buildService(grantedPermission, resolve);
      prisma.riskRecord.create.mockResolvedValue(created);
      prisma.riskRecord.findMany.mockResolvedValue([created]);

      const result = await service.appendRiskRecord(
        VIEWER_ID,
        VALID_DTO,
        'token',
      );

      expect(result.level).toBe('medium');
      expect(result.authorPersonId).toBe(VIEWER_ID);
      expect(prisma.riskRecord.create).toHaveBeenCalledWith({
        data: {
          subjectPersonId: SUBJECT_ID,
          authorPersonId: VIEWER_ID,
          level: 'medium',
          description: VALID_DTO.description,
          details: null,
          recordedAt: new Date('2026-09-12T00:00:00.000Z'),
        },
      });
    });

    it('AC2: downgrade to low is allowed and summary isActive becomes false', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ reportingLine: true }));
      const lowRow = riskRow({ level: 'low' });
      const { service, prisma } = buildService(grantedPermission, resolve);
      prisma.riskRecord.create.mockResolvedValue(lowRow);
      prisma.riskRecord.findMany.mockResolvedValue([
        riskRow({
          id: 'older',
          level: 'high',
          recordedAt: new Date('2026-09-01'),
        }),
        lowRow,
      ]);

      const result = await service.appendRiskRecord(
        VIEWER_ID,
        { ...VALID_DTO, level: 'low' },
        'token',
      );

      expect(result.level).toBe('low');
      expect(
        service.buildSummary([
          riskRow({ level: 'high', recordedAt: new Date('2026-09-01') }),
          lowRow,
        ]).isActive,
      ).toBe(false);
    });

    it('AC3: leaver record is stored without side effects', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ reportingLine: true }));
      const leaverRow = riskRow({ level: 'leaver' });
      const { service, prisma } = buildService(grantedPermission, resolve);
      prisma.riskRecord.create.mockResolvedValue(leaverRow);
      prisma.riskRecord.findMany.mockResolvedValue([leaverRow]);

      const result = await service.appendRiskRecord(
        VIEWER_ID,
        { ...VALID_DTO, level: 'leaver' },
        'token',
      );

      expect(result.level).toBe('leaver');
      expect(prisma.riskRecord.create).toHaveBeenCalled();
    });

    it('PP line qualifies for append', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ peoplePartnerLine: true }));
      const created = riskRow();
      const { service, prisma } = buildService(grantedPermission, resolve);
      prisma.riskRecord.create.mockResolvedValue(created);
      prisma.riskRecord.findMany.mockResolvedValue([created]);

      await service.appendRiskRecord(VIEWER_ID, VALID_DTO, 'token');

      expect(prisma.riskRecord.create).toHaveBeenCalled();
    });

    it('projectLine only qualifies for append', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ projectLine: true }));
      const created = riskRow();
      const { service, prisma } = buildService(grantedPermission, resolve);
      prisma.riskRecord.create.mockResolvedValue(created);
      prisma.riskRecord.findMany.mockResolvedValue([created]);

      await service.appendRiskRecord(VIEWER_ID, VALID_DTO, 'token');

      expect(prisma.riskRecord.create).toHaveBeenCalled();
    });

    it('fullProfileAccessLine only qualifies for append', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ fullProfileAccessLine: true }));
      const created = riskRow();
      const { service, prisma } = buildService(grantedPermission, resolve);
      prisma.riskRecord.create.mockResolvedValue(created);
      prisma.riskRecord.findMany.mockResolvedValue([created]);

      await service.appendRiskRecord(VIEWER_ID, VALID_DTO, 'token');

      expect(prisma.riskRecord.create).toHaveBeenCalled();
    });

    it('self-subject POST returns 403 before permission or resolve', async () => {
      const permissionCheck = jest.fn().mockResolvedValue(true);
      const resolve = jest.fn();
      const { service, prisma } = buildService(
        { hasCreateEditRisksPermission: permissionCheck },
        resolve,
      );

      await expect(
        service.appendRiskRecord(
          VIEWER_ID,
          { ...VALID_DTO, subjectPersonId: VIEWER_ID },
          'token',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(permissionCheck).not.toHaveBeenCalled();
      expect(resolve).not.toHaveBeenCalled();
      expect(prisma.riskRecord.create).not.toHaveBeenCalled();
    });

    it('FPA self-subject returns 403 before resolve', async () => {
      const permissionCheck = jest.fn().mockResolvedValue(true);
      const resolve = jest.fn();
      const { service, prisma } = buildService(
        { hasCreateEditRisksPermission: permissionCheck },
        resolve,
      );

      await expect(
        service.appendRiskRecord(
          VIEWER_ID,
          { ...VALID_DTO, subjectPersonId: VIEWER_ID },
          'token',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(resolve).not.toHaveBeenCalled();
      expect(prisma.riskRecord.create).not.toHaveBeenCalled();
    });

    it('no qualifying line returns 403', async () => {
      const resolve = jest.fn().mockResolvedValue(NO_ACCESS_RESOLUTION);
      const { service, prisma } = buildService(grantedPermission, resolve);

      await expect(
        service.appendRiskRecord(VIEWER_ID, VALID_DTO, 'token'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.riskRecord.create).not.toHaveBeenCalled();
    });

    it('colleague with no line returns 403', async () => {
      const resolve = jest.fn().mockResolvedValue(NO_ACCESS_RESOLUTION);
      const { service, prisma } = buildService(grantedPermission, resolve);

      await expect(
        service.appendRiskRecord(VIEWER_ID, VALID_DTO, 'token'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.riskRecord.create).not.toHaveBeenCalled();
    });

    it('permission only without line returns 403', async () => {
      const resolve = jest.fn().mockResolvedValue(NO_ACCESS_RESOLUTION);
      const { service, prisma } = buildService(grantedPermission, resolve);

      await expect(
        service.appendRiskRecord(VIEWER_ID, VALID_DTO, 'token'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(resolve).toHaveBeenCalled();
      expect(prisma.riskRecord.create).not.toHaveBeenCalled();
    });

    it('permission denied returns 403 without resolve', async () => {
      const resolve = jest.fn();
      const { service, prisma } = buildService(deniedPermission, resolve);

      await expect(
        service.appendRiskRecord(VIEWER_ID, VALID_DTO, 'token'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(resolve).not.toHaveBeenCalled();
      expect(prisma.riskRecord.create).not.toHaveBeenCalled();
    });

    it('ACS fail-closed permission returns 403', async () => {
      const resolve = jest.fn();
      const { service, prisma } = buildService(deniedPermission, resolve);

      await expect(
        service.appendRiskRecord(VIEWER_ID, VALID_DTO, 'token'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.riskRecord.create).not.toHaveBeenCalled();
    });

    it('future recordedAt returns 400', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ reportingLine: true }));
      const { service, prisma } = buildService(grantedPermission, resolve);

      await expect(
        service.appendRiskRecord(
          VIEWER_ID,
          {
            ...VALID_DTO,
            recordedAt: '2026-09-13',
          },
          'token',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.riskRecord.create).not.toHaveBeenCalled();
    });

    it('authorPersonId is always the resolved viewer id', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ reportingLine: true }));
      const created = riskRow();
      const { service, prisma } = buildService(grantedPermission, resolve);
      prisma.riskRecord.create.mockResolvedValue(created);
      prisma.riskRecord.findMany.mockResolvedValue([created]);

      await service.appendRiskRecord(VIEWER_ID, VALID_DTO, 'token');

      const createCall = prisma.riskRecord.create.mock.calls[0] as [
        { data: { authorPersonId: string } },
      ];
      expect(createCall[0].data.authorPersonId).toBe(VIEWER_ID);
    });
  });

  describe('getRiskHistory', () => {
    it('AC1: returns full history with current level from newest recordedAt', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ reportingLine: true }));
      const older = riskRow({
        id: 'aaaa',
        level: 'low',
        recordedAt: new Date('2026-09-01T00:00:00.000Z'),
      });
      const newer = riskRow({
        id: 'bbbb',
        level: 'high',
        recordedAt: new Date('2026-09-10T00:00:00.000Z'),
      });
      const { service, prisma } = buildService(grantedPermission, resolve);
      prisma.riskRecord.findMany.mockResolvedValue([older, newer]);

      const result = await service.getRiskHistory(
        VIEWER_ID,
        SUBJECT_ID,
        'token',
      );

      expect(result.summary.currentLevel).toBe('high');
      expect(result.records).toHaveLength(2);
      expect(result.records[0].id).toBe('bbbb');
      expect(result.records[1].id).toBe('aaaa');
    });

    it('AC4: isActive true when current level is medium', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ reportingLine: true }));
      const row = riskRow({ level: 'medium' });
      const { service, prisma } = buildService(grantedPermission, resolve);
      prisma.riskRecord.findMany.mockResolvedValue([row]);

      const result = await service.getRiskHistory(
        VIEWER_ID,
        SUBJECT_ID,
        'token',
      );

      expect(result.summary.isActive).toBe(true);
    });

    it('AC4: isActive false when current level is low', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ reportingLine: true }));
      const row = riskRow({ level: 'low' });
      const { service, prisma } = buildService(grantedPermission, resolve);
      prisma.riskRecord.findMany.mockResolvedValue([row]);

      const result = await service.getRiskHistory(
        VIEWER_ID,
        SUBJECT_ID,
        'token',
      );

      expect(result.summary.isActive).toBe(false);
    });

    it('no records returns empty history and null summary fields', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ reportingLine: true }));
      const { service, prisma } = buildService(grantedPermission, resolve);
      prisma.riskRecord.findMany.mockResolvedValue([]);

      const result = await service.getRiskHistory(
        VIEWER_ID,
        SUBJECT_ID,
        'token',
      );

      expect(result.records).toEqual([]);
      expect(result.summary).toEqual({
        currentLevel: null,
        isActive: false,
        recordedAt: null,
      });
    });

    it('self-subject GET returns 403 before permission or resolve', async () => {
      const permissionCheck = jest.fn().mockResolvedValue(true);
      const resolve = jest.fn();
      const { service, prisma } = buildService(
        { hasCreateEditRisksPermission: permissionCheck },
        resolve,
      );

      await expect(
        service.getRiskHistory(VIEWER_ID, VIEWER_ID, 'token'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(permissionCheck).not.toHaveBeenCalled();
      expect(resolve).not.toHaveBeenCalled();
      expect(prisma.riskRecord.findMany).not.toHaveBeenCalled();
    });

    it('FPA-only line qualifies for GET', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ fullProfileAccessLine: true }));
      const { service, prisma } = buildService(grantedPermission, resolve);
      prisma.riskRecord.findMany.mockResolvedValue([]);

      await service.getRiskHistory(VIEWER_ID, SUBJECT_ID, 'token');

      expect(prisma.riskRecord.findMany).toHaveBeenCalled();
    });

    it('qualifying S6 relationship can read without create-edit-risks permission', async () => {
      const permissionCheck = jest.fn().mockResolvedValue(false);
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ peoplePartnerLine: true }));
      const { service, prisma } = buildService(
        { hasCreateEditRisksPermission: permissionCheck },
        resolve,
      );
      prisma.riskRecord.findMany.mockResolvedValue([riskRow()]);

      const result = await service.getRiskHistory(
        VIEWER_ID,
        SUBJECT_ID,
        'token',
      );

      expect(result.records).toHaveLength(1);
      expect(result.canAppend).toBe(false);
      expect(permissionCheck).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledWith(VIEWER_ID, SUBJECT_ID, 'token');
    });

    it('FPA self-subject GET returns 403', async () => {
      const permissionCheck = jest.fn().mockResolvedValue(true);
      const resolve = jest.fn();
      const { service } = buildService(
        { hasCreateEditRisksPermission: permissionCheck },
        resolve,
      );

      await expect(
        service.getRiskHistory(VIEWER_ID, VIEWER_ID, 'token'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('out-of-scope subject returns 403', async () => {
      const resolve = jest.fn().mockResolvedValue(NO_ACCESS_RESOLUTION);
      const { service, prisma } = buildService(grantedPermission, resolve);

      await expect(
        service.getRiskHistory(VIEWER_ID, SUBJECT_ID, 'token'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.riskRecord.findMany).not.toHaveBeenCalled();
    });
  });

  describe('computeTrendDirection', () => {
    const { service } = buildService(grantedPermission, jest.fn());

    it('AC5: first record trend is null', () => {
      expect(service.computeTrendDirection('medium', undefined)).toBeNull();
    });

    it('AC5: unchanged consecutive levels trend is null', () => {
      expect(service.computeTrendDirection('medium', 'medium')).toBeNull();
    });

    it('AC5: medium then high trend is up', () => {
      expect(service.computeTrendDirection('high', 'medium')).toBe('up');
    });

    it('AC5: high then low trend is down', () => {
      expect(service.computeTrendDirection('low', 'high')).toBe('down');
    });
  });

  describe('getDashboard', () => {
    it('fails closed without the scoped dashboard permission', async () => {
      const { service, prisma } = buildService(
        {
          hasCreateEditRisksPermission: jest.fn(),
          hasViewDashboardPermission: jest.fn().mockResolvedValue(false),
        },
        jest.fn(),
      );
      await expect(
        service.getDashboard(VIEWER_ID, { pageSize: 50 }, 'token'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.riskRecord.findMany).not.toHaveBeenCalled();
    });

    it('excludes self, keeps current low in counts, and returns an opaque continuation', async () => {
      const other = '44444444-4444-4444-8444-444444444444';
      const batch = jest.fn().mockResolvedValue(
        new Map([
          [SUBJECT_ID, resolution({ reportingLine: true })],
          [other, resolution({ fullProfileAccessLine: true })],
        ]),
      );
      const { service } = buildService(
        {
          hasCreateEditRisksPermission: jest.fn(),
          hasViewDashboardPermission: jest.fn().mockResolvedValue(true),
        },
        jest.fn(),
        {
          findMany: jest.fn().mockResolvedValue([
            riskRow({ subjectPersonId: VIEWER_ID, level: 'leaver' }),
            riskRow({
              subjectPersonId: SUBJECT_ID,
              level: 'low',
              createdAt: new Date('2026-09-11'),
            }),
            riskRow({
              id: 'other',
              subjectPersonId: other,
              level: 'high',
              createdAt: new Date('2026-09-10'),
            }),
          ]),
        },
        batch,
      );
      const first = await service.getDashboard(
        VIEWER_ID,
        { pageSize: 1 },
        'token',
      );
      expect(first.counts).toEqual(
        expect.objectContaining({ low: 1, high: 1, activeCount: 1 }),
      );
      expect(first.rows.map((row) => row.personId)).not.toContain(VIEWER_ID);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = await service.getDashboard(
        VIEWER_ID,
        { pageSize: 1, cursor: first.nextCursor ?? undefined },
        'token',
      );
      expect(second.rows[0].personId).not.toBe(first.rows[0].personId);
    });
  });

  describe('trend on history rows', () => {
    it('assigns trendDirection per chronological preceding record', async () => {
      const resolve = jest
        .fn()
        .mockResolvedValue(resolution({ reportingLine: true }));
      const first = riskRow({
        id: 'first',
        level: 'medium',
        recordedAt: new Date('2026-09-01T00:00:00.000Z'),
      });
      const second = riskRow({
        id: 'second',
        level: 'medium',
        recordedAt: new Date('2026-09-05T00:00:00.000Z'),
      });
      const third = riskRow({
        id: 'third',
        level: 'high',
        recordedAt: new Date('2026-09-10T00:00:00.000Z'),
      });
      const { service, prisma } = buildService(grantedPermission, resolve);
      prisma.riskRecord.findMany.mockResolvedValue([first, second, third]);

      const result = await service.getRiskHistory(
        VIEWER_ID,
        SUBJECT_ID,
        'token',
      );

      const byId = Object.fromEntries(
        result.records.map((row) => [row.id, row.trendDirection]),
      );
      expect(byId['first']).toBeNull();
      expect(byId['second']).toBeNull();
      expect(byId['third']).toBe('up');
    });
  });
});
