import { ConfigService } from '@nestjs/config';
import { RiskDashboardService } from '../risk-dashboard.service';

describe('RiskDashboardService', () => {
  const config = {
    getOrThrow: jest.fn((key: string) =>
      key === 'WORK_MANAGEMENT_SERVICE_URL' ? 'http://wms' : 'http://people',
    ),
  } as unknown as ConfigService;
  const response = (body: unknown, status = 200) =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: jest.fn().mockResolvedValue(body),
    }) as unknown as Response;

  afterEach(() => jest.restoreAllMocks());

  it('composes only WMS-authorized IDs and applies People metadata filters before counts', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        response({
          counts: {},
          rows: [
            {
              personId: 'a',
              severity: 'high',
              recordedAt: '2026-09-01',
              trendDirection: 'up',
            },
            {
              personId: 'b',
              severity: 'low',
              recordedAt: '2026-09-02',
              trendDirection: null,
            },
          ],
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(
        response({
          people: [
            {
              personId: 'a',
              fullName: 'A',
              department: { id: 'engineering', label: 'Engineering' },
              projects: [],
              manager: null,
              peoplePartner: null,
            },
          ],
        }),
      );
    const service = new RiskDashboardService(config);
    await expect(
      service.getDashboard(
        { departmentId: 'engineering' },
        'Bearer wms',
        'Bearer people',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 200,
        body: expect.objectContaining({
          counts: expect.objectContaining({ high: 1, activeCount: 1 }),
          rows: [expect.objectContaining({ personId: 'a', fullName: 'A' })],
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      '/api/v1/internal/risk-dashboard/metadata',
    );
  });

  it('reads all WMS pages before applying metadata filters and BFF pagination', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        response({
          counts: {},
          rows: [
            {
              personId: 'a',
              severity: 'high',
              recordedAt: '2026-09-01',
              trendDirection: 'up',
            },
          ],
          nextCursor: 'wms-cursor',
        }),
      )
      .mockResolvedValueOnce(
        response({
          counts: {},
          rows: [
            {
              personId: 'b',
              severity: 'medium',
              recordedAt: '2026-09-02',
              trendDirection: null,
            },
          ],
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(
        response({
          people: [
            {
              personId: 'a',
              fullName: 'A',
              department: null,
              projects: [],
              manager: null,
              peoplePartner: null,
            },
            {
              personId: 'b',
              fullName: 'B',
              department: null,
              projects: [],
              manager: null,
              peoplePartner: null,
            },
          ],
        }),
      );

    const service = new RiskDashboardService(config);

    await expect(
      service.getDashboard({ pageSize: '1' }, 'Bearer wms', 'Bearer people'),
    ).resolves.toEqual(
      expect.objectContaining({
        status: 200,
        body: expect.objectContaining({
          rows: [expect.objectContaining({ personId: 'a' })],
          nextCursor: expect.any(String),
        }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1][0])).toContain('cursor=wms-cursor');
  });

  it('preserves uniform empty-body authorization denial', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(response({}, 403));
    await expect(
      new RiskDashboardService(config).getDashboard({}, 'Bearer token'),
    ).resolves.toEqual({ status: 403, body: undefined });
  });

  it('returns a generic non-data failure when People metadata cannot be loaded', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        response({
          counts: {},
          rows: [
            {
              personId: 'a',
              severity: 'high',
              recordedAt: '2026-09-01',
              trendDirection: 'up',
            },
          ],
          nextCursor: null,
        }),
      )
      .mockResolvedValueOnce(response({}, 503));

    await expect(
      new RiskDashboardService(config).getDashboard(
        {},
        'Bearer wms',
        'Bearer people',
      ),
    ).resolves.toEqual({
      status: 502,
      body: { message: 'Request failed' },
    });
  });
});
