import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenExchangeService } from '../../auth/service-token-exchange.service';
import { HttpRisksPermissionsCheckAdapter } from '../permissions-client';

describe('HttpRisksPermissionsCheckAdapter', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let exchangeMock: jest.MockedFunction<
    ServiceTokenExchangeService['exchangeForAccessControl']
  >;
  let adapter: HttpRisksPermissionsCheckAdapter;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    exchangeMock = jest.fn().mockResolvedValue('exchanged-token');
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    adapter = new HttpRisksPermissionsCheckAdapter(
      new ConfigService({
        ACCESS_CONTROL_SERVICE_BASE_URL: 'http://access-control-service.test',
      }),
      {
        exchangeForAccessControl: exchangeMock,
      } as unknown as ServiceTokenExchangeService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('checks the risk permission with the exchanged token and shared deadline', async () => {
    fetchMock.mockResolvedValue(Response.json({ granted: true }));

    await expect(
      adapter.hasCreateEditRisksPermission('subject-token'),
    ).resolves.toBe(true);
    expect(exchangeMock).toHaveBeenCalledWith(
      'subject-token',
      expect.any(AbortSignal),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://access-control-service.test/api/v1/permissions/check'),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer exchanged-token',
        },
        body: JSON.stringify({
          permissionKey: 'create-edit-risks',
          scope: null,
        }),
        signal: exchangeMock.mock.calls[0][1],
      },
    );
  });

  it('allows dashboard access when any supported dashboard permission scope is granted', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ granted: false }))
      .mockResolvedValueOnce(Response.json({ granted: false }))
      .mockResolvedValueOnce(Response.json({ granted: true }));

    await expect(
      adapter.hasViewDashboardPermission('subject-token'),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const requestBodies: unknown[] = fetchMock.mock.calls.map(([, init]) => {
      const body = init?.body;
      expect(typeof body).toBe('string');
      const parsed: unknown = JSON.parse(body);
      return parsed;
    });

    expect(requestBodies).toEqual([
      {
        permissionKey: 'view-dashboard',
        scope: { dashboardType: 'unit-manager' },
      },
      {
        permissionKey: 'view-dashboard',
        scope: { dashboardType: 'delivery-manager' },
      },
      {
        permissionKey: 'view-dashboard',
        scope: { dashboardType: 'project-manager' },
      },
    ]);
  });

  it('denies dashboard access when no supported dashboard permission scope is granted', async () => {
    fetchMock.mockResolvedValue(Response.json({ granted: false }));

    await expect(
      adapter.hasViewDashboardPermission('subject-token'),
    ).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it.each([false, 'true', 1, null])(
    'denies a non-true grant %p',
    async (granted) => {
      fetchMock.mockResolvedValue(Response.json({ granted }));
      await expect(adapter.hasCreateEditRisksPermission('token')).resolves.toBe(
        false,
      );
    },
  );

  it.each([{}, null, [], 'invalid'])(
    'fails closed for malformed body %p',
    async (body) => {
      fetchMock.mockResolvedValue(Response.json(body));
      await expect(adapter.hasCreateEditRisksPermission('token')).resolves.toBe(
        false,
      );
    },
  );

  it.each([401, 403, 500, 503])(
    'fails closed for HTTP %i even with a granted body',
    async (status) => {
      fetchMock.mockResolvedValue(Response.json({ granted: true }, { status }));
      await expect(adapter.hasCreateEditRisksPermission('token')).resolves.toBe(
        false,
      );
    },
  );

  it('fails closed for invalid JSON', async () => {
    fetchMock.mockResolvedValue(new Response('{invalid'));
    await expect(adapter.hasCreateEditRisksPermission('token')).resolves.toBe(
      false,
    );
  });

  it.each([
    new TypeError('network failure'),
    new DOMException('timed out', 'TimeoutError'),
  ])('fails closed for transport failure %p', async (error) => {
    fetchMock.mockRejectedValue(error);
    await expect(adapter.hasCreateEditRisksPermission('token')).resolves.toBe(
      false,
    );
  });

  it('fails closed without calling ACS when token exchange fails', async () => {
    exchangeMock.mockRejectedValue(new Error('token exchange unavailable'));
    await expect(adapter.hasCreateEditRisksPermission('token')).resolves.toBe(
      false,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
