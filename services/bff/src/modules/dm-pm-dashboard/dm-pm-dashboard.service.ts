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
    acsAuthorization?: string,
    peopleAuthorization?: string,
    wmsAuthorization?: string,
  ): Promise<DMPMDashboardUpstreamResponse> {
    try {
      const acsBaseUrl = this.config.getOrThrow<string>(
        'ACCESS_CONTROL_SERVICE_BASE_URL',
      );
      const peopleBaseUrl =
        this.config.getOrThrow<string>('PEOPLE_SERVICE_URL');
      const wmsBaseUrl = this.config.getOrThrow<string>(
        'WORK_MANAGEMENT_SERVICE_URL',
      );

      // Step 1 — fire both ACS permission checks in parallel (OR logic)
      const [dmResult, pmResult] = await Promise.allSettled([
        this.checkPermission(acsBaseUrl, 'delivery-manager', acsAuthorization),
        this.checkPermission(acsBaseUrl, 'project-manager', acsAuthorization),
      ]);

      const dmGranted = dmResult.status === 'fulfilled' && dmResult.value;
      const pmGranted = pmResult.status === 'fulfilled' && pmResult.value;

      if (!dmGranted && !pmGranted) {
        return { status: 403, body: undefined };
      }

      // Step 2 — fetch People Service metadata (projects where caller is DM or PM)
      const metadataResponse = await fetch(
        `${peopleBaseUrl}/api/v1/internal/dm-pm-dashboard/metadata`,
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
        projects: DMPMDashboardProjectMetadata[];
      };

      // Zero projects means no qualifying DM/PM relationship
      if (metadata.projects.length === 0) {
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

      // Step 4 — fetch own action items (session bearer forwarded unchanged)
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
        metadata.projects.flatMap((p) => p.people.map((person) => person.personId)),
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

  /**
   * Fires a single ACS permission check for `view-dashboard` scoped to the given dashboard type.
   * Returns true if granted, false on denial or any error (fail-closed).
   */
  private async checkPermission(
    acsBaseUrl: string,
    dashboardType: string,
    authorization?: string,
  ): Promise<boolean> {
    try {
      const response = await fetch(`${acsBaseUrl}/api/v1/permissions/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify({
          permissionKey: 'view-dashboard',
          scope: { dashboardType },
        }),
      });

      if (!response.ok) {
        return false;
      }

      const body = (await response.json().catch(() => null)) as {
        granted: boolean;
      } | null;
      return body?.granted === true;
    } catch {
      return false;
    }
  }
}
