import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { envValidationSchema } from './config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { OidcService } from './modules/auth/oidc.service';
import { CustomFieldDefinitionsModule } from './modules/custom-field-definitions/custom-field-definitions.module';
import { HealthModule } from './modules/health/health.module';
import { ManagementNotesModule } from './modules/management-notes/management-notes.module';
import { OrganisationalRelationshipsModule } from './modules/organisational-relationships/organisational-relationships.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { FunctionalRolesModule } from './modules/functional-roles/functional-roles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
    }),
    AuthModule,
    CustomFieldDefinitionsModule,
    EmployeesModule,
    HealthModule,
    ManagementNotesModule,
    OrganisationalRelationshipsModule,
    FunctionalRolesModule,
  ],
  providers: [
    // OidcService is exported from AuthModule, but APP_GUARD is instantiated by the root injector
    // (not AuthModule's), so it needs its own provider entry here for JwtAuthGuard's DI to resolve.
    OidcService,
    JwtAuthGuard,
    {
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
