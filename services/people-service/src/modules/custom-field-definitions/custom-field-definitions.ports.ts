import { ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Port for checking whether the acting user holds HR Admin write permission.
 * Resolved per-request via the actor's person id; never cached across requests.
 *
 * The concrete implementation calls access-control-service per AD-5 (BFF must not
 * own authorization policy). Until that S2S call is wired, the Unavailable adapter
 * fails closed — same pattern as UnavailableRelationshipPermissionAdapter.
 */
export interface HrAdminPermissionPort {
  canWrite(actorId: string): Promise<boolean>;
}

@Injectable()
export class UnavailableHrAdminPermissionAdapter implements HrAdminPermissionPort {
  canWrite(): Promise<boolean> {
    return Promise.reject(
      new ForbiddenException('HR Admin permission check is unavailable'),
    );
  }
}
