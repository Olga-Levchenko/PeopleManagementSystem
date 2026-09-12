import { BadRequestException } from '@nestjs/common';
import type { CampaignActivatedEvent } from '@pms/contracts';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CampaignActivationProcessor } from '../campaign-activation.processor';

const BASE_EVENT: CampaignActivatedEvent = {
  eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  schemaVersion: 1,
  occurredAtUtc: '2026-09-12T10:00:00.000Z',
  source: {
    service: 'work-management-service',
    aggregateType: 'campaign',
    aggregateId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    aggregateVersion: 1,
  },
  campaignId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  title: 'Quarterly security training',
  linkUrl: 'https://forms.example.test/security-q3',
  dueDate: '2026-10-01T00:00:00.000Z',
  authorPersonId: 'cccccccc-0000-0000-0000-000000000006',
  recipientPersonIds: [
    'cccccccc-0000-0000-0000-00000000000b',
    'cccccccc-0000-0000-0000-00000000000c',
  ],
};

type ProcessorPrismaMock = {
  processedCampaignActivationEvent: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  actionItem: { createMany: jest.Mock };
  $transaction: jest.Mock;
};

function buildProcessor(prismaOverrides: Partial<ProcessorPrismaMock> = {}): {
  processor: CampaignActivationProcessor;
  prisma: ProcessorPrismaMock;
} {
  const prisma: ProcessorPrismaMock = {
    processedCampaignActivationEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      ...prismaOverrides.processedCampaignActivationEvent,
    },
    actionItem: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      ...prismaOverrides.actionItem,
    },
    $transaction:
      prismaOverrides.$transaction ??
      jest.fn(async (callback: (tx: ProcessorPrismaMock) => Promise<number>) =>
        callback(prisma),
      ),
  };

  const processor = new CampaignActivationProcessor(
    prisma as unknown as PrismaService,
  );

  return { processor, prisma };
}

