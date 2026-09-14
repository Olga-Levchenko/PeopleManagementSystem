import { ConfigService } from '@nestjs/config';
import { DMPMDashboardService } from '../dm-pm-dashboard.service';

describe('DMPMDashboardService', () => {
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

  const acsGranted = makeResponse({ granted: true });
  const acsDenied = makeResponse({ granted: false });

  const metadataWithProjects = makeResponse({
    projects: [
      {
        projectId: 'project-alpha',
        projectLabel: 'project-alpha',
        people: [
          {
            personId: 'person-1',
            fullName: 'Morgan Ellis',
            department: { id: 'dept-1', label: 'Engineering' },
            leaveStatus: null,
          },
        ],
      },
    ],
  });

  const metadataEmpty = makeResponse({ projects: [] });

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
        title: 'Review staffing',
        dueDate: '2026-09-20',
        status: 'open',
        isOverdue: false,
      },
      {
        id: 'ai-2',
        title: 'Submit plan',
        dueDate: '2026-09-15',
        status: 'open',
        isOverdue: true,
      },
    ],
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns 403 when both ACS checks deny', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(acsDenied)
      .mockResolvedValueOnce(acsDenied);

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({ status: 403, body: undefined });
  });

  it('proceeds when only DM check is granted', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(acsGranted) // DM check
      .mockResolvedValueOnce(acsDenied) // PM check
      .mockResolvedValueOnce(metadataWithProjects)
      .mockResolvedValueOnce(riskPage)
      .mockResolvedValueOnce(actionItemsResponse);

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    expect(result.status).toBe(200);
  });

  it('proceeds when only PM check is granted', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(acsDenied) // DM check
      .mockResolvedValueOnce(acsGranted) // PM check
      .mockResolvedValueOnce(metadataWithProjects)
      .mockResolvedValueOnce(riskPage)
      .mockResolvedValueOnce(actionItemsResponse);

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    expect(result.status).toBe(200);
  });

  it('returns 403 when ACS HTTP 5xx on both legs', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeResponse({}, 500))
      .mockResolvedValueOnce(makeResponse({}, 500));

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({ status: 403, body: undefined });
  });

  it('returns 403 when ACS throws network error on both legs', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('network'))
      .mockRejectedValueOnce(new Error('network'));

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({ status: 403, body: undefined });
  });

  it('grants access when one ACS leg throws and the other grants', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('network')) // DM throws
      .mockResolvedValueOnce(acsGranted) // PM grants
      .mockResolvedValueOnce(metadataWithProjects)
      .mockResolvedValueOnce(riskPage)
      .mockResolvedValueOnce(actionItemsResponse);

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    expect(result.status).toBe(200);
  });

  it('returns 403 when ACS returns invalid JSON on both legs', async () => {
    const badJsonResponse = {
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError('bad json')),
    } as unknown as Response;

    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(badJsonResponse)
      .mockResolvedValueOnce(badJsonResponse);

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({ status: 403, body: undefined });
  });

  it('returns 403 when projects array is empty after ACS grant', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(acsGranted)
      .mockResolvedValueOnce(acsDenied)
      .mockResolvedValueOnce(metadataEmpty);

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({ status: 403, body: undefined });
  });

  it('composes a full response with risk counts and action items', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(acsGranted)
      .mockResolvedValueOnce(acsDenied)
      .mockResolvedValueOnce(metadataWithProjects)
      .mockResolvedValueOnce(riskPage)
      .mockResolvedValueOnce(actionItemsResponse);

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    expect(body.totalPeople).toBe(1);
    expect((body.riskCounts as Record<string, number>).high).toBe(1);
    expect((body.actionItemCounts as Record<string, number>).open).toBe(2);
    expect((body.actionItemCounts as Record<string, number>).overdue).toBe(1);
    const projects = body.projects as Array<{
      projectId: string;
      rows: Array<{ personId: string; severity: string | null }>;
    }>;
    expect(projects).toHaveLength(1);
    expect(projects[0].rows[0].severity).toBe('high');
  });

  it('propagates null leaveStatus to the row when person has no active leave', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(acsGranted)
      .mockResolvedValueOnce(acsDenied)
      .mockResolvedValueOnce(
        makeResponse({
          projects: [
            {
              projectId: 'proj-x',
              projectLabel: 'proj-x',
              people: [
                {
                  personId: 'person-no-leave',
                  fullName: 'Pat Nguyen',
                  department: null,
                  leaveStatus: null,
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(makeResponse({ rows: [], nextCursor: null }))
      .mockResolvedValueOnce(makeResponse({ items: [] }));

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    expect(result.status).toBe(200);
    const body = result.body as Record<string, unknown>;
    const projects = body.projects as Array<{
      rows: Array<{ leaveStatus: string | null }>;
    }>;
    expect(projects[0].rows[0].leaveStatus).toBeNull();
  });

  it('returns 502 when People Service is unavailable', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(acsGranted)
      .mockResolvedValueOnce(acsDenied)
      .mockResolvedValueOnce(makeResponse({}, 503));

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({
      status: 502,
      body: { message: 'Request failed' },
    });
  });

  it('returns 502 when WMS risks endpoint is unavailable', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(acsGranted)
      .mockResolvedValueOnce(acsDenied)
      .mockResolvedValueOnce(metadataWithProjects)
      .mockResolvedValueOnce(makeResponse({}, 503));

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({
      status: 502,
      body: { message: 'Request failed' },
    });
  });

  it('returns 502 when WMS action-items endpoint is unavailable (distinct path from risks 5xx)', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(acsGranted)
      .mockResolvedValueOnce(acsDenied)
      .mockResolvedValueOnce(metadataWithProjects)
      .mockResolvedValueOnce(riskPage)
      .mockResolvedValueOnce(makeResponse({}, 503));

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    expect(result).toEqual({
      status: 502,
      body: { message: 'Request failed' },
    });
  });

  it('own action items are sorted by dueDate ascending in response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(acsGranted)
      .mockResolvedValueOnce(acsDenied)
      .mockResolvedValueOnce(metadataWithProjects)
      .mockResolvedValueOnce(riskPage)
      .mockResolvedValueOnce(
        makeResponse({
          items: [
            {
              id: 'ai-late',
              title: 'Late task',
              dueDate: '2026-09-30',
              status: 'open',
              isOverdue: false,
            },
            {
              id: 'ai-early',
              title: 'Early task',
              dueDate: '2026-09-05',
              status: 'open',
              isOverdue: true,
            },
          ],
        }),
      );

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    const body = result.body as Record<string, unknown>;
    const items = body.ownActionItems as Array<{ id: string }>;
    expect(items[0].id).toBe('ai-early');
    expect(items[1].id).toBe('ai-late');
  });

  it('counts in_progress items as open and excludes completed items from open count', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(acsGranted)
      .mockResolvedValueOnce(acsDenied)
      .mockResolvedValueOnce(metadataWithProjects)
      .mockResolvedValueOnce(riskPage)
      .mockResolvedValueOnce(
        makeResponse({
          items: [
            {
              id: 'ai-inprogress',
              title: 'In progress task',
              dueDate: '2026-09-25',
              status: 'in_progress',
              isOverdue: false,
            },
            {
              id: 'ai-completed',
              title: 'Done task',
              dueDate: '2026-09-10',
              status: 'completed',
              isOverdue: false,
            },
          ],
        }),
      );

    const service = new DMPMDashboardService(config);
    const result = await service.getDMPMDashboard(
      'Bearer acs',
      'Bearer people',
      'Bearer wms',
    );

    const body = result.body as Record<string, unknown>;
    const counts = body.actionItemCounts as Record<string, number>;
    expect(counts.open).toBe(1); // in_progress counts, completed does not
    expect(counts.overdue).toBe(0);
  });
});
