import { ConfigService } from '@nestjs/config';
import { UMDashboardService } from '../um-dashboard.service';

describe('UMDashboardService', () => {
  const config = {
    getOrThrow: jest.fn((key: string) => {
      switch (key) {
        case 'ACCESS_CONTROL_SERVICE_BASE_URL':
          return 'http://acs';
        case 'PEOPLE_SERVICE_URL':
          return 'http://people';
        case 'WORK_MANAGEMENT_SERVICE_URL':
          return 'http://wms';
        default:
          throw new Error(`Unknown config key: ${key}`);
      }
    }),
  } as unknown as ConfigService;

  const makeResponse = (body: unknown, status = 200) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: jest.fn().mockResolvedValue(body),
    }) as unknown as Response;

  const acsDenied = makeResponse({ granted: false });

  const metadataWithPeople = makeResponse({
    people: [
      {
        personId: 'person-1',
        fullName: 'Alex Brandt',
        department: { id: 'dept-1', label: 'Engineering' },
        projects: [{ id: 'proj-alpha', label: 'proj-alpha' }],
        leaveStatus: null,
      },
    ],
  });
  const metadataEmpty = makeResponse({ people: [] });

  const riskPage = makeResponse({
    rows: [
      {
        personId: 'person-1',
        severity: 'high',
        trendDirection: 'up',
        recordedAt: '2026-09-10',
      },
    ],
    nextCursor: null,
  });

  const actionItemsResponse = makeResponse({
    items: [
      {
        id: 'ai-1',
        title: 'Review performance',
        dueDate: '2026-09-20',
        status: 'open',
        isOverdue: false,
      },
      {
        id: 'ai-2',
        title: 'Submit report',
        dueDate: '2026-09-15',
        status: 'open',
        isOverdue: true,
      },
    ],
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns 403 when ACS returns granted: false', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(acsDenied);

    const service = new UMDashboardService(config);
    const result = await service.getUMDashboard(
      'Bearer token',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({ status: 403, body: undefined });
  });

  it('returns 403 when ACS is unavailable', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('network error'));

    const service = new UMDashboardService(config);
    const result = await service.getUMDashboard(
      'Bearer token',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({ status: 403, body: undefined });
  });

  it('returns 403 when caller has zero direct reports (no UM relationship)', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeResponse({ granted: true }))
      .mockResolvedValueOnce(metadataEmpty);

    const service = new UMDashboardService(config);
    const result = await service.getUMDashboard(
      'Bearer token',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({ status: 403, body: undefined });
  });

  it('composes a full response for a UM with subordinates', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeResponse({ granted: true }))
      .mockResolvedValueOnce(
        makeResponse({
          people: [
            {
              personId: 'person-1',
              fullName: 'Alex Brandt',
              department: { id: 'dept-1', label: 'Engineering' },
              projects: [{ id: 'proj-alpha', label: 'proj-alpha' }],
              leaveStatus: null,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(riskPage)
      .mockResolvedValueOnce(actionItemsResponse);

    const service = new UMDashboardService(config);
    const result = await service.getUMDashboard(
      'Bearer token',
      'Bearer people',
      'Bearer wms',
    );

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.headcount).toBe(1);
    expect((body.riskCounts as Record<string, number>).high).toBe(1);
    expect((body.actionItemCounts as Record<string, number>).open).toBe(2);
    expect((body.actionItemCounts as Record<string, number>).overdue).toBe(1);
    expect(Array.isArray(body.rows)).toBe(true);
    expect((body.rows as unknown[]).length).toBe(1);
  });

  it('includes all direct reports in rows — subordinates without a risk row use null severity', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeResponse({ granted: true }))
      .mockResolvedValueOnce(
        makeResponse({
          people: [
            {
              personId: 'person-no-risk',
              fullName: 'Jordan Lee',
              department: null,
              projects: [],
              leaveStatus: 'Annual Leave',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(makeResponse({ rows: [], nextCursor: null }))
      .mockResolvedValueOnce(makeResponse({ items: [] }));

    const service = new UMDashboardService(config);
    const result = await service.getUMDashboard(
      'Bearer token',
      'Bearer people',
      'Bearer wms',
    );

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const rows = body.rows as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    expect(rows[0].severity).toBeNull();
    expect(rows[0].leaveStatus).toBe('Annual Leave');
  });

  it('returns 502 when People Service is unavailable', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeResponse({ granted: true }))
      .mockResolvedValueOnce(makeResponse({}, 503));

    const service = new UMDashboardService(config);
    const result = await service.getUMDashboard(
      'Bearer token',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({
      status: 502,
      body: { message: 'Request failed' },
    });
  });

  it('returns 502 when WMS risk endpoint is unavailable', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeResponse({ granted: true }))
      .mockResolvedValueOnce(metadataWithPeople)
      .mockResolvedValueOnce(makeResponse({}, 503));

    const service = new UMDashboardService(config);
    const result = await service.getUMDashboard(
      'Bearer token',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({
      status: 502,
      body: { message: 'Request failed' },
    });
  });

  it('returns 502 when WMS action-items endpoint is unavailable (distinct from risks 5xx)', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeResponse({ granted: true }))
      .mockResolvedValueOnce(metadataWithPeople)
      .mockResolvedValueOnce(riskPage)
      .mockResolvedValueOnce(makeResponse({}, 503));

    const service = new UMDashboardService(config);
    const result = await service.getUMDashboard(
      'Bearer token',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({
      status: 502,
      body: { message: 'Request failed' },
    });
  });

  it('returns 403 when ACS returns a 5xx error status', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(makeResponse({}, 500));

    const service = new UMDashboardService(config);
    const result = await service.getUMDashboard(
      'Bearer token',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({ status: 403, body: undefined });
  });

  it('passes leaveStatus null through to the row when person has no active leave', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeResponse({ granted: true }))
      .mockResolvedValueOnce(
        makeResponse({
          people: [
            {
              personId: 'person-1',
              fullName: 'Alex Brandt',
              department: null,
              projects: [],
              leaveStatus: null,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(makeResponse({ rows: [], nextCursor: null }))
      .mockResolvedValueOnce(makeResponse({ items: [] }));

    const service = new UMDashboardService(config);
    const result = await service.getUMDashboard(
      'Bearer token',
      'Bearer people',
      'Bearer wms',
    );

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const rows = body.rows as Array<Record<string, unknown>>;
    expect(rows[0].leaveStatus).toBeNull();
  });

  it('own action items are sorted by dueDate ascending in response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeResponse({ granted: true }))
      .mockResolvedValueOnce(metadataWithPeople)
      .mockResolvedValueOnce(riskPage)
      .mockResolvedValueOnce(
        makeResponse({
          items: [
            {
              id: 'ai-late',
              title: 'Late',
              dueDate: '2026-09-30',
              status: 'open',
              isOverdue: false,
            },
            {
              id: 'ai-early',
              title: 'Early',
              dueDate: '2026-09-05',
              status: 'open',
              isOverdue: true,
            },
          ],
        }),
      );

    const service = new UMDashboardService(config);
    const result = await service.getUMDashboard(
      'Bearer token',
      'Bearer people',
      'Bearer wms',
    );

    const body = result.body as Record<string, unknown>;
    const items = body.ownActionItems as Array<{ id: string }>;
    expect(items[0].id).toBe('ai-early');
    expect(items[1].id).toBe('ai-late');
  });
});
