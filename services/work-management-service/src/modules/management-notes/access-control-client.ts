import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenExchangeService } from '../auth/service-token-exchange.service';

/** The two project-scoped roles access-control-service's `projectRoles` field can carry. */
export type ProjectRole = 'ProjectManager' | 'DeliveryManager';

/**
 * The subset of access-control-service's `GET /api/v1/access-roles/resolve` response this module
 * consumes -- only the four boolean lines plus `projectRoles` (spec-1-7's own addition to that
 * endpoint, ADR-003's 2026-09-02 addendum). `managerSectionAccess`/`peoplePartnerSectionAccess`/
 * `fullProfileAccessSectionAccess` are not needed here: S7 access is an all-or-nothing/PM-narrowed
 * decision (see `ManagementNotesService.resolveAccess`), not a per-section level lookup like
 * `people-service`'s profile assembly.
 */
export interface AccessRoleResolution {
  reportingLine: boolean;
  projectLine: boolean;
  projectRoles: ProjectRole[];
  peoplePartnerLine: boolean;
  fullProfileAccessLine: boolean;
}

/** The fail-closed shape: no line qualifies, no project role held. */
export const NO_ACCESS_RESOLUTION: AccessRoleResolution = {
  reportingLine: false,
  projectLine: false,
  projectRoles: [],
  peoplePartnerLine: false,
  fullProfileAccessLine: false,
};

/**
 * Parses and validates an `unknown` JSON value into `AccessRoleResolution`. Returns
 * `NO_ACCESS_RESOLUTION` for any top-level structural failure (not an object, missing). Boolean
 * line flags require strict `=== true` -- any other truthy value is treated as `false`, and
 * `projectRoles` is filtered to only the two recognized role strings (allowlist, not a denylist) --
 * both fail closed rather than granting access on a wire-shape drift.
 */
export function parseAccessRoleResolution(raw: unknown): AccessRoleResolution {
  if (typeof raw !== 'object' || raw === null) return NO_ACCESS_RESOLUTION;
  const r = raw as Record<string, unknown>;

  const rawProjectRoles = Array.isArray(r['projectRoles'])
    ? (r['projectRoles'] as unknown[])
    : [];
  const projectRoles = rawProjectRoles.filter(
    (role): role is ProjectRole =>
      role === 'ProjectManager' || role === 'DeliveryManager',
  );

  return {
    reportingLine: r['reportingLine'] === true,
    projectLine: r['projectLine'] === true,
    projectRoles,
    peoplePartnerLine: r['peoplePartnerLine'] === true,
    fullProfileAccessLine: r['fullProfileAccessLine'] === true,
  };
}

export interface AccessRoleResolutionPort {
  resolve(
    viewerPersonId: string,
    subjectPersonId: string,
    subjectToken?: string,
  ): Promise<AccessRoleResolution>;
  resolveBatch?(
    viewerPersonId: string,
    subjectPersonIds: string[],
    subjectToken?: string,
  ): Promise<Map<string, AccessRoleResolution> | null>;
}

/**
 * Bounds how long a single resolve call waits on access-control-service before giving up and
 * failing closed. This is a fail-closed *access* decision (S7 read/write gating) -- a hung
 * connection (the peer accepts the socket but never responds) must degrade to "no access" within a
 * bounded time, the same way a network error or non-2xx response already does, rather than
 * blocking the caller's request indefinitely. A few seconds is generous for an intra-cluster
 * service-to-service call while still being short enough that a real outage doesn't stall every
 * S7 request for an unbounded time.
 */
const RESOLVE_TIMEOUT_MS = 5_000;

/**
 * Calls access-control-service's real HTTP endpoint via native `fetch` (Node 22 global) --
 * deliberately no client library, same as `people-service`'s
 * `HttpAccessRoleResolutionAdapter` (`modules/profile/profile.ports.ts`), whose fail-closed
 * contract this mirrors exactly: a network error, a non-2xx response, or a request that times out
 * (see `RESOLVE_TIMEOUT_MS`) is caught here and mapped to `NO_ACCESS_RESOLUTION`, so
 * `ManagementNotesService` never has to distinguish "resolver said no access" from "resolver was
 * unreachable or too slow" -- all three degrade identically to no access (403), and this method
 * never throws past the caller.
 */
