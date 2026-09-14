import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface UMDashboardUpstreamResponse {
  status: number;
  body: unknown;
}

interface UMDashboardPersonMetadata {
  personId: string;
  fullName: string;
  department: { id: string; label: string } | null;
  projects: Array<{ id: string; label: string }>;
  leaveStatus: string | null;
}

interface WmsRiskRow {
  personId: string;
  severity: string;
  trendDirection: string | null;
  recordedAt: string | null;
}

interface WmsActionItem {
  id: string;
  title: string;
  dueDate: string;
  status: string;
  isOverdue: boolean;
}

@Injectable()
export class UMDashboardService {
  constructor(private readonly config: ConfigService) {}

  async getUMDashboard(
    authorization?: string,
    peopleAuthorization?: string,
    wmsAuthorization?: string,
  ): Promise<UMDashboardUpstreamResponse> {
    try {
      const acsBaseUrl = this.config.getOrThrow<string>(
        'ACCESS_CONTROL_SERVICE_BASE_URL',
      );
      const peopleBaseUrl =
        this.config.getOrThrow<string>('PEOPLE_SERVICE_URL');
      const wmsBaseUrl = this.config.getOrThrow<string>(
        'WORK_MANAGEMENT_SERVICE_URL',
      );

      // Step 1 — functional permission check: view-dashboard / unit-manager
      const permCheckResponse = await fetch(
        `${acsBaseUrl}/api/v1/permissions/check`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authorization ? { Authorization: authorization } : {}),
          },
          body: JSON.stringify({
            permissionKey: 'view-dashboard',
            scope: { dashboardType: 'unit-manager' },
          }),
        },
      ).catch(() => null);

      if (!permCheckResponse || !permCheckResponse.ok) {
        return { status: 403, body: undefined };
      }

      const permCheckBody = (await permCheckResponse
        .json()
        .catch(() => null)) as { granted: boolean } | null;
      if (!permCheckBody?.granted) {
        return { status: 403, body: undefined };
      }

      // Step 2 — fetch People Service metadata (direct reports of caller)
      const metadataResponse = await fetch(
        `${peopleBaseUrl}/api/v1/internal/um-dashboard/metadata`,
        {
          headers: peopleAuthorization
            ? { Authorization: peopleAuthorization }
            : {},
        },
      ).catch(() => null);

      if (!metadataResponse || !metadataResponse.ok) {
        return { status: 502, body: { message: 'Request failed' } };
      }

      const metadata = (await metadataResponse.json()) as {
        people: UMDashboardPersonMetadata[];
      };

      // Zero direct reports definitively means the caller has no UM reporting-line relationship
      if (metadata.people.length === 0) {
        return { status: 403, body: undefined };
      }

      // Step 3 — fetch WMS risk rows (paginate, collect all)
      const riskRows: WmsRiskRow[] = [];
      const riskUrl = new URL('/api/v1/risks/dashboard', wmsBaseUrl);
      riskUrl.searchParams.set('pageSize', '100');

      let riskResponse = await fetch(riskUrl, {
        headers: wmsAuthorization ? { Authorization: wmsAuthorization } : {},
      }).catch(() => null);

      if (!riskResponse || !riskResponse.ok) {
        return { status: 502, body: { message: 'Request failed' } };
      }

      let riskPage = (await riskResponse.json()) as {
        rows: WmsRiskRow[];
        nextCursor: string | null;
      };
      riskRows.push(...riskPage.rows);

      let riskPageCount = 0;
      while (riskPage.nextCursor && riskPageCount < 50) {
        riskPageCount++;
        riskUrl.searchParams.set('cursor', riskPage.nextCursor);
        riskResponse = await fetch(riskUrl, {
          headers: wmsAuthorization ? { Authorization: wmsAuthorization } : {},
        }).catch(() => null);

        if (!riskResponse || !riskResponse.ok) {
          return { status: 502, body: { message: 'Request failed' } };
        }

        riskPage = (await riskResponse.json()) as typeof riskPage;
        riskRows.push(...riskPage.rows);
      }

      // Step 4 — fetch own action items
      const actionItemsResponse = await fetch(
        `${wmsBaseUrl}/api/v1/action-items/mine`,
        {
          headers: wmsAuthorization ? { Authorization: wmsAuthorization } : {},
        },
      ).catch(() => null);

      if (!actionItemsResponse || !actionItemsResponse.ok) {
        return { status: 502, body: { message: 'Request failed' } };
      }

      const actionItemsBody = (await actionItemsResponse.json()) as {
        items: WmsActionItem[];
      };
      const ownActionItems: WmsActionItem[] = actionItemsBody.items ?? [];

      // Step 5 — compose response
      const riskByPersonId = new Map(
        riskRows.map((row) => [row.personId, row]),
      );

      const rows = metadata.people.map((person) => {
        const risk = riskByPersonId.get(person.personId);
        return {
          personId: person.personId,
          fullName: person.fullName,
          department: person.department,
          projects: person.projects,
          leaveStatus: person.leaveStatus,
          severity: risk?.severity ?? null,
          trendDirection: risk?.trendDirection ?? 'none',
          recordedAt: risk?.recordedAt ?? null,
        };
      });

      const headcount = metadata.people.length;

      const riskCounts: Record<string, number> = {
        low: 0,
        need_attention: 0,
        medium: 0,
        high: 0,
        leaver: 0,
      };
      for (const row of rows) {
        if (row.severity && row.severity in riskCounts) {
          riskCounts[row.severity] += 1;
        }
      }

      const actionItemCounts = {
        open: ownActionItems.filter((item) => item.status !== 'completed')
          .length,
        overdue: ownActionItems.filter((item) => item.isOverdue).length,
      };

      const sortedActionItems = [...ownActionItems].sort((a, b) =>
        a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0,
      );

      return {
        status: 200,
        body: {
          headcount,
          riskCounts,
          actionItemCounts,
          rows,
          ownActionItems: sortedActionItems,
        },
      };
    } catch {
      return { status: 502, body: { message: 'Request failed' } };
    }
  }
}
