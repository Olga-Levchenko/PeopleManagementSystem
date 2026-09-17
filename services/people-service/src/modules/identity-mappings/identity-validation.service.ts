import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CanonicalIdentity {
  readonly canonicalIssuer: string;
  readonly opaqueSubject: string;
}

@Injectable()
export class IdentityValidationService {
  private readonly allowedIssuers: Set<string>;
  private readonly nodeEnvironment: string;

  constructor(private readonly config: ConfigService) {
    this.nodeEnvironment = this.readOptional('NODE_ENV') ?? 'development';

    const configured = (this.readOptional('OIDC_ALLOWED_ISSUERS') ?? '')
      .split(',')
      .filter((issuer) => issuer.length > 0);

    // When OIDC_ALLOWED_ISSUERS is not set, derive the single allowed issuer from the
    // already-required KEYCLOAK_BASE_URL / KEYCLOAK_REALM pair — the same formula
    // JwtStrategy uses to validate the token's iss claim — so the service works out of
    // the box without duplicating information already present in the required config.
    if (configured.length === 0) {
      const baseUrl = this.config
        .getOrThrow<string>('KEYCLOAK_BASE_URL')
        .replace(/\/+$/, '');
      const realm = this.config.getOrThrow<string>('KEYCLOAK_REALM');
      configured.push(`${baseUrl}/realms/${realm}`);
    }

    this.allowedIssuers = new Set(
      configured.map((issuer) => this.canonicalizeIssuer(issuer)),
    );
  }

  private readOptional(key: string): string | undefined {
    const candidate = this.config as ConfigService & {
      getOrThrow?: (configKey: string) => string;
    };
    if (typeof candidate.get === 'function') {
      return candidate.get<string>(key);
    }
    if (typeof candidate.getOrThrow === 'function') {
      try {
        return candidate.getOrThrow(key);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  validateIdentity(issuer: string, subject: string): CanonicalIdentity {
    return {
      canonicalIssuer: this.validateIssuer(issuer),
      opaqueSubject: this.validateSubject(subject),
    };
  }

  validateIssuer(issuer: string): string {
    if (
      typeof issuer !== 'string' ||
      issuer.length === 0 ||
      issuer !== issuer.trim()
    ) {
      throw new BadRequestException('Identity issuer is malformed');
    }

    const canonicalIssuer = this.canonicalizeIssuer(issuer);
    if (!this.allowedIssuers.has(canonicalIssuer)) {
      throw new BadRequestException('Identity issuer is not allowed');
    }

    return canonicalIssuer;
  }

  validateSubject(subject: string): string {
    if (typeof subject !== 'string' || subject.trim().length === 0) {
      throw new BadRequestException('Identity subject is required');
    }

    return subject;
  }

  canonicalizeIssuer(issuer: string): string {
    let parsed: URL;
    try {
      parsed = new URL(issuer);
    } catch {
      throw new BadRequestException('Identity issuer is malformed');
    }

    const isLocalEnvironment = ['development', 'test', 'local'].includes(
      this.nodeEnvironment,
    );
    if (
      parsed.protocol !== 'https:' &&
      !(isLocalEnvironment && parsed.protocol === 'http:')
    ) {
      throw new BadRequestException('Identity issuer must use HTTPS');
    }

    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !parsed.hostname
    ) {
      throw new BadRequestException('Identity issuer is malformed');
    }

    const port =
      (parsed.protocol === 'https:' && parsed.port === '443') ||
      (parsed.protocol === 'http:' && parsed.port === '80')
        ? ''
        : parsed.port;
    const pathname =
      parsed.pathname.endsWith('/') && parsed.pathname !== '/'
        ? parsed.pathname.slice(0, -1)
        : parsed.pathname === '/'
          ? ''
          : parsed.pathname;

    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${port ? `:${port}` : ''}${pathname}`;
  }
}
