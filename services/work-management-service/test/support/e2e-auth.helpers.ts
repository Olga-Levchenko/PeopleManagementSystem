import type { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from '../../src/modules/auth/jwt-auth.guard';
import type { IdentityResolutionPort } from '../../src/modules/identity/identity-resolution.port';

export const E2E_JWT_ISSUER = 'http://localhost:8080/realms/people-management';

/** Seeded Story 1.11 test user from `realm-export.json`. */
export const STORY_1_11_KEYCLOAK_SUB = '7e5b85fe-1f88-4400-9cb9-bfca4530eb85';
export const STORY_1_11_PERSON_ID = 'cccccccc-0000-0000-0000-000000000019';

export function installJwtAuthGuardBypass(getSub: () => string): void {
  jest
    .spyOn(JwtAuthGuard.prototype, 'canActivate')
    .mockImplementation((context: ExecutionContext) => {
      const httpRequest = context
        .switchToHttp()
        .getRequest<{ user?: { sub?: string; iss?: string } }>();
      httpRequest.user = { sub: getSub(), iss: E2E_JWT_ISSUER };
      return true;
    });
}

export function createIdentityResolutionStub(
  getViewerPersonId: () => string,
): Pick<IdentityResolutionPort, 'resolve'> {
  return {
    resolve: jest.fn(() =>
      Promise.resolve({
        outcome: 'resolved' as const,
        personId: getViewerPersonId(),
      }),
    ),
  };
}

export function createStory111IdentityResolutionStub(): Pick<
  IdentityResolutionPort,
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
