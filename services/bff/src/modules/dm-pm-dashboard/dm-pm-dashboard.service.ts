import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface DMPMDashboardUpstreamResponse {
  status: number;
  body: unknown;
}

interface DMPMDashboardPersonMetadata {
  personId: string;
  fullName: string;
  department: { id: string; label: string } | null;
  leaveStatus: string | null;
}

interface DMPMDashboardProjectMetadata {
  projectId: string;
  projectLabel: string;
  people: DMPMDashboardPersonMetadata[];
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
export class DMPMDashboardService {
  constructor(private readonly config: ConfigService) {}

  async getDMPMDashboard(
    peopleAuthorization?: string,
    wmsAuthorization?: string,
  ): Promise<DMPMDashboardUpstreamResponse> {
    try {
      const peopleBaseUrl =
        this.config.getOrThrow<string>('PEOPLE_SERVICE_URL');
      const wmsBaseUrl = this.config.getOrThrow<string>(
        'WORK_MANAGEMENT_SERVICE_URL',
      );

      // Step 1 — fetch People Service metadata; people-service gates this with the
      // view-dashboard/delivery-manager OR view-dashboard/project-manager permission
      // check and returns 403 if neither is granted.
      const metadataResponse = await fetch(
        `${peopleBaseUrl}/api/v1/internal/dm-pm-dashboard/metadata`,
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
        projects: DMPMDashboardProjectMetadata[];
      };

      // Zero projects means no qualifying DM/PM relationship
      if (metadata.projects.length === 0) {
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

      // Step 4 — compose response
      const riskByPersonId = new Map(
        riskRows.map((row) => [row.personId, row]),
      );

      const projectRows = metadata.projects.map((project) => ({
        projectId: project.projectId,
        projectLabel: project.projectLabel,
        rows: project.people.map((person) => {
          const risk = riskByPersonId.get(person.personId);
          return {
            personId: person.personId,
            fullName: person.fullName,
            leaveStatus: person.leaveStatus,
            severity: risk?.severity ?? null,
            trendDirection: risk?.trendDirection ?? 'none',
          };
        }),
      }));

      // Aggregate counts across all projects (people may appear in multiple projects)
      const allPersonIds = new Set(
        metadata.projects.flatMap((p) =>
          p.people.map((person) => person.personId),
        ),
      );

      const totalPeople = allPersonIds.size;

      const riskCounts: Record<string, number> = {
        low: 0,
        need_attention: 0,
        medium: 0,
        high: 0,
        leaver: 0,
      };
      for (const personId of allPersonIds) {
        const risk = riskByPersonId.get(personId);
        if (risk?.severity && risk.severity in riskCounts) {
          riskCounts[risk.severity] += 1;
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
          totalPeople,
          riskCounts,
          actionItemCounts,
          projects: projectRows,
          ownActionItems: sortedActionItems,
        },
      };
    } catch {
      return { status: 502, body: { message: 'Request failed' } };
    }
  }

}
