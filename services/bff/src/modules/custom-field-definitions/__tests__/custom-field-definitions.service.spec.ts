import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CustomFieldDefinitionsService,
  ProxyContext,
  UpstreamResponse,
} from '../custom-field-definitions.service';

describe('CustomFieldDefinitionsService', () => {
  const peopleServiceUrl = 'http://people-service.test';
  const context: ProxyContext = {
    authorization: 'Bearer verified-token',
    correlationId: 'test-correlation-id',
  };

  let service: CustomFieldDefinitionsService;
  let fetchMock: jest.Spied<typeof fetch>;

  beforeEach(() => {
    service = new CustomFieldDefinitionsService({
      getOrThrow: jest.fn().mockReturnValue(peopleServiceUrl),
    } as unknown as ConfigService);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: jest.fn().mockResolvedValue([]),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['list', () => service.list(context), 'GET', '/custom-field-definitions'],
    [
      'create',
      () =>
        service.create(
          { name: 'Level', dataType: 'TEXT', visibility: 'MANAGEMENT' },
          context,
        ),
      'POST',
      '/custom-field-definitions',
    ],
    [
      'update',
      () => service.update('some-uuid', { name: 'Seniority' }, context),
      'PATCH',
      '/custom-field-definitions/some-uuid',
    ],
    [
      'deactivate',
      () => service.deactivate('some-uuid', context),
      'DELETE',
      '/custom-field-definitions/some-uuid',
    ],
  ] as const)(
    'routes the %s operation to people-service',
    async (
      _label: string,
      operation: () => Promise<UpstreamResponse>,
      method: string,
      path: string,
    ) => {
      await operation();

      const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(call[0]).toBe(`${peopleServiceUrl}/api/v1${path}`);
      expect(call[1].method).toBe(method);
      expect((call[1].headers as Record<string, string>)['authorization']).toBe(
        'Bearer verified-token',
      );
      expect(
        (call[1].headers as Record<string, string>)['x-correlation-id'],
      ).toBe('test-correlation-id');
    },
  );

  it('maps network failure to ServiceUnavailableException', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));

    await expect(service.list(context)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('maps upstream 5xx to 503', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 500,
      ok: false,
      headers: new Headers(),
    } as unknown as Response);

    await expect(service.list(context)).rejects.toMatchObject({ status: 503 });
  });

  it('maps upstream 403 through unchanged', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 403,
      ok: false,
      headers: new Headers(),
    } as unknown as Response);

    await expect(service.list(context)).rejects.toMatchObject({ status: 403 });
  });
});
