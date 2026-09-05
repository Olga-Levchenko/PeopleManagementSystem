export type IdentityLinkOperationName = 'LINK' | 'REVOKE' | 'RELINK';

export interface LinkIdentityRequest {
  readonly personId: string;
  readonly issuer: string;
  readonly subject: string;
  readonly idempotencyKey: string;
}

export interface RevokeIdentityRequest {
  readonly linkId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface RelinkIdentityRequest {
  readonly existingLinkId: string;
  readonly newIssuer: string;
  readonly newSubject: string;
  readonly idempotencyKey: string;
}

export interface IdentityLinkCommandResult {
  readonly linkId: string;
  readonly status: 'ACTIVE' | 'REVOKED';
}

export interface RelinkIdentityCommandResult {
  readonly oldLinkId: string;
  readonly linkId: string;
  readonly status: 'ACTIVE';
}

export interface IdentityLinkAuditState {
  readonly linkId?: string;
  readonly personId: string;
  readonly canonicalIssuer: string;
  readonly status: 'ACTIVE' | 'REVOKED';
  readonly linkedAtUtc?: string;
  readonly revokedAtUtc?: string;
  readonly reason?: string;
}

export interface RelinkAuditState {
  readonly oldLinkId: string;
  readonly newLinkId: string;
  readonly oldSubjectFingerprint: string;
  readonly newSubjectFingerprint: string;
  readonly oldStatus: 'ACTIVE' | 'REVOKED';
  readonly newStatus: 'ACTIVE' | 'REVOKED';
}
