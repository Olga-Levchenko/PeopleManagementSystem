import { ConfigService } from '@nestjs/config';
import { HttpAccessRoleResolutionAdapter } from '../profile.ports';

const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const BASE_URL = 'http://access-control-service.test';

describe('HttpAccessRoleResolutionAdapter', () => {
  const createConfig = () =>
    ({
      getOrThrow: jest.fn().mockReturnValue(BASE_URL),
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

  it('success: parses the JSON body and calls the correct URL/query params', async () => {
    const body = {
      reportingLine: true,
      projectLine: false,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'Read' },
      },
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(body),
    });
    const adapter = new HttpAccessRoleResolutionAdapter(createConfig());

    const result = await adapter.resolve(VIEWER_ID, SUBJECT_ID);

    // parseAccessRoleResolution normalizes the wire response: adds missing boolean flags as false,
    // fills in absent section groups as null, and adds missing s10/s11 with level:'None'.
    // Note: parseSectionAccess returns { level: 'None' } (no restriction) for undefined keys,
    // but { level, restriction: null } when the key is present as an object.
    expect(result).toEqual({
      reportingLine: true,
      projectLine: false,
      peoplePartnerLine: false,
      fullProfileAccessLine: false,
      managerSectionAccess: {
        s1: { level: 'ReadWrite', restriction: null },
        s2: { level: 'Read', restriction: null },
        s10: { level: 'None' },
        s11: { level: 'None' },
        s16: { level: 'None' },
      },
      peoplePartnerSectionAccess: null,
      fullProfileAccessSectionAccess: null,
    });
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(calledUrl.toString()).toBe(
      `${BASE_URL}/api/v1/access-roles/resolve?viewerPersonId=${VIEWER_ID}&subjectPersonId=${SUBJECT_ID}`,
    );
    expect(calledInit).toEqual({ method: 'GET' });
  });

  it('non-2xx response: fails closed to the "neither line" shape, logged not thrown', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn(),
    });
    const adapter = new HttpAccessRoleResolutionAdapter(createConfig());

    const result = await adapter.resolve(VIEWER_ID, SUBJECT_ID);

    expect(result).toEqual({
      reportingLine: false,
      projectLine: false,
      peoplePartnerLine: false,
      fullProfileAccessLine: false,
      managerSectionAccess: null,
      peoplePartnerSectionAccess: null,
      fullProfileAccessSectionAccess: null,
    });
  });

  it('fullProfileAccessLine: parses true and fullProfileAccessSectionAccess correctly', async () => {
    const body = {
      reportingLine: false,
      projectLine: false,
      peoplePartnerLine: false,
      fullProfileAccessLine: true,
      managerSectionAccess: null,
      peoplePartnerSectionAccess: null,
      fullProfileAccessSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
        s10: { level: 'ReadWrite' },
        s11: { level: 'ReadWrite' },
        s16: { level: 'ReadWrite' },
      },
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(body),
    });
    const adapter = new HttpAccessRoleResolutionAdapter(createConfig());

    const result = await adapter.resolve(VIEWER_ID, SUBJECT_ID);

    expect(result.fullProfileAccessLine).toBe(true);
    expect(result.fullProfileAccessSectionAccess).not.toBeNull();
    expect(result.fullProfileAccessSectionAccess!.s1).toEqual({
      level: 'ReadWrite',
      restriction: null,
    });
    expect(result.fullProfileAccessSectionAccess!.s10).toEqual({
      level: 'ReadWrite',
      restriction: null,
    });
  });

  it('network error (fetch throws): fails closed to the "neither line" shape, logged not thrown', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = new HttpAccessRoleResolutionAdapter(createConfig());

    const result = await adapter.resolve(VIEWER_ID, SUBJECT_ID);

    expect(result).toEqual({
      reportingLine: false,
      projectLine: false,
      peoplePartnerLine: false,
      fullProfileAccessLine: false,
      managerSectionAccess: null,
      peoplePartnerSectionAccess: null,
      fullProfileAccessSectionAccess: null,
    });
  });
});
