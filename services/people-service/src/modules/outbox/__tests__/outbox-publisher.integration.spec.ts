import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ConfigService } from '@nestjs/config';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OutboxPublisherService } from '../outbox-publisher.service';
import type { OutboxBroker } from '../outbox-broker.port';
import type { RelationshipChangedEvent } from '@pms/contracts';

const execFileAsync = promisify(execFile);
const PRISMA_CLI_ENTRY_POINT = require.resolve('prisma/build/index.js');

const RETRY_LIMIT = 5;
const STALE_LOCK_MINUTES = 10;
const PUBLISHER_INTERVAL_MS = 1000;
const CLAIM_BATCH_SIZE = 50;

const createEvent = (aggregateVersion: number): RelationshipChangedEvent => {
  const subjectId = randomUUID();
  return {
    eventId: randomUUID(),
    schemaVersion: 1,
    occurredAtUtc: new Date().toISOString(),
    source: {
      service: 'people-service',
      aggregateType: 'person',
      aggregateId: subjectId,
      aggregateVersion,
    },
    relationship: {
      type: 'reports_to',
      subjectId,
      beforeId: null,
      afterId: randomUUID(),
    },
    accessEffect: 'grant',
  };
};

const toJson = (event: RelationshipChangedEvent): Prisma.InputJsonObject => ({
  eventId: event.eventId,
  schemaVersion: event.schemaVersion,
  occurredAtUtc: event.occurredAtUtc,
  source: {
    service: event.source.service,
    aggregateType: event.source.aggregateType,
    aggregateId: event.source.aggregateId,
    aggregateVersion: event.source.aggregateVersion,
  },
  relationship: {
    type: event.relationship.type,
    subjectId: event.relationship.subjectId,
    beforeId: event.relationship.beforeId,
    afterId: event.relationship.afterId,
  },
  accessEffect: event.accessEffect,
});

type JestMock = jest.MockedFunction<(...args: never[]) => unknown>;

const getMock = (target: object, property: string): JestMock =>
  (target as Record<string, unknown>)[property] as JestMock;

const objectContaining = <T extends object>(value: T): T => {
  const matcher: unknown = expect.objectContaining(value);
  return matcher as T;
};

const anyDate = (): unknown => expect.any(Date);

const createConfig = (databaseUrl: string) =>
  new ConfigService({
    DATABASE_URL: databaseUrl,
    OUTBOX_PUBLISHER_RETRY_LIMIT: RETRY_LIMIT,
    OUTBOX_STALE_LOCK_MINUTES: STALE_LOCK_MINUTES,
    OUTBOX_PUBLISHER_INTERVAL_MS: PUBLISHER_INTERVAL_MS,
  });

const createService = (
  prisma: PrismaService,
  config: ConfigService,
  broker: OutboxBroker,
) => new OutboxPublisherService(prisma, config, broker);

