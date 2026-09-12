import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  NO_ACCESS_RESOLUTION,
  type AccessRoleResolution,
  type AccessRoleResolutionPort,
} from '../../management-notes/access-control-client';
import { ActionItemsService } from '../action-items.service';
import type { PermissionsCheckPort } from '../permissions-client';

const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const ASSIGNEE_ID = '22222222-2222-4222-8222-222222222222';
const DUE_DATE = new Date('2026-10-01T00:00:00.000Z');
const NOW = new Date('2026-09-12T00:00:00.000Z');

const ITEM_ID = '33333333-3333-4333-8333-333333333333';

const ACTION_ITEM_ROW = {
  id: ITEM_ID,
  title: 'Follow up on onboarding',
  description: null,
  assigneePersonId: ASSIGNEE_ID,
  authorPersonId: VIEWER_ID,
  dueDate: DUE_DATE,
  linkUrl: null,
  status: 'open',
  source: 'manual',
  completionDate: null,
  cancelReason: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const VALID_DTO = {
  title: 'Follow up on onboarding',
  assigneePersonId: ASSIGNEE_ID,
  dueDate: DUE_DATE,
};

function resolution(
  overrides: Partial<AccessRoleResolution>,
): AccessRoleResolution {
  return { ...NO_ACCESS_RESOLUTION, ...overrides };
}

function buildService(
  permissionsCheck: PermissionsCheckPort,
  resolve: AccessRoleResolutionPort['resolve'],
  prismaOverrides: Record<string, unknown> = {},
) {
  const prisma = {
    actionItem: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      ...prismaOverrides,
    },
  };
  const accessRoleResolution: AccessRoleResolutionPort = { resolve };
  const service = new ActionItemsService(
    prisma as unknown as PrismaService,
    permissionsCheck,
    accessRoleResolution,
  );
  return { service, prisma };
}

