import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxPublisherService } from './outbox-publisher.service';
import { RabbitMqOutboxBroker } from './rabbitmq-outbox-broker';

@Module({
  providers: [
    RabbitMqOutboxBroker,
    OutboxPublisherService,
    {
      provide: 'OutboxBroker',
      useExisting: RabbitMqOutboxBroker,
    },
    {
      provide: 'RABBITMQ_EXCHANGE',
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.getOrThrow<string>('RABBITMQ_EXCHANGE'),
    },
  ],
})
export class OutboxModule {}
