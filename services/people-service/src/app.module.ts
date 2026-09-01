import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { envValidationSchema } from './config/env.validation';
import { HealthModule } from './modules/health/health.module';
import { OrganisationalRelationshipsModule } from './modules/organisational-relationships/organisational-relationships.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    PrismaModule,
    HealthModule,
    OrganisationalRelationshipsModule,
    OutboxModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