describe('ActionItemsService', () => {
  const grantedPermission: PermissionsCheckPort = {
    hasCreateActionItemsPermission: jest.fn().mockResolvedValue(true),
  };
  const deniedPermission: PermissionsCheckPort = {
    hasCreateActionItemsPermission: jest.fn().mockResolvedValue(false),
  };

  it('AC1: reportingLine toward assignee creates an open manual action item', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ reportingLine: true }));
    const { service, prisma } = buildService(grantedPermission, resolve);
    prisma.actionItem.create.mockResolvedValue(ACTION_ITEM_ROW);

    const result = await service.createActionItem(
      VIEWER_ID,
      VALID_DTO,
      'token',
    );

    expect(result.status).toBe('open');
    expect(result.source).toBe('manual');
    expect(prisma.actionItem.create).toHaveBeenCalledWith({
      data: {
        title: VALID_DTO.title,
        description: null,
        assigneePersonId: ASSIGNEE_ID,
        authorPersonId: VIEWER_ID,
        dueDate: DUE_DATE,
        linkUrl: null,
        status: 'open',
        source: 'manual',
        completionDate: null,
        cancelReason: null,
      },
    });
  });

  it('AC1: peoplePartnerLine toward assignee creates an action item', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ peoplePartnerLine: true }));
    const { service, prisma } = buildService(grantedPermission, resolve);
    prisma.actionItem.create.mockResolvedValue(ACTION_ITEM_ROW);

    await service.createActionItem(VIEWER_ID, VALID_DTO, 'token');

    expect(prisma.actionItem.create).toHaveBeenCalled();
  });

  it('AC1: projectLine toward assignee creates an action item', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ projectLine: true }));
    const { service, prisma } = buildService(grantedPermission, resolve);
    prisma.actionItem.create.mockResolvedValue(ACTION_ITEM_ROW);

    await service.createActionItem(VIEWER_ID, VALID_DTO, 'token');

    expect(prisma.actionItem.create).toHaveBeenCalled();
  });

  it('AC2: no qualifying line toward assignee returns 403', async () => {
    const resolve = jest.fn().mockResolvedValue(NO_ACCESS_RESOLUTION);
    const { service, prisma } = buildService(grantedPermission, resolve);

    await expect(
      service.createActionItem(VIEWER_ID, VALID_DTO, 'token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.actionItem.create).not.toHaveBeenCalled();
  });

  it('AC3: permission granted but no qualifying line toward another assignee returns 403', async () => {
    const resolve = jest.fn().mockResolvedValue(NO_ACCESS_RESOLUTION);
    const { service, prisma } = buildService(grantedPermission, resolve);

    await expect(
      service.createActionItem(VIEWER_ID, VALID_DTO, 'token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.actionItem.create).not.toHaveBeenCalled();
  });

  it('self-assign: permission granted skips relationship resolve and creates', async () => {
    const resolve = jest.fn();
    const { service, prisma } = buildService(grantedPermission, resolve);
    prisma.actionItem.create.mockResolvedValue({
      ...ACTION_ITEM_ROW,
      assigneePersonId: VIEWER_ID,
    });

    await service.createActionItem(
      VIEWER_ID,
      { ...VALID_DTO, assigneePersonId: VIEWER_ID },
      'token',
    );

    expect(resolve).not.toHaveBeenCalled();
    expect(prisma.actionItem.create).toHaveBeenCalled();
  });

  it('self-assign denied: permission not granted returns 403 without resolve', async () => {
    const resolve = jest.fn();
    const { service, prisma } = buildService(deniedPermission, resolve);

    await expect(
      service.createActionItem(
        VIEWER_ID,
        { ...VALID_DTO, assigneePersonId: VIEWER_ID },
        'token',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(resolve).not.toHaveBeenCalled();
    expect(prisma.actionItem.create).not.toHaveBeenCalled();
  });

  it('permission denied: qualifying line but permission false returns 403', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ reportingLine: true }));
    const { service, prisma } = buildService(deniedPermission, resolve);

    await expect(
      service.createActionItem(VIEWER_ID, VALID_DTO, 'token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(resolve).not.toHaveBeenCalled();
    expect(prisma.actionItem.create).not.toHaveBeenCalled();
  });

  it('fullProfileAccessLine alone does not qualify toward another assignee', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ fullProfileAccessLine: true }));
    const { service, prisma } = buildService(grantedPermission, resolve);

    await expect(
      service.createActionItem(VIEWER_ID, VALID_DTO, 'token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.actionItem.create).not.toHaveBeenCalled();
  });

  it('authorPersonId is always the resolved viewer id, never from the DTO', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ reportingLine: true }));
    const { service, prisma } = buildService(grantedPermission, resolve);
    prisma.actionItem.create.mockResolvedValue(ACTION_ITEM_ROW);

    await service.createActionItem(VIEWER_ID, VALID_DTO, 'token');

    const createCall = prisma.actionItem.create.mock.calls[0] as [
      { data: { authorPersonId: string } },
    ];
    expect(createCall[0].data.authorPersonId).toBe(VIEWER_ID);
  });

  describe('computeIsOverdue', () => {
    const { service } = buildService(grantedPermission, jest.fn());

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-12T15:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns true for open items due before today (UTC date)', () => {
      expect(
        service.computeIsOverdue({
          status: 'open',
          dueDate: new Date('2026-09-11T23:59:59.000Z'),
        }),
      ).toBe(true);
    });

    it('returns false for open items due today regardless of time', () => {
      expect(
        service.computeIsOverdue({
          status: 'open',
          dueDate: new Date('2026-09-12T18:30:00.000Z'),
        }),
      ).toBe(false);
    });

    it('returns false for completed items past due', () => {
      expect(
        service.computeIsOverdue({
          status: 'completed',
          dueDate: new Date('2020-01-01T00:00:00.000Z'),
        }),
      ).toBe(false);
    });

    it('returns false for cancelled items past due', () => {
      expect(
        service.computeIsOverdue({
          status: 'cancelled',
          dueDate: new Date('2020-01-01T00:00:00.000Z'),
        }),
      ).toBe(false);
    });
  });

  describe('completeActionItem', () => {
    it('AC1: assignee completes open item and records completionDate', async () => {
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      const completedRow = {
        ...ACTION_ITEM_ROW,
        status: 'completed',
        completionDate: new Date('2026-09-12T12:00:00.000Z'),
      };
      prisma.actionItem.findUnique.mockResolvedValue(ACTION_ITEM_ROW);
      prisma.actionItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.actionItem.findUniqueOrThrow.mockResolvedValue(completedRow);

      const result = await service.completeActionItem(ASSIGNEE_ID, ITEM_ID);

      expect(result.status).toBe('completed');
      expect(result.completionDate).toEqual(completedRow.completionDate);
      expect(result.isOverdue).toBe(false);
      expect(prisma.actionItem.updateMany).toHaveBeenCalled();
      const updateCall = prisma.actionItem.updateMany.mock.calls[0] as [
        {
          where: { id: string; status: string };
          data: { status: string; completionDate: Date };
        },
      ];
      expect(updateCall[0].where).toEqual({ id: ITEM_ID, status: 'open' });
      expect(updateCall[0].data.status).toBe('completed');
      expect(updateCall[0].data.completionDate).toBeInstanceOf(Date);
    });

    it('returns 404 when item is missing', async () => {
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      prisma.actionItem.findUnique.mockResolvedValue(null);

      await expect(
        service.completeActionItem(ASSIGNEE_ID, ITEM_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 403 when viewer is not the assignee', async () => {
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      prisma.actionItem.findUnique.mockResolvedValue(ACTION_ITEM_ROW);

      await expect(
        service.completeActionItem(VIEWER_ID, ITEM_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.actionItem.updateMany).not.toHaveBeenCalled();
    });

    it('returns 409 when item is not open', async () => {
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      prisma.actionItem.findUnique.mockResolvedValue({
        ...ACTION_ITEM_ROW,
        status: 'completed',
      });
      prisma.actionItem.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.completeActionItem(ASSIGNEE_ID, ITEM_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 409 when item is cancelled', async () => {
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      prisma.actionItem.findUnique.mockResolvedValue({
        ...ACTION_ITEM_ROW,
        status: 'cancelled',
      });
      prisma.actionItem.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.completeActionItem(ASSIGNEE_ID, ITEM_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 409 on concurrent complete when updateMany affects zero rows', async () => {
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      prisma.actionItem.findUnique.mockResolvedValue(ACTION_ITEM_ROW);
      prisma.actionItem.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.completeActionItem(ASSIGNEE_ID, ITEM_ID),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not call ACS on complete', async () => {
      const resolve = jest.fn();
      const permissionCheck = jest.fn().mockResolvedValue(true);
      const { service, prisma } = buildService(
        { hasCreateActionItemsPermission: permissionCheck },
        resolve,
      );
      prisma.actionItem.findUnique.mockResolvedValue(ACTION_ITEM_ROW);
      prisma.actionItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.actionItem.findUniqueOrThrow.mockResolvedValue({
        ...ACTION_ITEM_ROW,
        status: 'completed',
        completionDate: new Date(),
      });

      await service.completeActionItem(ASSIGNEE_ID, ITEM_ID);

      expect(resolve).not.toHaveBeenCalled();
      expect(permissionCheck).not.toHaveBeenCalled();
    });

    it('self-assign: viewer who is assignee and author can complete', async () => {
      const selfRow = {
        ...ACTION_ITEM_ROW,
        assigneePersonId: VIEWER_ID,
        authorPersonId: VIEWER_ID,
      };
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      prisma.actionItem.findUnique.mockResolvedValue(selfRow);
      prisma.actionItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.actionItem.findUniqueOrThrow.mockResolvedValue({
        ...selfRow,
        status: 'completed',
        completionDate: new Date(),
      });

      const result = await service.completeActionItem(VIEWER_ID, ITEM_ID);
      expect(result.status).toBe('completed');
    });
  });

  describe('cancelActionItem', () => {
    it('AC2: author cancels open item with reason', async () => {
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      const cancelledRow = {
        ...ACTION_ITEM_ROW,
        status: 'cancelled',
        cancelReason: 'No longer needed',
      };
      prisma.actionItem.findUnique.mockResolvedValue(ACTION_ITEM_ROW);
      prisma.actionItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.actionItem.findUniqueOrThrow.mockResolvedValue(cancelledRow);

      const result = await service.cancelActionItem(VIEWER_ID, ITEM_ID, {
        cancelReason: 'No longer needed',
      });

      expect(result.status).toBe('cancelled');
      expect(result.cancelReason).toBe('No longer needed');
      expect(result.completionDate).toBeNull();
      expect(prisma.actionItem.updateMany).toHaveBeenCalledWith({
        where: { id: ITEM_ID, status: 'open' },
        data: {
          status: 'cancelled',
          cancelReason: 'No longer needed',
          completionDate: null,
        },
      });
    });

    it('returns 404 when item is missing', async () => {
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      prisma.actionItem.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelActionItem(VIEWER_ID, ITEM_ID, {
          cancelReason: 'reason',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 403 when viewer is not the author', async () => {
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      prisma.actionItem.findUnique.mockResolvedValue(ACTION_ITEM_ROW);

      await expect(
        service.cancelActionItem(ASSIGNEE_ID, ITEM_ID, {
          cancelReason: 'reason',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.actionItem.updateMany).not.toHaveBeenCalled();
    });

    it('returns 409 when item is not open', async () => {
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      prisma.actionItem.findUnique.mockResolvedValue({
        ...ACTION_ITEM_ROW,
        status: 'cancelled',
      });
      prisma.actionItem.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.cancelActionItem(VIEWER_ID, ITEM_ID, {
          cancelReason: 'reason',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns 409 when item is completed', async () => {
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      prisma.actionItem.findUnique.mockResolvedValue({
        ...ACTION_ITEM_ROW,
        status: 'completed',
      });
      prisma.actionItem.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.cancelActionItem(VIEWER_ID, ITEM_ID, {
          cancelReason: 'reason',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not call ACS on cancel', async () => {
      const resolve = jest.fn();
      const permissionCheck = jest.fn().mockResolvedValue(true);
      const { service, prisma } = buildService(
        { hasCreateActionItemsPermission: permissionCheck },
        resolve,
      );
      prisma.actionItem.findUnique.mockResolvedValue(ACTION_ITEM_ROW);
      prisma.actionItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.actionItem.findUniqueOrThrow.mockResolvedValue({
        ...ACTION_ITEM_ROW,
        status: 'cancelled',
        cancelReason: 'reason',
      });

      await service.cancelActionItem(VIEWER_ID, ITEM_ID, {
        cancelReason: 'reason',
      });

      expect(resolve).not.toHaveBeenCalled();
      expect(permissionCheck).not.toHaveBeenCalled();
    });

    it('self-assign: viewer who is assignee and author can cancel', async () => {
      const selfRow = {
        ...ACTION_ITEM_ROW,
        assigneePersonId: VIEWER_ID,
        authorPersonId: VIEWER_ID,
      };
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      prisma.actionItem.findUnique.mockResolvedValue(selfRow);
      prisma.actionItem.updateMany.mockResolvedValue({ count: 1 });
      prisma.actionItem.findUniqueOrThrow.mockResolvedValue({
        ...selfRow,
        status: 'cancelled',
        cancelReason: 'Done elsewhere',
      });

      const result = await service.cancelActionItem(VIEWER_ID, ITEM_ID, {
        cancelReason: 'Done elsewhere',
      });
      expect(result.status).toBe('cancelled');
    });
  });

  describe('listMyActionItems', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(NOW);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('returns only rows assigned to the viewer, ordered by dueDate asc', async () => {
      const earlierDue = new Date('2026-09-01T00:00:00.000Z');
      const laterDue = new Date('2026-10-01T00:00:00.000Z');
      const ownEarlier = {
        ...ACTION_ITEM_ROW,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        assigneePersonId: VIEWER_ID,
        dueDate: earlierDue,
      };
      const ownLater = {
        ...ACTION_ITEM_ROW,
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        assigneePersonId: VIEWER_ID,
        dueDate: laterDue,
        status: 'completed',
        completionDate: NOW,
      };
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      prisma.actionItem.findMany.mockResolvedValue([ownEarlier, ownLater]);

      const result = await service.listMyActionItems(VIEWER_ID);

      expect(prisma.actionItem.findMany).toHaveBeenCalledWith({
        where: { assigneePersonId: VIEWER_ID },
        orderBy: { dueDate: 'asc' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(ownEarlier.id);
      expect(result[1].id).toBe(ownLater.id);
      expect(result[0].isOverdue).toBe(true);
      expect(result[1].isOverdue).toBe(false);
    });

    it('returns empty array when viewer has no assigned items', async () => {
      const { service, prisma } = buildService(grantedPermission, jest.fn());
      prisma.actionItem.findMany.mockResolvedValue([]);

      const result = await service.listMyActionItems(VIEWER_ID);

      expect(result).toEqual([]);
    });

    it('does not call ACS on list', async () => {
      const resolve = jest.fn();
      const permissionCheck = jest.fn().mockResolvedValue(true);
      const { service, prisma } = buildService(
        { hasCreateActionItemsPermission: permissionCheck },
        resolve,
      );
      prisma.actionItem.findMany.mockResolvedValue([]);

      await service.listMyActionItems(VIEWER_ID);

      expect(resolve).not.toHaveBeenCalled();
      expect(permissionCheck).not.toHaveBeenCalled();
    });
  });
});
