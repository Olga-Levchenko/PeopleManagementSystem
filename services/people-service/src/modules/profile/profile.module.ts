import { Module } from '@nestjs/common';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { ProfileController } from './profile.controller';
import { HttpAccessRoleResolutionAdapter } from './profile.ports';
import { ProfileService } from './profile.service';

@Module({
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
})
export class ProfileModule {}
