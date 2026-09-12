import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeesModule } from '../employees/employees.module';
import { IdentityMappingsModule } from '../identity-mappings/identity-mappings.module';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { ProfileController } from './profile.controller';
import { ProfileMutationsService } from './profile-mutations.service';
import { HttpAccessRoleResolutionAdapter } from './profile.ports';
import { ProfileService } from './profile.service';
import { UploadStorageService } from './upload-storage.service';

@Module({
  imports: [
    AuthModule,
    IdentityMappingsModule,
    forwardRef(() => EmployeesModule),
  ],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    ProfileMutationsService,
    UploadStorageService,
    RequestActorContext,
    HttpAccessRoleResolutionAdapter,
    {
      provide: 'AccessRoleResolutionPort',
      useExisting: HttpAccessRoleResolutionAdapter,
    },
  ],
  exports: ['AccessRoleResolutionPort'],
})
export class ProfileModule {}
