import { ConfigService } from '@nestjs/config';
import { ManagementNotesService } from '../management-notes.service';

describe('ManagementNotesService', () => {
  const workManagementServiceUrl = 'http://work-management-service.test';
  let service: ManagementNotesService;
  let fetchMock: jest.Spied<typeof fetch>;

  beforeEach(() => {
    service = new ManagementNotesService({
      getOrThrow: jest.fn().mockReturnValue(workManagementServiceUrl),
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

  it('proxies a list request, forwarding subjectPersonId as a query param', async () => {
    await service.listNotes('subject-id', 'Bearer original-token');

    expect(fetchMock).toHaveBeenCalledWith(
      `${workManagementServiceUrl}/api/v1/management-notes?subjectPersonId=subject-id`,
      expect.objectContaining({
        method: 'GET',
        headers: { authorization: 'Bearer original-token' },
        body: undefined,
      }),
    );
  });

  it('proxies a create request to Work Management', async () => {
    const body = { subjectPersonId: 'subject-id', content: 'note' };
    await service.createNote(body, 'Bearer original-token');

    expect(fetchMock).toHaveBeenCalledWith(
      `${workManagementServiceUrl}/api/v1/management-notes`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer original-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    );
  });

  it('proxies an update request to Work Management', async () => {
    const body = { visibleForPm: true };
    await service.updateNote('note-id', body, 'Bearer original-token');

    expect(fetchMock).toHaveBeenCalledWith(
      `${workManagementServiceUrl}/api/v1/management-notes/note-id`,
      expect.objectContaining({
        method: 'PATCH',
        headers: {
          authorization: 'Bearer original-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
    );
  });

  it('preserves the upstream status and safe JSON error body', async () => {
    const result = await service.createNote(
      { subjectPersonId: 'subject-id', content: 'note' },
      'Bearer original-token',
    );

    expect(result).toEqual({
      status: 422,
      body: { message: 'safe upstream error' },
    });
  });

  it('does not set an authorization header when none is supplied', async () => {
    await service.listNotes('subject-id');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {},
      }),
    );
  });
});
