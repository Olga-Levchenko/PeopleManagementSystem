import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HttpIdentityResolutionAdapter } from './http-identity-resolution.adapter';
import { RequestActorContext } from './request-actor.context';

@Module({
  imports: [AuthModule],
  providers: [
    HttpIdentityResolutionAdapter,
    {
      provide: 'IdentityResolutionPort',
      useExisting: HttpIdentityResolutionAdapter,
    },
    RequestActorContext,
  ],
  exports: [RequestActorContext, 'IdentityResolutionPort'],
})
export class IdentityModule {}
