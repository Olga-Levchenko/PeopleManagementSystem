import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { RelationshipChangedEvent } from '@pms/contracts';
import { OutboxPublisherService } from '../outbox-publisher.service';
import type { OutboxBroker } from '../outbox-broker.port';

const EVENT: RelationshipChangedEvent = {
  eventId: '11111111-1111-4111-8111-111111111111',
  schemaVersion: 1,
  occurredAtUtc: '2026-08-31T12:00:00.000Z',
  source: {
    service: 'people-service',
    aggregateType: 'person',
    aggregateId: '22222222-2222-4222-8222-222222222222',
    aggregateVersion: 4,
  },
  relationship: {
    type: 'reports_to',
    subjectId: '22222222-2222-4222-8222-222222222222',
    beforeId: null,
    afterId: '33333333-3333-4333-8333-333333333333',
  },
  accessEffect: 'grant',
};

type JestMock = jest.MockedFunction<(...args: never[]) => unknown>;

const getMock = (target: object, property: string): JestMock =>
  (target as Record<string, unknown>)[property] as JestMock;

const objectContaining = <T extends object>(value: T): T => {
  const matcher: unknown = expect.objectContaining(value);
  return matcher as T;
};

const anyDate = (): unknown => expect.any(Date);

describe('OutboxPublisherService', () => {
  const broker: OutboxBroker = {
    publish: jest.fn().mockResolvedValue(undefined),
  };
  const queryRaw = jest.fn().mockResolvedValue([]);
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ $queryRaw: queryRaw }),
    ),
    outboxEvent: { updateMany },
  } as unknown as PrismaService;
  const config = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, number> = {
        OUTBOX_PUBLISHER_RETRY_LIMIT: 5,
        OUTBOX_STALE_LOCK_MINUTES: 10,
        OUTBOX_PUBLISHER_INTERVAL_MS: 1000,
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    queryRaw.mockResolvedValue([]);
    updateMany.mockResolvedValue({ count: 1 });
  });

  it.each([
    ['reports_to', 'relationship.reports_to'],
    ['pp_assignment', 'relationship.pp_assignment'],
    ['department_membership', 'relationship.department_membership'],
    ['department_manager', 'relationship.department_manager'],
  ] as const)(
    'publishes %s with its stable event ID and routing key',
    async (type, routingKey) => {
      const event = { ...EVENT, relationship: { ...EVENT.relationship, type } };
      queryRaw.mockResolvedValue([
        {
          eventId: event.eventId,
          aggregateType: 'PERSON',
          payload: event,
          retryCount: 0,
        },
      ]);
      const service = new OutboxPublisherService(prisma, config, broker);

      await service.publishPending();

      expect(getMock(broker, 'publish')).toHaveBeenCalledWith(
        event,
        routingKey,
      );
      expect(updateMany).toHaveBeenCalledWith(
        objectContaining({
          where: objectContaining({
            eventId: event.eventId,
            status: 'PROCESSING',
          }),
          data: objectContaining({
            status: 'PUBLISHED',
            lockedAtUtc: null,
            lockedBy: null,
          }),
        }),
      );
    },
  );

  it('records a retry with an error and backoff after broker failure', async () => {
    queryRaw.mockResolvedValue([
      {
        eventId: EVENT.eventId,
        aggregateType: 'PERSON',
        payload: EVENT,
        retryCount: 0,
      },
    ]);
    (broker.publish as jest.Mock).mockRejectedValueOnce(
      new Error('broker unavailable'),
    );
    const service = new OutboxPublisherService(prisma, config, broker);

    await service.publishPending();

    expect(updateMany).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          status: 'PENDING',
          retryCount: 1,
          lastError: 'broker unavailable',
          nextAttemptAt: anyDate(),
          lockedAtUtc: null,
          lockedBy: null,
        }),
      }),
    );
  });

  it('moves the fifth failed attempt directly to FAILED without another retry time', async () => {
    queryRaw.mockResolvedValue([
      {
        eventId: EVENT.eventId,
        aggregateType: 'PERSON',
        payload: EVENT,
        retryCount: 4,
      },
    ]);
    (broker.publish as jest.Mock).mockRejectedValueOnce(
      new Error('terminal broker failure'),
    );
    const service = new OutboxPublisherService(prisma, config, broker);

    await service.publishPending();

    expect(updateMany).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          status: 'FAILED',
          retryCount: 5,
          lastError: 'terminal broker failure',
          nextAttemptAt: null,
        }),
      }),
    );
  });

  it('leaves a confirmed message PROCESSING when marking it published fails', async () => {
    queryRaw.mockResolvedValue([
      {
        eventId: EVENT.eventId,
        aggregateType: 'PERSON',
        payload: EVENT,
        retryCount: 0,
      },
    ]);
    updateMany.mockRejectedValueOnce(new Error('database unavailable'));
    const service = new OutboxPublisherService(prisma, config, broker);

    await expect(service.publishPending()).resolves.toBeUndefined();
    expect(getMock(broker, 'publish')).toHaveBeenCalledWith(
      EVENT,
      'relationship.reports_to',
    );
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('handles a scheduled publication rejection without exposing the error details', async () => {
    let scheduledPublish: (() => void) | undefined;
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockImplementation((callback) => {
        scheduledPublish = callback;
        return {} as NodeJS.Timeout;
      });
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation();
    const service = new OutboxPublisherService(prisma, config, broker);
    const publishPending = jest
      .spyOn(service, 'publishPending')
      .mockRejectedValueOnce(new Error('sensitive broker details'));

    service.onModuleInit();
    await Promise.resolve();

    expect(publishPending).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith(
      'Scheduled outbox publication failed',
    );
    expect(scheduledPublish).toBeDefined();

    loggerError.mockClear();
    setIntervalSpy.mockRestore();
    loggerError.mockRestore();
  });

  it('keeps the scheduler available for the next run after a rejection', async () => {
    let scheduledPublish: (() => void) | undefined;
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockImplementation((callback) => {
        scheduledPublish = callback;
        return {} as NodeJS.Timeout;
      });
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const service = new OutboxPublisherService(prisma, config, broker);
    const publishPending = jest
      .spyOn(service, 'publishPending')
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);

    service.onModuleInit();
    await Promise.resolve();
    scheduledPublish?.();
    await Promise.resolve();

    expect(publishPending).toHaveBeenCalledTimes(2);
    setIntervalSpy.mockRestore();
    jest.restoreAllMocks();
  });
});
