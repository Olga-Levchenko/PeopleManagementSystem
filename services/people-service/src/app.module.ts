import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { envValidationSchema } from './config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { CustomFieldDefinitionsModule } from './modules/custom-field-definitions/custom-field-definitions.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityMappingsModule } from './modules/identity-mappings/identity-mappings.module';
import { OrganisationalRelationshipsModule } from './modules/organisational-relationships/organisational-relationships.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { ProfileModule } from './modules/profile/profile.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    PrismaModule,
    AuthModule,
    CustomFieldDefinitionsModule,
    HealthModule,
    IdentityMappingsModule,
    OrganisationalRelationshipsModule,
    OutboxModule,
    ProfileModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
