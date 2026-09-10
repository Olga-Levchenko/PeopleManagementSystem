import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { ProfileController } from './profile.controller';
import { HttpAccessRoleResolutionAdapter } from './profile.ports';
import { ProfileService } from './profile.service';

@Module({
  imports: [AuthModule],
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
