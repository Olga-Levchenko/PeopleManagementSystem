import { ConfigService } from '@nestjs/config';
import {
  HttpAccessRoleResolutionAdapter,
  NO_ACCESS_RESOLUTION,
  parseAccessRoleResolution,
} from '../access-control-client';

const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const BASE_URL = 'http://access-control-service.test';

describe('parseAccessRoleResolution', () => {
  it('parses a well-formed 2xx body with every line true and both recognized projectRoles', () => {
    const result = parseAccessRoleResolution({
      reportingLine: true,
      projectLine: true,
      projectRoles: ['ProjectManager', 'DeliveryManager'],
      peoplePartnerLine: true,
      fullProfileAccessLine: true,
    });

    expect(result).toEqual({
      reportingLine: true,
      projectLine: true,
      projectRoles: ['ProjectManager', 'DeliveryManager'],
      peoplePartnerLine: true,
      fullProfileAccessLine: true,
    });
  });

  it.each([
    ['null', null],
    ['a plain string', 'not-an-object'],
    ['a number', 42],
    ['an array', ['reportingLine']],
    ['undefined', undefined],
  ])(
    'fails closed to NO_ACCESS_RESOLUTION when the raw value is %s (not a JSON object)',
    (_label, raw) => {
      expect(parseAccessRoleResolution(raw)).toEqual(NO_ACCESS_RESOLUTION);
    },
  );

  it.each([
    ['the string "true"', 'true'],
    ['the number 1', 1],
    ['null', null],
    ['undefined (key absent)', undefined],
  ])(
    'treats a non-boolean-strict-true line value (%s) as false, never as truthy-granted',
    (_label, value) => {
      const result = parseAccessRoleResolution({
        reportingLine: value,
        projectLine: value,
        peoplePartnerLine: value,
        fullProfileAccessLine: value,
      });

      expect(result.reportingLine).toBe(false);
      expect(result.projectLine).toBe(false);
      expect(result.peoplePartnerLine).toBe(false);
      expect(result.fullProfileAccessLine).toBe(false);
    },
  );

  it('filters out unrecognized projectRoles entries (allowlist, not a denylist)', () => {
    const result = parseAccessRoleResolution({
      reportingLine: false,
      projectLine: true,
      projectRoles: [
        'ProjectManager',
        'SomeFutureRole',
        'admin',
        42,
        null,
        { role: 'DeliveryManager' },
      ],
    });

    expect(result.projectRoles).toEqual(['ProjectManager']);
  });

  it('treats a non-array projectRoles as empty, not a thrown error', () => {
    const result = parseAccessRoleResolution({
      reportingLine: true,
      projectRoles: 'ProjectManager',
    });

    expect(result.projectRoles).toEqual([]);
  });

  it('treats a missing projectRoles key as empty', () => {
    const result = parseAccessRoleResolution({ reportingLine: true });

    expect(result.projectRoles).toEqual([]);
  });
});

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

  it('2xx: parses the JSON body and calls the correct URL/query params', async () => {
    const body = {
      reportingLine: false,
      projectLine: true,
      projectRoles: ['DeliveryManager'],
      peoplePartnerLine: false,
      fullProfileAccessLine: false,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(body),
    });
    const adapter = new HttpAccessRoleResolutionAdapter(createConfig());

    const result = await adapter.resolve(VIEWER_ID, SUBJECT_ID);

    expect(result).toEqual(body);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(calledUrl.toString()).toBe(
      `${BASE_URL}/api/v1/access-roles/resolve?viewerPersonId=${VIEWER_ID}&subjectPersonId=${SUBJECT_ID}`,
    );
    expect(calledInit.method).toBe('GET');
    // A timeout signal is always attached -- see access-control-client.ts's own
    // RESOLVE_TIMEOUT_MS doc comment for why a fail-closed access decision must bound how long it
    // waits on the network.
    expect(calledInit.signal).toBeInstanceOf(AbortSignal);
  });

  it('non-2xx response: fails closed to NO_ACCESS_RESOLUTION, logged not thrown', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn(),
    });
    const adapter = new HttpAccessRoleResolutionAdapter(createConfig());

    const result = await adapter.resolve(VIEWER_ID, SUBJECT_ID);

    expect(result).toEqual(NO_ACCESS_RESOLUTION);
  });

  it('network error (fetch throws): fails closed to NO_ACCESS_RESOLUTION, logged not thrown', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const adapter = new HttpAccessRoleResolutionAdapter(createConfig());

    const result = await adapter.resolve(VIEWER_ID, SUBJECT_ID);

    expect(result).toEqual(NO_ACCESS_RESOLUTION);
  });

  it('a timed-out/aborted request fails closed to NO_ACCESS_RESOLUTION, logged not thrown', async () => {
    // Simulates what fetch does when its signal aborts (whether from AbortSignal.timeout firing
    // against a real hung connection, or any other abort) -- the adapter's single catch block must
    // treat this identically to any other network error, never let it propagate.
    fetchMock.mockRejectedValue(
      new DOMException('The operation was aborted.', 'TimeoutError'),
    );
    const adapter = new HttpAccessRoleResolutionAdapter(createConfig());

    const result = await adapter.resolve(VIEWER_ID, SUBJECT_ID);

    expect(result).toEqual(NO_ACCESS_RESOLUTION);
  });
});
