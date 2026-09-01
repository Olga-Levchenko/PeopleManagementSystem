import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthConfigEntity } from './entities/auth-config.entity';

@Injectable()
export class AuthConfigService {
  constructor(private readonly config: ConfigService) {}

  // Resolved entirely from this service's own env config — never from a synchronous call
  // to Keycloak's admin API. This is a thin façade over well-known OIDC path conventions,
  // not a proxy of Keycloak's discovery document.
  getConfig(): AuthConfigEntity {
    const baseUrl = this.config.getOrThrow<string>('KEYCLOAK_BASE_URL');
    const realm = this.config.getOrThrow<string>('KEYCLOAK_REALM');
    const issuer = `${baseUrl}/realms/${realm}`;

    return {
      issuer,
      jwksUri: `${issuer}/protocol/openid-connect/certs`,
      realm,
    };
  }
}
