import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  FunctionalRolesService,
  ProxyContext,
  UpstreamResponse,
} from '../functional-roles.service';

describe('FunctionalRolesService', () => {
  const accessControlUrl = 'http://access-control.test';
  const context: ProxyContext = {
    authorization: 'Bearer verified-token',
    correlationId: 'correlation-id',
  };
  let service: FunctionalRolesService;
  let fetchMock: jest.Spied<typeof fetch>;

  beforeEach(() => {
    service = new FunctionalRolesService({
      getOrThrow: jest.fn().mockReturnValue(accessControlUrl),
    } as unknown as ConfigService);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [
      'catalogue',
      () => service.getCatalogue(context),
      'GET',
      '/permissions/catalogue',
    ],
    ['roles', () => service.getRoles(context), 'GET', '/functional-roles'],
    [
      'role',
      () => service.getRole('security-owner', context),
      'GET',
      '/functional-roles/security-owner',
    ],
    [
      'create',
      () => service.createRole({ roleKey: 'security-owner' }, context),
      'POST',
      '/functional-roles',
    ],
    [
      'update',
      () => service.updateRole('security-owner', {}, context),
      'PATCH',
      '/functional-roles/security-owner',
    ],
    [
      'deactivate',
      () => service.deactivateRole('security-owner', {}, context),
      'POST',
      '/functional-roles/security-owner/deactivate',
    ],
    [
      'grant',
      () =>
        service.grantPermission(
          'security-owner',
          'view-dashboard',
          {},
          context,
        ),
      'PUT',
      '/functional-roles/security-owner/permissions/view-dashboard',
    ],
    [
      'revoke',
      () =>
        service.revokePermission(
          'security-owner',
          'view-dashboard',
          '{"dashboardType":"unit-manager"}',
          context,
        ),
      'DELETE',
      '/functional-roles/security-owner/permissions/view-dashboard?scope=%7B%22dashboardType%22%3A%22unit-manager%22%7D',
    ],
    [
      'assign',
      () =>
        service.assignRole('22222222-0000-0000-0000-000000000001', {}, context),
      'POST',
      '/people/22222222-0000-0000-0000-000000000001/functional-roles',
    ],
    [
      'revoke assignment',
      () =>
        service.revokeRole(
          '22222222-0000-0000-0000-000000000001',
          'security-owner',
          context,
        ),
      'DELETE',
      '/people/22222222-0000-0000-0000-000000000001/functional-roles/security-owner',
    ],
    [
      'assignments',
      () =>
        service.getAssignments('22222222-0000-0000-0000-000000000001', context),
      'GET',
      '/people/22222222-0000-0000-0000-000000000001/functional-roles',
    ],
  ] as const)(
    'maps the %s route to Access Control',
    async (
      _label: string,
      operation: () => Promise<UpstreamResponse>,
      method: string,
      path: string,
    ) => {
      await operation();

      const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(call[0]).toBe(`${accessControlUrl}/api/v1${path}`);
      expect(call[1].method).toBe(method);
      expect(call[1].headers).toEqual(
        expect.objectContaining({
          authorization: 'Bearer verified-token',
          'x-correlation-id': 'correlation-id',
        }),
      );
    },
  );

  it('forwards idempotency keys without forwarding actor identity', async () => {
    await service.assignRole(
      '22222222-0000-0000-0000-000000000001',
      { roleKey: 'security-owner' },
      { ...context, idempotencyKey: 'request-key' },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          accept: 'application/json',
          authorization: 'Bearer verified-token',
          'content-type': 'application/json',
          'idempotency-key': 'request-key',
          'x-correlation-id': 'correlation-id',
        },
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls[0])).not.toContain('actor');
  });

  it('maps upstream and network failures to safe errors', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 500,
      ok: false,
      headers: new Headers(),
    } as unknown as Response);

    await expect(service.getRoles(context)).rejects.toMatchObject({
      status: 503,
      response: {
        message: 'Access Control service is unavailable.',
      },
    });

    fetchMock.mockRejectedValueOnce(new Error('connection refused'));
    await expect(service.getRoles(context)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
