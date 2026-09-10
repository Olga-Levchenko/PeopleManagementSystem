import { ConfigService } from '@nestjs/config';
import type { ProxyContext } from '../../custom-field-definitions/custom-field-definitions.service';
import { EmployeesService } from '../employees.service';

describe('EmployeesService', () => {
  const peopleServiceUrl = 'http://people-service.test';
  const context: ProxyContext = {
    authorization: 'Bearer verified-token',
    correlationId: 'test-correlation-id',
  };

  let service: EmployeesService;
  let fetchMock: jest.Spied<typeof fetch>;

  beforeEach(() => {
    service = new EmployeesService({
      getOrThrow: jest.fn().mockReturnValue(peopleServiceUrl),
    } as unknown as ConfigService);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: jest.fn().mockResolvedValue({ fields: [] }),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('routes field catalog to people-service', async () => {
    await service.fieldCatalog(context);

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(`${peopleServiceUrl}/api/v1/employees/field-catalog`);
    expect(call[1].method).toBe('GET');
  });

  it('routes list query params to people-service', async () => {
    await service.list(
      { page: '2', pageSize: '25', countryCity: 'Kyiv' },
      context,
    );

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(
      `${peopleServiceUrl}/api/v1/employees?page=2&pageSize=25&countryCity=Kyiv`,
    );
    expect(call[1].method).toBe('GET');
  });

  it('forwards years and custom field query params to people-service', async () => {
    await service.list(
      {
        page: '1',
        pageSize: '50',
        yearsWithCompanyMin: '2',
        yearsWithCompanyMax: '5',
        'custom:cf-desk': 'Standing',
      },
      context,
    );

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(
      `${peopleServiceUrl}/api/v1/employees?page=1&pageSize=50&yearsWithCompanyMin=2&yearsWithCompanyMax=5&custom%3Acf-desk=Standing`,
    );
  });
});