const waitFor = async (condition: () => boolean): Promise<void> => {
  const deadline = Date.now() + 4_000;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for concurrent publishers');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('OutboxPublisherService PostgreSQL integration', () => {
  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let config: ConfigService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('people_service_test')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();

    const databaseUrl = container.getConnectionUri();
    try {
      await execFileAsync(
        process.execPath,
        [PRISMA_CLI_ENTRY_POINT, 'migrate', 'deploy'],
        {
          cwd: process.cwd(),
          env: { ...process.env, DATABASE_URL: databaseUrl },
          shell: false,
        },
      );
    } catch (error) {
      const stderr =
        typeof error === 'object' &&
        error !== null &&
        'stderr' in error &&
        typeof error.stderr === 'string'
          ? error.stderr
          : '';
      const message =
        stderr ||
        (error instanceof Error ? error.message : 'Unknown migration failure');
      throw new Error(
        `Prisma migration failed: ${message.trim().slice(0, 2000)}`,
      );
    }

    config = createConfig(databaseUrl);
    prisma = new PrismaService(config);
    await prisma.$connect();
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  }, 120_000);

  beforeEach(async () => {
    await prisma.outboxEvent.deleteMany();
  });

  it('gives concurrent publishers disjoint claims', async () => {
    const events = Array.from({ length: CLAIM_BATCH_SIZE + 1 }, (_, index) =>
      createEvent(index + 1),
    );
    await prisma.outboxEvent.createMany({
      data: events.map((event) => ({
        eventId: event.eventId,
        aggregateType: 'PERSON' as const,
        aggregateId: event.source.aggregateId,
        aggregateVersion: event.source.aggregateVersion,
        payload: toJson(event),
      })),
    });

    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    const firstPublished: string[] = [];
    const secondPublished: string[] = [];
    const firstBroker: OutboxBroker = {
      publish: jest.fn(async (event) => {
        firstPublished.push(event.eventId);
        await firstGate;
      }),
    };
    const secondBroker: OutboxBroker = {
      publish: jest.fn(async (event) => {
        secondPublished.push(event.eventId);
        await secondGate;
      }),
    };

    const firstRun = createService(
      prisma,
      config,
      firstBroker,
    ).publishPending();
    const secondRun = createService(
      prisma,
      config,
      secondBroker,
    ).publishPending();
    try {
      await waitFor(
        () => firstPublished.length > 0 && secondPublished.length > 0,
      );

      expect(firstPublished.length).toBeGreaterThan(0);
      expect(secondPublished.length).toBeGreaterThan(0);
      expect(
        firstPublished.filter((eventId) => secondPublished.includes(eventId)),
      ).toEqual([]);
    } finally {
      releaseFirst();
      releaseSecond();
      await Promise.allSettled([firstRun, secondRun]);
    }

    const storedEvents = await prisma.outboxEvent.findMany({
      orderBy: { eventId: 'asc' },
      select: { eventId: true, status: true },
    });
    expect(storedEvents).toEqual(
      expect.arrayContaining(
        events.map((event) => ({
          eventId: event.eventId,
          status: 'PUBLISHED',
        })),
      ),
    );
  });

  it('reclaims stale processing rows', async () => {
    const event = createEvent(1);
    await prisma.outboxEvent.create({
      data: {
        eventId: event.eventId,
        aggregateType: 'PERSON',
        aggregateId: event.source.aggregateId,
        aggregateVersion: event.source.aggregateVersion,
        payload: toJson(event),
        status: 'PROCESSING',
        lockedAtUtc: new Date(Date.now() - 20 * 60_000),
        lockedBy: randomUUID(),
      },
    });
    const broker: OutboxBroker = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    await createService(prisma, config, broker).publishPending();

    expect(getMock(broker, 'publish')).toHaveBeenCalledWith(
      event,
      'relationship.reports_to',
    );
    await expect(
      prisma.outboxEvent.findUniqueOrThrow({
        where: { eventId: event.eventId },
      }),
    ).resolves.toEqual(objectContaining({ status: 'PUBLISHED' }));
  });

  it('does not claim rows whose next attempt is in the future', async () => {
    const readyEvent = createEvent(1);
    const futureEvent = createEvent(2);
    await prisma.outboxEvent.createMany({
      data: [readyEvent, futureEvent].map((event, index) => ({
        eventId: event.eventId,
        aggregateType: 'PERSON' as const,
        aggregateId: event.source.aggregateId,
        aggregateVersion: event.source.aggregateVersion,
        payload: toJson(event),
        nextAttemptAt: index === 1 ? new Date(Date.now() + 60 * 60_000) : null,
      })),
    });
    const broker: OutboxBroker = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    await createService(prisma, config, broker).publishPending();

    expect(getMock(broker, 'publish')).toHaveBeenCalledTimes(1);
    expect(getMock(broker, 'publish')).toHaveBeenCalledWith(
      readyEvent,
      'relationship.reports_to',
    );
    await expect(
      prisma.outboxEvent.findUniqueOrThrow({
        where: { eventId: futureEvent.eventId },
      }),
    ).resolves.toEqual(
      objectContaining({
        status: 'PENDING',
        nextAttemptAt: anyDate(),
      }),
    );
  });

  it('moves the retry-limit attempt to FAILED', async () => {
    const event = createEvent(1);
    await prisma.outboxEvent.create({
      data: {
        eventId: event.eventId,
        aggregateType: 'PERSON',
        aggregateId: event.source.aggregateId,
        aggregateVersion: event.source.aggregateVersion,
        payload: toJson(event),
        retryCount: RETRY_LIMIT - 1,
      },
    });
    const broker: OutboxBroker = {
      publish: jest
        .fn()
        .mockRejectedValue(new Error('temporary broker failure')),
    };

    await createService(prisma, config, broker).publishPending();

    await expect(
      prisma.outboxEvent.findUniqueOrThrow({
        where: { eventId: event.eventId },
      }),
    ).resolves.toEqual(
      objectContaining({
        status: 'FAILED',
        retryCount: RETRY_LIMIT,
        nextAttemptAt: null,
        lockedAtUtc: null,
        lockedBy: null,
      }),
    );
  });

  it('does not update a claimed row after ownership changes', async () => {
    const event = createEvent(1);
    const replacementOwner = randomUUID();
    await prisma.outboxEvent.create({
      data: {
        eventId: event.eventId,
        aggregateType: 'PERSON',
        aggregateId: event.source.aggregateId,
        aggregateVersion: event.source.aggregateVersion,
        payload: toJson(event),
      },
    });
    const broker: OutboxBroker = {
      publish: jest.fn(async () => {
        await prisma.outboxEvent.update({
          where: { eventId: event.eventId },
          data: { lockedBy: replacementOwner },
        });
      }),
    };

    await createService(prisma, config, broker).publishPending();

    await expect(
      prisma.outboxEvent.findUniqueOrThrow({
        where: { eventId: event.eventId },
      }),
    ).resolves.toEqual(
      objectContaining({
        status: 'PROCESSING',
        lockedBy: replacementOwner,
        publishedAtUtc: null,
      }),
    );
  });
});
