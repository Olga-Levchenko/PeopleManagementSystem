import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { CampaignActivatedEvent } from '@pms/contracts';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import type { CampaignActivationPublisher } from '../src/modules/campaign-activation/campaign-activation.publisher';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetActionItemE2eState } from './support/e2e-db.helpers';

function buildEvent(
  overrides: Partial<CampaignActivatedEvent> = {},
): CampaignActivatedEvent {
  const campaignId = overrides.campaignId ?? randomUUID();
  return {
    eventId: randomUUID(),
    schemaVersion: 1,
    occurredAtUtc: '2026-09-12T10:00:00.000Z',
    source: {
      service: 'work-management-service',
      aggregateType: 'campaign',
      aggregateId: campaignId,
      aggregateVersion: 1,
    },
    campaignId,
    title: 'Quarterly security training',
    description: 'Complete the external form before the due date.',
    linkUrl: 'https://forms.example.test/security-q3',
    dueDate: '2026-10-01T00:00:00.000Z',
    authorPersonId: 'cccccccc-0000-0000-0000-000000000006',
    recipientPersonIds: [
      'cccccccc-0000-0000-0000-00000000000b',
      'cccccccc-0000-0000-0000-00000000000c',
    ],
    ...overrides,
  };
}

describe('Campaign activation (e2e)', () => {
  jest.setTimeout(60_000);

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let publisher: CampaignActivationPublisher;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    publisher = moduleFixture.get('CampaignActivationPublisher');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetActionItemE2eState(prisma);
  });

  afterEach(async () => {
    await resetActionItemE2eState(prisma);
  });

  it('creates campaign action items for each frozen recipient', async () => {
    const event = buildEvent();
    const result = await publisher.publish(event);

    expect(result.createdCount).toBe(2);
    expect(result.skippedAsDuplicateEvent).toBe(false);

    const rows = await prisma.actionItem.findMany({
      orderBy: { assigneePersonId: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.source === 'campaign')).toBe(true);
    expect(rows.every((row) => row.campaignId === event.campaignId)).toBe(true);
    expect(rows[0].title).toBe(event.title);
    expect(rows[0].linkUrl).toBe(event.linkUrl);
    expect(rows[0].authorPersonId).toBe(event.authorPersonId);
    expect(rows[0].dueDate.toISOString()).toBe(
      new Date(event.dueDate).toISOString(),
    );
  });

  it('accepts the committed libs/contracts happy-path fixture', async () => {
    const fixturePath = join(
      __dirname,
      '../../../libs/contracts/fixtures/campaign-activated-event.happy-path.v1.json',
    );
    const event = JSON.parse(
      await readFile(fixturePath, 'utf8'),
    ) as CampaignActivatedEvent;

    const result = await publisher.publish(event);

    expect(result.createdCount).toBe(2);
    expect(result.skippedAsDuplicateEvent).toBe(false);
    expect(
      await prisma.actionItem.count({
        where: { campaignId: event.campaignId },
      }),
    ).toBe(2);
  });

  it('is idempotent for the same eventId', async () => {
    const event = buildEvent();
    await publisher.publish(event);
    const replay = await publisher.publish(event);

    expect(replay.skippedAsDuplicateEvent).toBe(true);
    expect(replay.createdCount).toBe(0);
    expect(
      await prisma.actionItem.count({
        where: { campaignId: event.campaignId },
      }),
    ).toBe(2);
  });

  it('re-activation skips existing assignees and creates items for new recipients', async () => {
    const campaignId = randomUUID();
    const first = buildEvent({
      campaignId,
      recipientPersonIds: [
        'cccccccc-0000-0000-0000-00000000000b',
        'cccccccc-0000-0000-0000-00000000000c',
      ],
      title: 'First activation',
      linkUrl: 'https://forms.example.test/first',
    });
    await publisher.publish(first);

    const second = buildEvent({
      campaignId,
      recipientPersonIds: [
        'cccccccc-0000-0000-0000-00000000000c',
        'cccccccc-0000-0000-0000-00000000000d',
      ],
      title: 'Second activation',
      linkUrl: 'https://forms.example.test/second',
    });
    const result = await publisher.publish(second);

    expect(result.createdCount).toBe(1);

    const rows = await prisma.actionItem.findMany({
      where: { campaignId },
      orderBy: { assigneePersonId: 'asc' },
    });
    expect(rows).toHaveLength(3);

    const rowB = rows.find(
      (row) => row.assigneePersonId === 'cccccccc-0000-0000-0000-00000000000b',
    );
    expect(rowB?.title).toBe('First activation');
    expect(rowB?.linkUrl).toBe('https://forms.example.test/first');

    const rowD = rows.find(
      (row) => row.assigneePersonId === 'cccccccc-0000-0000-0000-00000000000d',
    );
    expect(rowD?.title).toBe('Second activation');
    expect(rowD?.linkUrl).toBe('https://forms.example.test/second');
  });

  it('creates zero rows but records processing for an empty recipient list', async () => {
    const event = buildEvent({ recipientPersonIds: [] });
    const result = await publisher.publish(event);

    expect(result.createdCount).toBe(0);
    expect(await prisma.actionItem.count()).toBe(0);
    expect(
      await prisma.processedCampaignActivationEvent.findUnique({
        where: { eventId: event.eventId },
      }),
    ).not.toBeNull();
  });
});
