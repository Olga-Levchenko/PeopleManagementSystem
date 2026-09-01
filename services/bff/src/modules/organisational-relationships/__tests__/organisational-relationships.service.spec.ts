import { ConfigService } from '@nestjs/config';
import { OrganisationalRelationshipsService } from '../organisational-relationships.service';

describe('OrganisationalRelationshipsService', () => {
  const peopleServiceUrl = 'http://people-service.test';
  let service: OrganisationalRelationshipsService;
  let fetchMock: jest.Spied<typeof fetch>;

  beforeEach(() => {
    service = new OrganisationalRelationshipsService({
      getOrThrow: jest.fn().mockReturnValue(peopleServiceUrl),
    } as unknown as ConfigService);
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      status: 422,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: jest.fn().mockResolvedValue({ message: 'safe upstream error' }),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [
      'manager',
      'changeManager',
      'people/person-id/manager',
      { relatedPersonId: 'manager-id' },
    ],
    [
      'People Partner',
      'changePeoplePartner',
      'people/person-id/people-partner',
      { relatedPersonId: 'partner-id' },
    ],
    [
      'department',
      'changeDepartment',
      'people/person-id/department',
      { departmentId: 'department-id' },
    ],
    [
      'department manager',
      'changeDepartmentManager',
      'departments/department-id/manager',
      { relatedPersonId: 'manager-id' },
    ],
  ] as const)(
    'proxies a %s change to the People service',
    async (_label, method, path, body) => {
      await service[method](
        path.startsWith('departments') ? 'department-id' : 'person-id',
        body,
        'Bearer original-token',
      );

      expect(fetchMock).toHaveBeenCalledWith(
        `${peopleServiceUrl}/api/v1/organisational-relationships/${path}`,
        expect.objectContaining({
          method: 'PATCH',
          headers: {
            authorization: 'Bearer original-token',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        }),
      );
    },
  );

  it('preserves the upstream status and safe JSON error body', async () => {
    const result = await service.changeManager(
      'person-id',
      { relatedPersonId: 'manager-id' },
      'Bearer original-token',
    );

    expect(result).toEqual({
      status: 422,
      body: { message: 'safe upstream error' },
    });
  });

  it('does not create actor headers when no Authorization header is supplied', async () => {
    await service.changeManager('person-id', { relatedPersonId: 'manager-id' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          'content-type': 'application/json',
        },
      }),
    );
    expect(JSON.stringify(fetchMock.mock.calls[0]?.[1])).not.toContain('actor');
  });
});
