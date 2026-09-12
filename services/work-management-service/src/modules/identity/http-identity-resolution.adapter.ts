import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenExchangeService } from '../auth/service-token-exchange.service';
import type {
  IdentityResolutionPort,
  IdentityResolutionResult,
} from './identity-resolution.port';

const RESOLVE_TIMEOUT_MS = 5_000;
const RESOLVE_PATH = '/api/v1/internal/identity-mappings/resolve';

@Injectable()
export class HttpIdentityResolutionAdapter implements IdentityResolutionPort {
  private readonly logger = new Logger(HttpIdentityResolutionAdapter.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokenExchange: ServiceTokenExchangeService,
  ) {}

  async resolve(
    issuer: string,
    subject: string,
    subjectToken: string,
  ): Promise<IdentityResolutionResult> {
    try {
      const signal = AbortSignal.timeout(RESOLVE_TIMEOUT_MS);
      const accessToken = await this.tokenExchange.exchangeForPeopleService(
        subjectToken,
        signal,
      );
      const baseUrl = this.config.getOrThrow<string>('PEOPLE_SERVICE_BASE_URL');
      const url = new URL(RESOLVE_PATH, baseUrl);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ issuer, subject }),
        signal,
      });

      if (response.status === 404) {
        return { outcome: 'missing' };
      }
      if (response.status === 409) {
        return { outcome: 'ambiguous' };
      }
      if (!response.ok) {
        this.logger.warn(
          `people-service identity resolution returned ${response.status} for ${issuer}/${subject}; treating as unavailable`,
        );
        return { outcome: 'unavailable' };
      }

      const body = (await response.json()) as { personId?: unknown };
      if (
        typeof body.personId !== 'string' ||
        body.personId.trim().length === 0
      ) {
        this.logger.warn(
          `people-service identity resolution returned an invalid personId for ${issuer}/${subject}`,
        );
        return { outcome: 'unavailable' };
      }
      return { outcome: 'resolved', personId: body.personId };
    } catch (error) {
      this.logger.warn(
        `people-service identity resolution unreachable for ${issuer}/${subject}: ${(error as Error).message}`,
      );
      return { outcome: 'unavailable' };
    }
  }
}