@Injectable()
export class HttpAccessRoleResolutionAdapter implements AccessRoleResolutionPort {
  private readonly logger = new Logger(HttpAccessRoleResolutionAdapter.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokenExchange: ServiceTokenExchangeService,
  ) {}

  async resolve(
    viewerPersonId: string,
    subjectPersonId: string,
    subjectToken?: string,
  ): Promise<AccessRoleResolution> {
    if (!subjectToken) {
      return NO_ACCESS_RESOLUTION;
    }
    try {
      const signal = AbortSignal.timeout(RESOLVE_TIMEOUT_MS);
      const accessToken = await this.tokenExchange.exchangeForAccessControl(
        subjectToken,
        signal,
      );
      // Config lookup and URL construction live inside this try too -- a missing/invalid
      // ACCESS_CONTROL_SERVICE_BASE_URL must fail closed the same as a network error, never
      // throw past the caller (Joi startup validation makes this unreachable in practice, but
      // the fail-closed contract shouldn't rely on that alone).
      const baseUrl = this.config.getOrThrow<string>(
        'ACCESS_CONTROL_SERVICE_BASE_URL',
      );
      const url = new URL('/api/v1/access-roles/resolve', baseUrl);
      url.searchParams.set('viewerPersonId', viewerPersonId);
      url.searchParams.set('subjectPersonId', subjectPersonId);

      // AbortSignal.timeout (Node 17.3+/22 global, same runtime this service already requires)
      // aborts the underlying request after RESOLVE_TIMEOUT_MS -- fetch then rejects, which the
      // catch block below already handles identically to any other network error.
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal,
      });
      if (!response.ok) {
        this.logger.warn(
          `access-control-service returned ${response.status} resolving ${viewerPersonId} -> ${subjectPersonId}; failing closed to no access`,
        );
        return NO_ACCESS_RESOLUTION;
      }
      return parseAccessRoleResolution(await response.json());
    } catch (error) {
      this.logger.warn(
        `access-control-service unreachable or timed out resolving ${viewerPersonId} -> ${subjectPersonId}; failing closed to no access: ${(error as Error).message}`,
      );
      return NO_ACCESS_RESOLUTION;
    }
  }

  async resolveBatch(viewerPersonId: string, subjectPersonIds: string[], subjectToken?: string): Promise<Map<string, AccessRoleResolution> | null> {
    if (!subjectToken || subjectPersonIds.length > 500 || new Set(subjectPersonIds).size !== subjectPersonIds.length) return null;
    try {
      const signal = AbortSignal.timeout(RESOLVE_TIMEOUT_MS);
      const accessToken = await this.tokenExchange.exchangeForAccessControl(subjectToken, signal);
      const baseUrl = this.config.getOrThrow<string>('ACCESS_CONTROL_SERVICE_BASE_URL');
      const response = await fetch(new URL('/api/v1/access-roles/resolve-batch', baseUrl), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ viewerPersonId, subjectPersonIds }), signal,
      });
      if (!response.ok) return null;
      const body = await response.json();
      if (!body || typeof body !== 'object' || !Array.isArray((body as { results?: unknown }).results)) return null;
      const results = (body as { results: unknown[] }).results;
      if (results.length !== subjectPersonIds.length) return null;
      const expected = new Set(subjectPersonIds);
      const resolved = new Map<string, AccessRoleResolution>();
      for (const item of results) {
        if (!item || typeof item !== 'object') return null;
        const record = item as Record<string, unknown>;
        const subjectId = record['subjectPersonId'];
        if (typeof subjectId !== 'string' || !expected.delete(subjectId) || !isCompleteBatchResolution(record)) return null;
        resolved.set(subjectId, parseAccessRoleResolution(record));
      }
      return expected.size === 0 ? resolved : null;
    } catch {
      return null;
    }
  }
}

/** Batch responses are an authorization dependency: unlike a single resolution, wire-shape drift
 * must deny the dashboard rather than silently drop or reinterpret a candidate. */
function isCompleteBatchResolution(value: Record<string, unknown>): boolean {
  return typeof value['reportingLine'] === 'boolean' &&
    typeof value['projectLine'] === 'boolean' &&
    typeof value['peoplePartnerLine'] === 'boolean' &&
    typeof value['fullProfileAccessLine'] === 'boolean' &&
    Array.isArray(value['projectRoles']);
}
