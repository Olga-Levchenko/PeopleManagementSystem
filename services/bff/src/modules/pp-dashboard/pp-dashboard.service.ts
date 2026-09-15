import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PPDashboardUpstreamResponse {
  status: number;
  body: unknown;
}

interface PPDashboardPersonMetadata {
  personId: string;
  fullName: string;
  department: { id: string; label: string } | null;
  projects: string[];
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
export class PPDashboardService {
  constructor(private readonly config: ConfigService) {}

  async getPPDashboard(
    peopleAuthorization?: string,
    wmsAuthorization?: string,
  ): Promise<PPDashboardUpstreamResponse> {
    try {
      const peopleBaseUrl =
        this.config.getOrThrow<string>('PEOPLE_SERVICE_URL');
      const wmsBaseUrl = this.config.getOrThrow<string>(
        'WORK_MANAGEMENT_SERVICE_URL',
      );

      // Step 1 — fetch People Service metadata; people-service gates this with the
      // view-dashboard/people-partner permission check and returns 403 if not granted.
      const metadataResponse = await fetch(
        `${peopleBaseUrl}/api/v1/internal/pp-dashboard/metadata`,
        {
          headers: peopleAuthorization
            ? { Authorization: peopleAuthorization }
            : {},
        },
      ).catch(() => null);

      if (!metadataResponse) {
        return { status: 502, body: { message: 'Request failed' } };
      }
      if (metadataResponse.status === 403) {
        return { status: 403, body: undefined };
      }
      if (!metadataResponse.ok) {
        return { status: 502, body: { message: 'Request failed' } };
      }

      const metadata = (await metadataResponse.json()) as {
        people: PPDashboardPersonMetadata[];
      };

      // Zero people means no PP relationship
      const people = metadata?.people ?? [];
      if (people.length === 0) {
        return { status: 403, body: undefined };
      }

      // Step 2 — fetch WMS risk rows (paginate, collect all)
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
      riskRows.push(...(riskPage.rows ?? []));

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
        riskRows.push(...(riskPage.rows ?? []));
      }

      // Step 3 — fetch own action items (session bearer forwarded unchanged)
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

      // Step 4 — compose response: left-join people with WMS risk rows
      const riskByPersonId = new Map(
        riskRows.map((row) => [row.personId, row]),
      );

      const rows = people.map((person) => {
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

      const headcount = people.length;

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
