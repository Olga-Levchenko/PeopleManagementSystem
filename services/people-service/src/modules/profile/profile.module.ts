import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmployeesModule } from '../employees/employees.module';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { ProfileController } from './profile.controller';
import { HttpAccessRoleResolutionAdapter } from './profile.ports';
import { ProfileService } from './profile.service';

@Module({
  imports: [AuthModule, forwardRef(() => EmployeesModule)],
  controllers: [ProfileController],
  providers: [
    ProfileService,
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
