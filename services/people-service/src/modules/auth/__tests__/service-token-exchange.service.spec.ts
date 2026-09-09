import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServiceTokenExchangeService } from '../service-token-exchange.service';

describe('ServiceTokenExchangeService', () => {
  let temporaryDirectory: string;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'people-service-token-'));
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await writeFile(
      join(temporaryDirectory, 'service.pem'),
      privateKey.export({ type: 'pkcs8', format: 'pem' }),
    );

    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ access_token: 'exchanged-token' }),
    });
    global.fetch = fetchMock;
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('requests only the access-control-service audience scope', async () => {
    const config = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          KEYCLOAK_BASE_URL: 'https://keycloak.example.test',
          KEYCLOAK_REALM: 'people-management',
        };
        return values[key];
      }),
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          SERVICE_AUTH_PRIVATE_KEY_PATH: join(
            temporaryDirectory,
            'service.pem',
          ),
          SERVICE_AUTH_KEY_ID: 'people-key-1',
          SERVICE_AUTH_SIGNING_ALG: 'RS256',
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    const service = new ServiceTokenExchangeService(config);

    await expect(
      service.exchangeForAudience('incoming-token', 'access-control-service'),
    ).resolves.toBe('exchanged-token');

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(request.body as string);
    expect(body.get('audience')).toBe('access-control-service');
    expect(body.get('scope')).toBe('access-control-service-audience');
    expect(body.get('client_id')).toBe('people-service');
  });
});
