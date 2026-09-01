import { connect, type ChannelModel, type ConfirmChannel } from 'amqplib'
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { RelationshipChangedEvent } from '../../../../../libs/contracts/relationship-events'
import type { OutboxBroker } from './outbox-broker.port'

@Injectable()
export class RabbitMqOutboxBroker implements OutboxBroker, OnModuleDestroy {
  private connection?: ChannelModel
  private channel?: ConfirmChannel

  constructor(
    private readonly config: ConfigService,
    @Inject('RABBITMQ_EXCHANGE') private readonly exchange: string,
  ) {}

  async publish(event: RelationshipChangedEvent, routingKey: string): Promise<void> {
    const channel = await this.getChannel()
    const payload = Buffer.from(JSON.stringify(event))

    await new Promise<void>((resolve, reject) => {
      channel.publish(
        this.exchange,
        routingKey,
        payload,
        {
          contentType: 'application/json',
          deliveryMode: 2,
          messageId: event.eventId,
        },
        error => (error ? reject(error) : resolve()),
      )
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close()
    await this.connection?.close()
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (this.channel) {
      return this.channel
    }

    const connection = await connect(this.config.getOrThrow<string>('RABBITMQ_URL'))
    const channel = await connection.createConfirmChannel()
    await channel.assertExchange(this.exchange, 'topic', { durable: true })
    this.connection = connection
    this.channel = channel
    return channel
  }
}
