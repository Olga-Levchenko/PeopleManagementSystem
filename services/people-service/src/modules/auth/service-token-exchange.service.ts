import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign,
} from 'node:crypto';
import { readFile } from 'node:fs/promises';

const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

@Injectable()
export class ServiceTokenExchangeService {
  constructor(private readonly config: ConfigService) {}

  async exchangeForAudience(
    subjectToken: string,
    audience: 'access-control-service',
  ): Promise<string> {
    const baseUrl = this.config
      .getOrThrow<string>('KEYCLOAK_BASE_URL')
      .replace(/\/+$/, '');
    const realm = this.config.getOrThrow<string>('KEYCLOAK_REALM');
    const tokenEndpoint = `${baseUrl}/realms/${realm}/protocol/openid-connect/token`;
    const keyPath = this.config.get<string>('SERVICE_AUTH_PRIVATE_KEY_PATH');
    const keyId = this.config.get<string>('SERVICE_AUTH_KEY_ID');
    const algorithm =
      this.config.get<string>('SERVICE_AUTH_SIGNING_ALG') ?? 'RS256';

    if (!keyPath || !keyId || algorithm !== 'RS256') {
      throw new ServiceUnavailableException(
        'Service token exchange credentials are unavailable',
      );
    }

    try {
      const now = Math.floor(Date.now() / 1000);
      const assertion = await this.createClientAssertion(
        keyPath,
        keyId,
        algorithm,
        tokenEndpoint,
        now,
      );
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: TOKEN_EXCHANGE_GRANT,
          subject_token: subjectToken,
          subject_token_type: ACCESS_TOKEN_TYPE,
          requested_token_type: ACCESS_TOKEN_TYPE,
          audience,
          scope: 'access-control-service-audience',
          client_id: 'people-service',
          client_assertion_type:
            'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
          client_assertion: assertion,
        }),
      });
      if (!response.ok) {
        throw new ServiceUnavailableException('Service token exchange failed');
      }
      const body = (await response.json()) as { access_token?: unknown };
      if (
        typeof body.access_token !== 'string' ||
        body.access_token.length === 0
      ) {
        throw new ServiceUnavailableException(
          'Service token exchange returned no access token',
        );
      }
      return body.access_token;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'Service token exchange is unavailable',
      );
    }
  }

  async getPublicJwks(): Promise<{ keys: Record<string, unknown>[] }> {
    const keyPath = this.config.get<string>('SERVICE_AUTH_PRIVATE_KEY_PATH');
    const keyId = this.config.get<string>('SERVICE_AUTH_KEY_ID');
    if (!keyPath || !keyId) {
      throw new ServiceUnavailableException(
        'Service signing key is unavailable',
      );
    }
    try {
      const privateKey = createPrivateKey(await readFile(keyPath));
      const publicJwk = createPublicKey(privateKey).export({
        format: 'jwk',
      }) as Record<string, unknown>;
      publicJwk.kid = keyId;
      publicJwk.alg = 'RS256';
      publicJwk.use = 'sig';
      return { keys: [publicJwk] };
    } catch {
      throw new ServiceUnavailableException(
        'Service signing key is unavailable',
      );
    }
  }

  private async createClientAssertion(
    keyPath: string,
    keyId: string,
    algorithm: string,
    audience: string,
    now: number,
  ): Promise<string> {
    const header = this.encode({
      alg: algorithm,
      typ: 'JWT',
      kid: keyId,
    });
    const payload = this.encode({
      iss: 'people-service',
      sub: 'people-service',
      aud: audience,
      iat: now,
      exp: now + 30,
      jti: randomUUID(),
    });
    const privateKey = createPrivateKey(await readFile(keyPath));
    const signature = sign(
      'RSA-SHA256',
      Buffer.from(`${header}.${payload}`),
      privateKey,
    );
    return `${header}.${payload}.${this.encode(signature)}`;
  }

  private encode(value: object | Buffer): string {
    return Buffer.from(
      value instanceof Buffer ? value : JSON.stringify(value),
    ).toString('base64url');
  }
}
