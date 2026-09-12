import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdentityModule } from '../identity/identity.module';
import { HttpAccessRoleResolutionAdapter } from './access-control-client';
import { ManagementNotesController } from './management-notes.controller';
import { ManagementNotesService } from './management-notes.service';

// S7 management notes (Story 1.7): flag-gated CRUD, with the caller's access role resolved via
// access-control-service (never re-derived locally) -- see this module's own service for the
// UM/DM/PP-vs-PM-vs-self access split.
@Module({
  imports: [AuthModule, IdentityModule],
  controllers: [ManagementNotesController],
  providers: [
    ManagementNotesService,
    HttpAccessRoleResolutionAdapter,
    {
      provide: 'AccessRoleResolutionPort',
      useExisting: HttpAccessRoleResolutionAdapter,
    },
  ],
})
export class ManagementNotesModule {}
