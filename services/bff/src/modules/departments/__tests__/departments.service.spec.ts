import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DepartmentsService, ProxyContext } from '../departments.service';

describe('DepartmentsService', () => {
  const peopleServiceUrl = 'http://people-service.test';
  const context: ProxyContext = {
    authorization: 'Bearer verified-token',
    correlationId: 'test-correlation-id',
  };

  let service: DepartmentsService;
  let fetchMock: jest.Spied<typeof fetch>;

  beforeEach(() => {
    service = new DepartmentsService({
      getOrThrow: jest.fn().mockReturnValue(peopleServiceUrl),
    } as unknown as ConfigService);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    } as unknown as Response);
  });

  afterEach(() => jest.restoreAllMocks());

  it('calls people-service /departments without query when name is undefined', async () => {
    await service.search(undefined, context);

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${peopleServiceUrl}/api/v1/departments`);
  });

  it('appends encoded name query param when name is provided', async () => {
    await service.search('Eng & Tech', context);

    const [url] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      `${peopleServiceUrl}/api/v1/departments?name=Eng%20%26%20Tech`,
    );
  });

  it('forwards authorization and correlation-id headers', async () => {
    await service.search('test', context);

    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect((init.headers as Record<string, string>)['authorization']).toBe(
      'Bearer verified-token',
    );
    expect((init.headers as Record<string, string>)['x-correlation-id']).toBe(
      'test-correlation-id',
    );
  });

  it('maps network failure to ServiceUnavailableException', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection refused'));

    await expect(service.search(undefined, context)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('maps upstream 5xx to 503', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 500,
      ok: false,
    } as unknown as Response);

    await expect(service.search(undefined, context)).rejects.toMatchObject({
      status: 503,
    });
  });

  it('maps upstream 403 through unchanged', async () => {
    fetchMock.mockResolvedValueOnce({
      status: 403,
      ok: false,
    } as unknown as Response);

    await expect(service.search(undefined, context)).rejects.toMatchObject({
      status: 403,
    });
  });
});
