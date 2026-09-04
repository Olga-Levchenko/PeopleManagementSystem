import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Mirrors access-control-service's `SectionAccessLevel` enum, rendered as PascalCase JSON. */
export type SectionAccessLevel = 'None' | 'Read' | 'ReadWrite';

export interface SectionAccess {
  level: SectionAccessLevel;
  restriction?: string | null;
}

/**
 * The subset of access-control-service's `GET /api/v1/access-roles/resolve` response this slice
 * consumes -- only `s1`/`s2`/`s10`/`s11`/`s16` are read today, but the wire shape carries S1-S16
 * (see `AccessRolesController.cs`); extra keys are simply ignored by JSON parsing.
 */
export interface AccessRoleResolution {
  reportingLine: boolean;
  projectLine: boolean;
  peoplePartnerLine: boolean;
  /** True when the viewer holds a Full-profile-access grant (spec §2.4). Maximum possible access. */
  fullProfileAccessLine: boolean;
  managerSectionAccess: {
    s1: SectionAccess;
    s2: SectionAccess;
    s10: SectionAccess;
    s11: SectionAccess;
    s16: SectionAccess;
  } | null;
  peoplePartnerSectionAccess: {
    s1: SectionAccess;
    s2: SectionAccess;
    s10: SectionAccess;
    s11: SectionAccess;
    s16: SectionAccess;
  } | null;
  /**
   * All 16 sections as ReadWrite when `fullProfileAccessLine` is true; null otherwise.
   * Takes precedence over all other qualifying lines (most-permissive-path-wins; Full profile
   * access is the maximum possible access level).
   */
  fullProfileAccessSectionAccess: {
    s1: SectionAccess;
    s2: SectionAccess;
    s10: SectionAccess;
    s11: SectionAccess;
    s16: SectionAccess;
  } | null;
}

/** The fail-closed shape: no line qualifies, matching a Colleague-audience resolution. */
export const NEITHER_LINE_RESOLUTION: AccessRoleResolution = {
  reportingLine: false,
  projectLine: false,
  peoplePartnerLine: false,
  fullProfileAccessLine: false,
  managerSectionAccess: null,
  peoplePartnerSectionAccess: null,
  fullProfileAccessSectionAccess: null,
};

/**
 * Parses and validates an `unknown` JSON value into `AccessRoleResolution`. Returns
 * `NEITHER_LINE_RESOLUTION` for any top-level structural failure (not an object, missing).
 * Per-section level values that are not one of the three recognized strings are coerced to
 * `'None'` (allowlist, not a denylist). Boolean line flags require strict `=== true` — any
 * other truthy value is treated as `false` so a future wire-shape change (e.g. a string `"true"`)
 * fails closed rather than granting access.
 */
export function parseAccessRoleResolution(raw: unknown): AccessRoleResolution {
  if (typeof raw !== 'object' || raw === null) return NEITHER_LINE_RESOLUTION;
  const r = raw as Record<string, unknown>;

  const parseSectionAccess = (obj: unknown): SectionAccess => {
    if (typeof obj !== 'object' || obj === null) return { level: 'None' };
    const o = obj as Record<string, unknown>;
    const level = o['level'];
    if (level !== 'None' && level !== 'Read' && level !== 'ReadWrite')
      return { level: 'None' };
    return {
      level,
      restriction:
        typeof o['restriction'] === 'string' ? o['restriction'] : null,
    };
  };

  const parseSectionAccessGroup = (
    obj: unknown,
  ): AccessRoleResolution['managerSectionAccess'] => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return null;
    const o = obj as Record<string, unknown>;
    return {
      s1: parseSectionAccess(o['s1']),
      s2: parseSectionAccess(o['s2']),
      s10: parseSectionAccess(o['s10']),
      s11: parseSectionAccess(o['s11']),
      // s16 is parsed for interface symmetry but is intentionally not consumed by ProfileService:
      // S16 uses per-field canSeeCustomField() filtering, not section-level gating.
      s16: parseSectionAccess(o['s16']),
    };
  };

  return {
    reportingLine: r['reportingLine'] === true,
    projectLine: r['projectLine'] === true,
    peoplePartnerLine: r['peoplePartnerLine'] === true,
    // Full-profile-access: strict === true, same fail-closed pattern as the other boolean flags.
    fullProfileAccessLine: r['fullProfileAccessLine'] === true,
    managerSectionAccess: parseSectionAccessGroup(r['managerSectionAccess']),
    peoplePartnerSectionAccess: parseSectionAccessGroup(
      r['peoplePartnerSectionAccess'],
    ),
    fullProfileAccessSectionAccess: parseSectionAccessGroup(
      r['fullProfileAccessSectionAccess'],
    ),
  };
}

/** One visible custom field entry surfaced in the S16 section of a profile response. */
export interface S16CustomField {
  fieldId: string;
  name: string;
  value: string;
}

export interface AccessRoleResolutionPort {
  resolve(
    viewerPersonId: string,
    subjectPersonId: string,
  ): Promise<AccessRoleResolution>;
}

/**
 * Calls access-control-service's real HTTP endpoint via native `fetch` (Node 22 global) --
 * deliberately no `@nestjs/axios`/`axios`/`nock` dependency for this first cross-service call.
 * A network error or non-2xx response is caught here and mapped to the fail-closed "neither line"
 * shape, so `ProfileService` never has to distinguish "resolver said no access" from "resolver was
 * unreachable" -- both degrade identically to Colleague, matching
 * `EfRelationshipRepository`'s existing "unknown id -> no access" precedent.
 */
@Injectable()
export class HttpAccessRoleResolutionAdapter implements AccessRoleResolutionPort {
  private readonly logger = new Logger(HttpAccessRoleResolutionAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async resolve(
    viewerPersonId: string,
    subjectPersonId: string,
  ): Promise<AccessRoleResolution> {
    const baseUrl = this.config.getOrThrow<string>(
      'ACCESS_CONTROL_SERVICE_BASE_URL',
    );
    const url = new URL('/api/v1/access-roles/resolve', baseUrl);
    url.searchParams.set('viewerPersonId', viewerPersonId);
    url.searchParams.set('subjectPersonId', subjectPersonId);

    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        this.logger.warn(
          `access-control-service returned ${response.status} resolving ${viewerPersonId} -> ${subjectPersonId}; failing closed to Colleague`,
        );
        return NEITHER_LINE_RESOLUTION;
      }
      return parseAccessRoleResolution(await response.json());
    } catch (error) {
      this.logger.warn(
        `access-control-service unreachable resolving ${viewerPersonId} -> ${subjectPersonId}; failing closed to Colleague: ${(error as Error).message}`,
      );
      return NEITHER_LINE_RESOLUTION;
    }
  }
}
