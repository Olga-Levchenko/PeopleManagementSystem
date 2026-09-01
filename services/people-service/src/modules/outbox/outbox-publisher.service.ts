import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Prisma } from '../../generated/prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import type { RelationshipChangedEvent, RelationshipType } from '../../../../../libs/contracts/relationship-events'
import type { OutboxBroker } from './outbox-broker.port'

const BATCH_SIZE = 50
const ROUTING_KEYS: Record<RelationshipType, string> = {
  reports_to: 'relationship.reports_to',
  pp_assignment: 'relationship.pp_assignment',
  department_membership: 'relationship.department_membership',
  department_manager: 'relationship.department_manager',
}

interface ClaimedOutboxEvent {
  eventId: string
  aggregateType: 'PERSON' | 'DEPARTMENT'
  payload: RelationshipChangedEvent
  retryCount: number
}

@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name)
  private readonly publisherId = randomUUID()
  private interval?: NodeJS.Timeout
  private publishing = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject('OutboxBroker') private readonly broker: OutboxBroker,
  ) {}

  onModuleInit(): void {
    const intervalMs = this.config.getOrThrow<number>('OUTBOX_PUBLISHER_INTERVAL_MS')
    this.interval = setInterval(() => void this.publishPending(), intervalMs)
    void this.publishPending()
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval)
    }
  }

  async publishPending(): Promise<void> {
    if (this.publishing) {
      return
    }

    this.publishing = true
    try {
      const events = await this.claimPending()
      for (const event of events) {
        await this.publishClaimed(event)
      }
    } finally {
      this.publishing = false
    }
  }

  private async claimPending(): Promise<ClaimedOutboxEvent[]> {
    const staleLockMinutes = this.config.getOrThrow<number>('OUTBOX_STALE_LOCK_MINUTES')
    return this.prisma.$transaction(tx =>
      tx.$queryRaw<ClaimedOutboxEvent[]>(Prisma.sql`
        WITH candidates AS (
          SELECT "eventId"
          FROM "outbox_events"
          WHERE (
            (
              "status" = 'PENDING'::"OutboxStatus"
              AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())
            )
            OR (
              "status" = 'PROCESSING'::"OutboxStatus"
              AND "lockedAtUtc" <= NOW() - make_interval(mins => ${staleLockMinutes})
            )
          )
          AND "payload"->'relationship'->>'type' IN (
            'reports_to',
            'pp_assignment',
            'department_membership',
            'department_manager'
          )
          ORDER BY "createdAtUtc"
          FOR UPDATE SKIP LOCKED
          LIMIT ${BATCH_SIZE}
        )
        UPDATE "outbox_events" AS events
        SET
          "status" = 'PROCESSING'::"OutboxStatus",
          "lockedAtUtc" = NOW(),
          "lockedBy" = ${this.publisherId}::uuid
        FROM candidates
        WHERE events."eventId" = candidates."eventId"
        RETURNING
          events."eventId",
          events."aggregateType",
          events."payload",
          events."retryCount"
      `),
    )
  }

  private async publishClaimed(event: ClaimedOutboxEvent): Promise<void> {
    const relationshipType = event.payload.relationship.type
    const routingKey = ROUTING_KEYS[relationshipType]

    try {
      await this.broker.publish(event.payload, routingKey)
    } catch (error) {
      await this.recordFailure(event, error)
      return
    }

    try {
      await this.prisma.outboxEvent.updateMany({
        where: {
          eventId: event.eventId,
          status: 'PROCESSING',
          lockedBy: this.publisherId,
        },
        data: {
          status: 'PUBLISHED',
          publishedAtUtc: new Date(),
          lockedAtUtc: null,
          lockedBy: null,
        },
      })
    } catch (error) {
      this.logger.error(`Confirmed event ${event.eventId} could not be marked published`, error)
    }
  }

  private async recordFailure(event: ClaimedOutboxEvent, error: unknown): Promise<void> {
    const retryLimit = this.config.getOrThrow<number>('OUTBOX_PUBLISHER_RETRY_LIMIT')
    const retryCount = event.retryCount + 1
    const terminal = retryCount >= retryLimit
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Unknown publish failure'
    const nextAttemptAt = terminal ? null : new Date(Date.now() + this.backoffMs(retryCount))

    await this.prisma.outboxEvent.updateMany({
      where: {
        eventId: event.eventId,
        status: 'PROCESSING',
        lockedBy: this.publisherId,
      },
      data: {
        status: terminal ? 'FAILED' : 'PENDING',
        retryCount,
        lastError: message,
        nextAttemptAt,
        lockedAtUtc: null,
        lockedBy: null,
      },
    })
  }

  private backoffMs(retryCount: number): number {
    const delaysInMinutes = [1, 5, 25, 125, 625]
    return delaysInMinutes[Math.min(retryCount, delaysInMinutes.length) - 1] * 60_000
  }
}
