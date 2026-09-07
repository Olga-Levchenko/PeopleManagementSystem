import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpHrAdminPermissionAdapter } from '../custom-field-definitions.ports';

const ACS_BASE_URL = 'http://acs.test';
const SECRET = 'test-shared-secret';
const KEYCLOAK_BASE_URL = 'http://keycloak.test';
const KEYCLOAK_REALM = 'people-management';
const ACTOR_ID = 'sub-aaa111';
const EXPECTED_ISSUER = `${KEYCLOAK_BASE_URL}/realms/${KEYCLOAK_REALM}`;

describe('HttpHrAdminPermissionAdapter', () => {
  const createConfig = () =>
    ({
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        const values: Record<string, string> = {
          ACCESS_CONTROL_SERVICE_BASE_URL: ACS_BASE_URL,
          INTERNAL_SERVICE_SECRET: SECRET,
          KEYCLOAK_BASE_URL,
          KEYCLOAK_REALM,
        };
        if (!(key in values)) throw new Error(`Unknown config key: ${key}`);
        return values[key];
      }),
    }) as unknown as ConfigService;

  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('granted: returns true and sends correct headers and body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ Granted: true }),
    });
    const adapter = new HttpHrAdminPermissionAdapter(createConfig());

    const result = await adapter.canWrite(ACTOR_ID);

    expect(result).toBe(true);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(calledUrl.toString()).toBe(`${ACS_BASE_URL}/api/v1/permissions/check`);
    expect(calledInit.method).toBe('POST');
    expect((calledInit.headers as Record<string, string>)['X-Internal-Service-Secret']).toBe(SECRET);
    expect((calledInit.headers as Record<string, string>)['X-Internal-Service-Identity']).toBe('people-service');
    expect((calledInit.headers as Record<string, string>)['X-Delegated-Actor-Issuer']).toBe(EXPECTED_ISSUER);
    expect((calledInit.headers as Record<string, string>)['X-Delegated-Actor-Sub']).toBe(ACTOR_ID);
    expect(JSON.parse(calledInit.body as string)).toEqual({ PermissionKey: 'manage-custom-fields' });
  });

  it('denied: Granted:false throws ForbiddenException', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ Granted: false }),
    });
    const adapter = new HttpHrAdminPermissionAdapter(createConfig());

    await expect(adapter.canWrite(ACTOR_ID)).rejects.toThrow(ForbiddenException);
  });

  it('403 from ACS throws ForbiddenException (fail-closed)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    const adapter = new HttpHrAdminPermissionAdapter(createConfig());

    await expect(adapter.canWrite(ACTOR_ID)).rejects.toThrow(ForbiddenException);
  });

  it('503 from ACS throws ForbiddenException (fail-closed)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const adapter = new HttpHrAdminPermissionAdapter(createConfig());

    await expect(adapter.canWrite(ACTOR_ID)).rejects.toThrow(ForbiddenException);
  });

  it('network error throws ForbiddenException (fail-closed)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = new HttpHrAdminPermissionAdapter(createConfig());

    await expect(adapter.canWrite(ACTOR_ID)).rejects.toThrow(ForbiddenException);
  });
});
