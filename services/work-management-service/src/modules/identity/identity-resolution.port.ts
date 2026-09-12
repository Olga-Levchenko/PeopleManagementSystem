export type IdentityResolutionOutcome =
  'resolved' | 'missing' | 'ambiguous' | 'unavailable';

export type IdentityResolutionResult =
  | { outcome: 'resolved'; personId: string }
  | { outcome: 'missing' }
  | { outcome: 'ambiguous' }
  | { outcome: 'unavailable' };

export interface IdentityResolutionPort {
  resolve(
    issuer: string,
    subject: string,
    subjectToken: string,
  ): Promise<IdentityResolutionResult>;
}
