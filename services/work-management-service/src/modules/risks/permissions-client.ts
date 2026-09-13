import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenExchangeService } from '../auth/service-token-exchange.service';

const PERMISSION_CHECK_TIMEOUT_MS = 5_000;
const CREATE_EDIT_RISKS_PERMISSION = 'create-edit-risks';

export interface RisksPermissionsCheckPort {
  hasCreateEditRisksPermission(subjectToken: string): Promise<boolean>;
}

@Injectable()
export class HttpRisksPermissionsCheckAdapter implements RisksPermissionsCheckPort {
  private readonly logger = new Logger(HttpRisksPermissionsCheckAdapter.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokenExchange: ServiceTokenExchangeService,
  ) {}

  async hasCreateEditRisksPermission(subjectToken: string): Promise<boolean> {
    try {
      const signal = AbortSignal.timeout(PERMISSION_CHECK_TIMEOUT_MS);
      const accessToken = await this.tokenExchange.exchangeForAccessControl(
        subjectToken,
        signal,
      );
      const baseUrl = this.config.getOrThrow<string>(
        'ACCESS_CONTROL_SERVICE_BASE_URL',
      );
      const url = new URL('/api/v1/permissions/check', baseUrl);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          permissionKey: CREATE_EDIT_RISKS_PERMISSION,
          scope: null,
        }),
        signal,
      });

      if (!response.ok) {
        this.logger.warn(
          `access-control-service permission check returned ${response.status}; failing closed`,
        );
        return false;
      }

      const body = (await response.json()) as { granted?: boolean };
      return body.granted === true;
    } catch (error) {
      this.logger.warn(
        `access-control-service permission check unreachable; failing closed: ${(error as Error).message}`,
      );
      return false;
    }
  }
}
