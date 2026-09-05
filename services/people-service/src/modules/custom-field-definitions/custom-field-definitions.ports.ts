import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Port for checking whether the acting user holds HR Admin write permission.
 * Resolved per-request via the actor's Keycloak sub; never cached across requests.
 *
 * The concrete implementation calls access-control-service's
 * POST /api/v1/permissions/check per AD-5 (BFF must not own authorization policy).
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

/**
 * Calls access-control-service's POST /api/v1/permissions/check with the
 * "manage-custom-fields" permission key. Sends the actor's Keycloak issuer + sub
 * in custom headers so ACS can resolve the person ID without a separate token.
 * Any non-200 or Granted:false response throws ForbiddenException (fail-closed).
 */
@Injectable()
export class HttpHrAdminPermissionAdapter implements HrAdminPermissionPort {
  private static readonly PERMISSION_KEY = 'manage-custom-fields';
  private readonly logger = new Logger(HttpHrAdminPermissionAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async canWrite(actorId: string): Promise<boolean> {
    const baseUrl = this.config.getOrThrow<string>(
      'ACCESS_CONTROL_SERVICE_BASE_URL',
    );
    const secret = this.config.getOrThrow<string>('INTERNAL_SERVICE_SECRET');
    const keycloakBaseUrl = this.config.getOrThrow<string>('KEYCLOAK_BASE_URL');
    const keycloakRealm = this.config.getOrThrow<string>('KEYCLOAK_REALM');
    const issuer = `${keycloakBaseUrl}/realms/${keycloakRealm}`;
    const url = new URL('/api/v1/permissions/check', baseUrl);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service-Secret': secret,
          'X-Internal-Service-Identity': 'people-service',
          'X-Delegated-Actor-Issuer': issuer,
          'X-Delegated-Actor-Sub': actorId,
        },
        body: JSON.stringify({
          PermissionKey: HttpHrAdminPermissionAdapter.PERMISSION_KEY,
        }),
      });

      if (!response.ok) {
        this.logger.warn(
          `access-control-service permission check returned ${response.status} for actor ${actorId}; denying write`,
        );
        throw new ForbiddenException('HR Admin permission required');
      }

      const body = (await response.json()) as { Granted: boolean };
      if (body.Granted !== true) {
        throw new ForbiddenException('HR Admin permission required');
      }
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      this.logger.warn(
        `access-control-service unreachable during HR Admin permission check for actor ${actorId}: ${(error as Error).message}; denying write`,
      );
      throw new ForbiddenException('HR Admin permission check unavailable');
    }
  }
}