describe('CampaignActivationProcessor', () => {
  it('creates one action item per unique recipient', async () => {
    const { processor, prisma } = buildProcessor();
    prisma.actionItem.createMany.mockResolvedValue({ count: 2 });

    const result = await processor.process(BASE_EVENT);

    expect(result).toEqual({
      eventId: BASE_EVENT.eventId,
      createdCount: 2,
      skippedAsDuplicateEvent: false,
    });
    expect(prisma.actionItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          assigneePersonId: 'cccccccc-0000-0000-0000-00000000000b',
          campaignId: BASE_EVENT.campaignId,
          source: 'campaign',
          status: 'open',
          title: BASE_EVENT.title,
          dueDate: new Date(BASE_EVENT.dueDate),
          linkUrl: BASE_EVENT.linkUrl,
          authorPersonId: BASE_EVENT.authorPersonId,
        }),
        expect.objectContaining({
          assigneePersonId: 'cccccccc-0000-0000-0000-00000000000c',
          campaignId: BASE_EVENT.campaignId,
          source: 'campaign',
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('deduplicates recipientPersonIds within a single event', async () => {
    const { processor, prisma } = buildProcessor();
    prisma.actionItem.createMany.mockResolvedValue({ count: 1 });

    await processor.process({
      ...BASE_EVENT,
      recipientPersonIds: [
        'cccccccc-0000-0000-0000-00000000000b',
        'cccccccc-0000-0000-0000-00000000000b',
      ],
    });

    expect(prisma.actionItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            assigneePersonId: 'cccccccc-0000-0000-0000-00000000000b',
          }),
        ],
      }),
    );
  });

  it('records idempotency and creates zero rows for an empty recipient list', async () => {
    const { processor, prisma } = buildProcessor();

    const result = await processor.process({
      ...BASE_EVENT,
      recipientPersonIds: [],
    });

    expect(result.createdCount).toBe(0);
    expect(prisma.processedCampaignActivationEvent.create).toHaveBeenCalledWith(
      {
        data: { eventId: BASE_EVENT.eventId },
      },
    );
    expect(prisma.actionItem.createMany).not.toHaveBeenCalled();
  });

  it('no-ops when the same eventId was already processed', async () => {
    const { processor, prisma } = buildProcessor();
    prisma.processedCampaignActivationEvent.findUnique.mockResolvedValue({
      eventId: BASE_EVENT.eventId,
      processedAt: new Date(),
    });

    const result = await processor.process(BASE_EVENT);

    expect(result).toEqual({
      eventId: BASE_EVENT.eventId,
      createdCount: 0,
      skippedAsDuplicateEvent: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('only processes recipients present in the frozen event list', async () => {
    const { processor, prisma } = buildProcessor();
    prisma.actionItem.createMany.mockResolvedValue({ count: 1 });

    await processor.process({
      ...BASE_EVENT,
      recipientPersonIds: ['cccccccc-0000-0000-0000-00000000000b'],
    });

    expect(prisma.actionItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            assigneePersonId: 'cccccccc-0000-0000-0000-00000000000b',
          }),
        ],
      }),
    );
  });

  it('rejects malformed events without writing idempotency records', async () => {
    const { processor, prisma } = buildProcessor();

    await expect(
      processor.process({
        ...BASE_EVENT,
        campaignId: 'not-a-uuid',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      prisma.processedCampaignActivationEvent.findUnique,
    ).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects malformed recipientPersonIds without writing idempotency records', async () => {
    const { processor, prisma } = buildProcessor();

    await expect(
      processor.process({
        ...BASE_EVENT,
        recipientPersonIds: ['not-a-uuid'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      prisma.processedCampaignActivationEvent.findUnique,
    ).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects aggregateId mismatch', async () => {
    const { processor, prisma } = buildProcessor();

    await expect(
      processor.process({
        ...BASE_EVENT,
        source: {
          ...BASE_EVENT.source,
          aggregateId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects wrong aggregateType', async () => {
    const { processor, prisma } = buildProcessor();

    await expect(
      processor.process({
        ...BASE_EVENT,
        source: {
          ...BASE_EVENT.source,
          aggregateType: 'person' as 'campaign',
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects wrong schemaVersion', async () => {
    const { processor } = buildProcessor();

    await expect(
      processor.process({
        ...BASE_EVENT,
        schemaVersion: 2 as 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects whitespace-only title', async () => {
    const { processor } = buildProcessor();

    await expect(
      processor.process({
        ...BASE_EVENT,
        title: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects whitespace-only linkUrl', async () => {
    const { processor, prisma } = buildProcessor();

    await expect(
      processor.process({
        ...BASE_EVENT,
        linkUrl: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips assignees already created for the same campaign on re-activation', async () => {
    const { processor, prisma } = buildProcessor();
    prisma.actionItem.createMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await processor.process({
      ...BASE_EVENT,
      eventId: '11111111-1111-4111-8111-111111111111',
      recipientPersonIds: ['cccccccc-0000-0000-0000-00000000000b'],
      title: 'First activation',
      linkUrl: 'https://forms.example.test/first',
    });

    prisma.processedCampaignActivationEvent.findUnique.mockResolvedValue(null);

    const secondResult = await processor.process({
      ...BASE_EVENT,
      eventId: '22222222-2222-4222-8222-222222222222',
      recipientPersonIds: ['cccccccc-0000-0000-0000-00000000000b'],
      title: 'Second activation',
      linkUrl: 'https://forms.example.test/second',
    });

    expect(secondResult.createdCount).toBe(0);
    expect(prisma.actionItem.createMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            title: 'Second activation',
            linkUrl: 'https://forms.example.test/second',
          }),
        ],
        skipDuplicates: true,
      }),
    );
  });

  it('propagates transaction failures without treating assignee duplicates as eventId no-ops', async () => {
    const { processor, prisma } = buildProcessor();
    const assigneeDuplicateError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.9.1',
        meta: { target: ['campaignId', 'assigneePersonId'] },
      },
    );
    prisma.$transaction.mockRejectedValue(assigneeDuplicateError);

    await expect(processor.process(BASE_EVENT)).rejects.toBe(
      assigneeDuplicateError,
    );
  });

  it('rolls back when createMany fails inside the transaction', async () => {
    const { processor, prisma } = buildProcessor();
    prisma.$transaction.mockImplementation(
      async (callback: (tx: ProcessorPrismaMock) => Promise<number>) => {
        const tx: ProcessorPrismaMock = {
          processedCampaignActivationEvent: {
            findUnique: jest.fn(),
            create: jest.fn().mockResolvedValue(undefined),
          },
          actionItem: {
            createMany: jest
              .fn()
              .mockRejectedValue(new Error('createMany failed')),
          },
          $transaction: jest.fn(),
        };
        return callback(tx);
      },
    );

    await expect(processor.process(BASE_EVENT)).rejects.toThrow(
      'createMany failed',
    );
    expect(
      prisma.processedCampaignActivationEvent.create,
    ).not.toHaveBeenCalled();
  });

  it('treats concurrent duplicate eventId as a no-op', async () => {
    const { processor, prisma } = buildProcessor();
    const duplicateError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      {
        code: 'P2002',
        clientVersion: '7.9.1',
        meta: { target: ['eventId'] },
      },
    );
    prisma.$transaction.mockRejectedValue(duplicateError);

    const result = await processor.process(BASE_EVENT);

    expect(result.skippedAsDuplicateEvent).toBe(true);
    expect(result.createdCount).toBe(0);
  });
});
