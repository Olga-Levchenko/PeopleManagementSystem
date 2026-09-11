import type { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../src/modules/auth/jwt-auth.guard';
import type { IdentityResolutionService } from '../../src/modules/identity-mappings/identity-resolution.service';

/** Issuer attached by {@link installJwtAuthGuardBypass}; must match `OIDC_ALLOWED_ISSUERS`. */
export const E2E_JWT_ISSUER = 'http://localhost:8080/realms/people-management';

/** Synthetic Keycloak `sub` for suites that bypass real JWT validation. */
export const E2E_JWT_SUB = 'eeeeeeee-0000-0000-0000-00000000e2e0';

/** Seeded Story 1.11 test user from `realm-export.json` / `01-people-service.sql`. */
export const STORY_1_11_KEYCLOAK_SUB = '7e5b85fe-1f88-4400-9cb9-bfca4530eb85';
export const STORY_1_11_PERSON_ID = 'cccccccc-0000-0000-0000-000000000019';

/**
 * Patches `JwtAuthGuard` so authenticated requests carry `iss` + `sub` without a real token.
 * `RequestActorContext.resolveActorId()` still resolves via `IdentityResolutionService`.
 */
export function installJwtAuthGuardBypass(): void {
  jest
    .spyOn(JwtAuthGuard.prototype, 'canActivate')
    .mockImplementation((context: ExecutionContext) => {
      const httpRequest = context
        .switchToHttp()
        .getRequest<{ user?: { sub?: string; iss?: string } }>();
      httpRequest.user = { sub: E2E_JWT_SUB, iss: E2E_JWT_ISSUER };
      return true;
    });
}

/** Maps the bypassed JWT principal to the viewer `Person.id` each test sets. */
export function createIdentityResolutionStub(
  getViewerPersonId: () => string,
): Pick<IdentityResolutionService, 'resolve'> {
  return {
    resolve: jest.fn(() =>
      Promise.resolve({
        outcome: 'resolved' as const,
        personId: getViewerPersonId(),
      }),
    ),
  };
}

/** Maps the Story 1.11 Keycloak user to the seeded platform person id. */
export function createStory111IdentityResolutionStub(): Pick<
  IdentityResolutionService,
  'resolve'
> {
  return {
    resolve: jest.fn((_issuer: string, subject: string) => {
      if (subject === STORY_1_11_KEYCLOAK_SUB) {
        return Promise.resolve({
          outcome: 'resolved' as const,
          personId: STORY_1_11_PERSON_ID,
        });
      }
      return Promise.resolve({ outcome: 'missing' as const });
    }),
  };
}
