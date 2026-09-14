import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RiskDashboardUpstreamResponse { status: number; body: unknown }

@Injectable()
export class RiskDashboardService {
  constructor(private readonly config: ConfigService) {}

  async getDashboard(query: Record<string, string | undefined>, authorization?: string, peopleAuthorization?: string): Promise<RiskDashboardUpstreamResponse> {
    try {
      const baseUrl = this.config.getOrThrow<string>('WORK_MANAGEMENT_SERVICE_URL');
      const url = new URL('/api/v1/risks/dashboard', baseUrl);
      // People-owned metadata filters cannot safely be forwarded to WMS. Read the complete
      // WMS-authorized set first, then intersect it with metadata below.
      for (const [key, value] of Object.entries(query)) if (value && !['departmentId', 'projectId', 'peoplePartnerId', 'managerId', 'cursor', 'pageSize'].includes(key)) url.searchParams.set(key, value);
      url.searchParams.set('pageSize', '100');
      let response = await fetch(url, { headers: authorization ? { Authorization: authorization } : undefined });
      if (response.status === 403) return { status: 403, body: undefined };
      if (!response.ok) return { status: 502, body: { message: 'Request failed' } };
      const dashboard = await response.json() as { counts: Record<string, number>; rows: Array<{ personId: string; severity: string; recordedAt: string; trendDirection: string | null }>; nextCursor: string | null };
      while (dashboard.nextCursor) {
        url.searchParams.set('cursor', dashboard.nextCursor);
        response = await fetch(url, { headers: authorization ? { Authorization: authorization } : undefined });
        if (!response.ok) return { status: response.status === 403 ? 403 : 502, body: response.status === 403 ? undefined : { message: 'Request failed' } };
        const next = await response.json() as typeof dashboard;
        dashboard.rows.push(...next.rows);
        dashboard.nextCursor = next.nextCursor;
      }
      const ids = dashboard.rows.map((row) => row.personId);
      const metadataPeople: Array<{ personId: string; fullName: string; department: { id: string; label: string } | null; projects: Array<{ id: string; label: string }>; manager: { id: string; label: string } | null; peoplePartner: { id: string; label: string } | null }> = [];
      for (let index = 0; index < ids.length; index += 500) {
        const metadataResponse = await fetch(`${this.config.getOrThrow<string>('PEOPLE_SERVICE_URL')}/api/v1/internal/risk-dashboard/metadata`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(peopleAuthorization ? { Authorization: peopleAuthorization } : {}) }, body: JSON.stringify({ personIds: ids.slice(index, index + 500) }) });
        if (!metadataResponse.ok) return { status: 502, body: { message: 'Request failed' } };
        const metadata = await metadataResponse.json() as { people: typeof metadataPeople };
        metadataPeople.push(...metadata.people);
      }
      const byId = new Map(metadataPeople.map((person) => [person.personId, person]));
      const rows = dashboard.rows.flatMap((row) => {
        const person = byId.get(row.personId); if (!person) return [];
        if (query.departmentId && person.department?.id !== query.departmentId) return [];
        if (query.projectId && !person.projects.some((project) => project.id === query.projectId)) return [];
        if (query.managerId && person.manager?.id !== query.managerId) return [];
        if (query.peoplePartnerId && person.peoplePartner?.id !== query.peoplePartnerId) return [];
        return [{ ...row, ...person }];
      });
      const counts: Record<string, number> = { low: 0, need_attention: 0, medium: 0, high: 0, leaver: 0, activeCount: 0 };
      for (const row of rows) { counts[row.severity] += 1; if (row.severity !== 'low') counts.activeCount += 1; }
      const options = <T extends { id: string; label: string }>(values: Array<T | null | undefined>) => [...new Map(values.filter((value): value is T => Boolean(value)).map((value) => [value.id, value])).values()];
      const pageSize = Math.min(Math.max(Number(query.pageSize) || 50, 1), 100);
      const offset = query.cursor ? Number(Buffer.from(query.cursor, 'base64url').toString('utf8')) : 0;
      if (!Number.isInteger(offset) || offset < 0) return { status: 400, body: { message: 'Request failed' } };
      const page = rows.slice(offset, offset + pageSize);
      const nextCursor = rows.length > offset + pageSize ? Buffer.from(String(offset + pageSize)).toString('base64url') : null;
      return { status: 200, body: { counts, rows: page, nextCursor, catalogs: { departments: options(rows.map((row) => row.department)), projects: options(rows.flatMap((row) => row.projects)), managers: options(rows.map((row) => row.manager)), peoplePartners: options(rows.map((row) => row.peoplePartner)) } } };
    } catch { return { status: 502, body: { message: 'Request failed' } }; }
  }
}
