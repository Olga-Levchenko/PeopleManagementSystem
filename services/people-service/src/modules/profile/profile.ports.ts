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
 * consumes -- only `s1`/`s2` are read today, but the wire shape carries S1-S16 (see
 * `AccessRolesController.cs`); extra keys are simply ignored by JSON parsing.
 */
export interface AccessRoleResolution {
  reportingLine: boolean;
  projectLine: boolean;
  managerSectionAccess: {
    s1: SectionAccess;
    s2: SectionAccess;
  } | null;
}

/** The fail-closed shape: neither line qualifies, matching a Colleague-audience resolution. */
export const NEITHER_LINE_RESOLUTION: AccessRoleResolution = {
  reportingLine: false,
  projectLine: false,
  managerSectionAccess: null,
};

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
      return (await response.json()) as AccessRoleResolution;
    } catch (error) {
      this.logger.warn(
        `access-control-service unreachable resolving ${viewerPersonId} -> ${subjectPersonId}; failing closed to Colleague: ${(error as Error).message}`,
      );
      return NEITHER_LINE_RESOLUTION;
    }
  }
}
