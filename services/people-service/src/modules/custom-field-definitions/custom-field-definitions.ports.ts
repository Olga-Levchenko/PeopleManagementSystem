import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestActorContext } from '../organisational-relationships/request-actor.context';
import { ServiceTokenExchangeService } from '../auth/service-token-exchange.service';

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
 * "manage-custom-fields" permission key. Exchanges the current user token for an
 * Access Control audience token and never sends caller-controlled identity headers.
 * Any denied response throws ForbiddenException; dependency failure remains 503.
 */
@Injectable()
export class HttpHrAdminPermissionAdapter implements HrAdminPermissionPort {
  private static readonly PERMISSION_KEY = 'manage-custom-fields';
  private readonly logger = new Logger(HttpHrAdminPermissionAdapter.name);

  constructor(
    private readonly config: ConfigService,
    private readonly actor: RequestActorContext,
    private readonly tokenExchange: ServiceTokenExchangeService,
  ) {}

  async canWrite(actorId: string): Promise<boolean> {
    const baseUrl = this.config.getOrThrow<string>(
      'ACCESS_CONTROL_SERVICE_BASE_URL',
    );
    const url = new URL('/api/v1/permissions/check', baseUrl);

    try {
      const accessToken = await this.tokenExchange.exchangeForAudience(
        this.actor.accessToken,
        'access-control-service',
      );
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          PermissionKey: HttpHrAdminPermissionAdapter.PERMISSION_KEY,
        }),
      });

      if (response.status === 503) {
        throw new ServiceUnavailableException(
          'HR Admin permission check is unavailable',
        );
      }
      if (!response.ok) {
        this.logger.warn(
          `access-control-service permission check returned ${response.status} for actor ${actorId}; denying write`,
        );
        throw new ForbiddenException('HR Admin permission required');
      }

      const body = (await response.json()) as { granted?: boolean };
      if (body.granted !== true) {
        throw new ForbiddenException('HR Admin permission required');
      }
      return true;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      this.logger.warn(
        `access-control-service unreachable during HR Admin permission check for actor ${actorId}: ${(error as Error).message}; denying write`,
      );
      throw new ServiceUnavailableException(
        'HR Admin permission check unavailable',
      );
    }
  }
}
