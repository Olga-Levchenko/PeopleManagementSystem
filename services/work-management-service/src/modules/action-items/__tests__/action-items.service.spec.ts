import { ForbiddenException } from '@nestjs/common';
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

const ACTION_ITEM_ROW = {
  id: '33333333-3333-4333-8333-333333333333',
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
) {
  const prisma = {
    actionItem: {
      create: jest.fn(),
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
});
