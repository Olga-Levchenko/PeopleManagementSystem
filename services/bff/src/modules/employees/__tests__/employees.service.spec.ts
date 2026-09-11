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

  it('routes saved views list to people-service', async () => {
    await service.listSavedViews(context);

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(`${peopleServiceUrl}/api/v1/employees/saved-views`);
    expect(call[1].method).toBe('GET');
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

  it('routes profile GET to people-service profile endpoint', async () => {
    const subjectPersonId = '22222222-2222-4222-8222-222222222222';
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: jest
        .fn()
        .mockResolvedValue({ s1: { fullName: 'Subject Person' }, s16: [] }),
    } as unknown as Response);

    const result = await service.getProfile(subjectPersonId, context);

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(
      `${peopleServiceUrl}/api/v1/people/${subjectPersonId}/profile`,
    );
    expect(call[1].method).toBe('GET');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      s1: { fullName: 'Subject Person' },
      s16: [],
    });
  });

  it('routes PATCH field updates to people-service profile endpoint', async () => {
    const subjectPersonId = '22222222-2222-4222-8222-222222222222';
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: jest
        .fn()
        .mockResolvedValue({ fieldKey: 'countryCity', value: 'Lviv' }),
    } as unknown as Response);

    const result = await service.patchField(
      subjectPersonId,
      { fieldKey: 'countryCity', value: 'Lviv' },
      context,
    );

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(
      `${peopleServiceUrl}/api/v1/people/${subjectPersonId}/profile/fields`,
    );
    expect(call[1].method).toBe('PATCH');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ fieldKey: 'countryCity', value: 'Lviv' });
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

  it('routes export query params to people-service and preserves binary headers', async () => {
    fetchMock.mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({
        'content-type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="employees-export.xlsx"',
      }),
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as Response);

    const result = await service.exportEmployees(
      { columns: 'fullName,position', countryCity: 'Kyiv' },
      context,
    );

    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe(
      `${peopleServiceUrl}/api/v1/employees/export?columns=fullName%2Cposition&countryCity=Kyiv`,
    );
    expect(result.headers['content-disposition']).toContain(
      'employees-export.xlsx',
    );
    expect(result.body).toBeInstanceOf(Buffer);
  });

  it('passes through upstream JSON validation errors from export', async () => {
    const upstreamError = {
      statusCode: 400,
      message: "Column key 'not-in-catalog' is not in the viewer catalog.",
    };
    const payload = Buffer.from(JSON.stringify(upstreamError));
    fetchMock.mockResolvedValue({
      status: 400,
      ok: false,
      headers: new Headers({ 'content-type': 'application/json' }),
      arrayBuffer: jest
        .fn()
        .mockResolvedValue(
          payload.buffer.slice(
            payload.byteOffset,
            payload.byteOffset + payload.byteLength,
          ),
        ),
    } as unknown as Response);

    await expect(
      service.exportEmployees({ columns: 'not-in-catalog' }, context),
    ).rejects.toMatchObject({
      response: upstreamError,
    });
  });
});
