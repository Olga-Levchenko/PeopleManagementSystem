import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IdentityFingerprintUnavailableError,
  type Fingerprint,
  type IIdentityFingerprintService,
} from './identity-fingerprint.service';
import {
  IdentityValidationService,
  type CanonicalIdentity,
} from './identity-validation.service';
import type {
  IdentityLinkAuditState,
  IdentityLinkCommandResult,
  IdentityLinkOperationName,
  LinkIdentityRequest,
  RelinkAuditState,
  RelinkIdentityCommandResult,
  RelinkIdentityRequest,
  RevokeIdentityRequest,
} from './identity-mapping.types';
import type {
  IIdentityLinkProvisioningAuthorizer,
  IdentityLinkProvisioningActor,
} from './identity-provisioning.ports';

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class IdentityMappingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: IdentityValidationService,
    @Inject('IIdentityFingerprintService')
    private readonly fingerprint: IIdentityFingerprintService,
    @Inject('IIdentityLinkProvisioningAuthorizer')
    private readonly authorizer: IIdentityLinkProvisioningAuthorizer,
  ) {}

  async LinkIdentityAsync(
    request: LinkIdentityRequest,
    correlationId = 'identity-link-command',
  ): Promise<IdentityLinkCommandResult> {
    const actor = await this.authorize();
    const identity = this.validation.validateIdentity(
      request.issuer,
      request.subject,
    );
    const idempotencyKey = this.validateIdempotencyKey(request.idempotencyKey);
    const canonicalRequest = {
      personId: request.personId,
      canonicalIssuer: identity.canonicalIssuer,
      opaqueSubject: identity.opaqueSubject,
    };
    const requestFingerprint = this.fingerprintRequest(
      'LINK',
      canonicalRequest,
    );

    return this.withUniqueRaceRecovery(
      'LINK',
      idempotencyKey,
      requestFingerprint,
      canonicalRequest,
      () =>
        this.prisma.$transaction((tx) =>
          this.linkInTransaction(
            tx,
            request.personId,
            identity,
            idempotencyKey,
            requestFingerprint,
            canonicalRequest,
            actor,
            correlationId,
          ),
        ),
    );
  }

  async RevokeIdentityAsync(
    request: RevokeIdentityRequest,
    correlationId = 'identity-link-command',
  ): Promise<IdentityLinkCommandResult> {
    const actor = await this.authorize();
    const linkId = this.validateUuid(request.linkId, 'linkId');
    const reason = this.validateReason(request.reason);
    const idempotencyKey = this.validateIdempotencyKey(request.idempotencyKey);
    const canonicalRequest = {
      linkId,
      reason,
    };
    const requestFingerprint = this.fingerprintRequest(
      'REVOKE',
      canonicalRequest,
    );

    return this.withUniqueRaceRecovery(
      'REVOKE',
      idempotencyKey,
      requestFingerprint,
      canonicalRequest,
      () =>
        this.prisma.$transaction((tx) =>
          this.revokeInTransaction(
            tx,
            linkId,
            reason,
            idempotencyKey,
            requestFingerprint,
            canonicalRequest,
            actor,
            correlationId,
          ),
        ),
    );
  }

  async RelinkIdentityAsync(
    request: RelinkIdentityRequest,
    correlationId = 'identity-link-command',
  ): Promise<RelinkIdentityCommandResult> {
    const actor = await this.authorize();
    const existingLinkId = this.validateUuid(
      request.existingLinkId,
      'existingLinkId',
    );
    const identity = this.validation.validateIdentity(
      request.newIssuer,
      request.newSubject,
    );
    const idempotencyKey = this.validateIdempotencyKey(request.idempotencyKey);
    const canonicalRequest = {
      existingLinkId,
      canonicalIssuer: identity.canonicalIssuer,
      opaqueSubject: identity.opaqueSubject,
    };
    const requestFingerprint = this.fingerprintRequest(
      'RELINK',
      canonicalRequest,
    );

    return this.withUniqueRaceRecovery(
      'RELINK',
      idempotencyKey,
      requestFingerprint,
      canonicalRequest,
      () =>
        this.prisma.$transaction((tx) =>
          this.relinkInTransaction(
            tx,
            existingLinkId,
            identity,
            idempotencyKey,
            requestFingerprint,
            canonicalRequest,
            actor,
            correlationId,
          ),
        ),
    );
  }

  private async linkInTransaction(
    tx: TransactionClient,
    personId: string,
    identity: CanonicalIdentity,
    idempotencyKey: string,
    requestFingerprint: Fingerprint,
    canonicalRequest: unknown,
    actor: IdentityLinkProvisioningActor,
    correlationId: string,
  ): Promise<IdentityLinkCommandResult> {
    const replay = await this.findReplay(
      tx,
      'LINK',
      idempotencyKey,
      canonicalRequest,
      (operation) => ({
        linkId: operation.resultLinkId ?? '',
        status: this.resultStatus(operation.resultStatus),
      }),
    );
    if (replay) {
      return replay;
    }

    const person = await tx.person.findUnique({
      where: { id: personId },
      select: { id: true },
    });
    if (!person) {
      throw new NotFoundException('Person not found');
    }

    const subjectFingerprint = this.fingerprintSubject(identity);
    const link = await tx.personExternalIdentityLink.create({
      data: {
        personId,
        canonicalIssuer: identity.canonicalIssuer,
        opaqueSubject: identity.opaqueSubject,
      },
    });
    await tx.identityLinkOperation.create({
      data: {
        operationType: 'LINK',
        idempotencyKey,
        requestFingerprint: requestFingerprint.value,
        fingerprintKeyVersion: requestFingerprint.keyVersion,
        resultLinkId: link.id,
        resultStatus: link.status,
      },
    });
    await this.createAudit(tx, {
      action: 'LINK',
      linkId: link.id,
      personId,
      canonicalIssuer: identity.canonicalIssuer,
      subjectFingerprint,
      idempotencyKey,
      actor,
      correlationId,
      beforeState: null,
      afterState: this.linkState(link),
    });

    return { linkId: link.id, status: link.status };
  }

  private async revokeInTransaction(
    tx: TransactionClient,
    linkId: string,
    reason: string,
    idempotencyKey: string,
    requestFingerprint: Fingerprint,
    canonicalRequest: unknown,
    actor: IdentityLinkProvisioningActor,
    correlationId: string,
  ): Promise<IdentityLinkCommandResult> {
    const replay = await this.findReplay(
      tx,
      'REVOKE',
      idempotencyKey,
      canonicalRequest,
      (operation) => ({
        linkId: operation.resultLinkId ?? linkId,
        status: this.resultStatus(operation.resultStatus),
      }),
    );
    if (replay) {
      return replay;
    }

    const link = await tx.personExternalIdentityLink.findUnique({
      where: { id: linkId },
    });
    if (!link) {
      throw new NotFoundException('Identity link not found');
    }

    const subjectFingerprint = this.fingerprintSubject({
      canonicalIssuer: link.canonicalIssuer,
      opaqueSubject: link.opaqueSubject,
    });
    const beforeState = this.linkState(link);
    const updatedLink =
      link.status === 'REVOKED'
        ? link
        : await tx.personExternalIdentityLink.update({
            where: { id: link.id },
            data: {
              status: 'REVOKED',
              revokedAtUtc: new Date(),
              revocationReason: reason,
            },
          });

    await tx.identityLinkOperation.create({
      data: {
        operationType: 'REVOKE',
        idempotencyKey,
        requestFingerprint: requestFingerprint.value,
        fingerprintKeyVersion: requestFingerprint.keyVersion,
        resultLinkId: updatedLink.id,
        resultStatus: updatedLink.status,
      },
    });
    await this.createAudit(tx, {
      action: 'REVOKE',
      linkId: updatedLink.id,
      personId: updatedLink.personId,
      canonicalIssuer: updatedLink.canonicalIssuer,
      subjectFingerprint,
      idempotencyKey,
      actor,
      correlationId,
      beforeState,
      afterState: this.linkState(updatedLink, reason),
    });

    return { linkId: updatedLink.id, status: updatedLink.status };
  }

  private async relinkInTransaction(
    tx: TransactionClient,
    existingLinkId: string,
    identity: CanonicalIdentity,
    idempotencyKey: string,
    requestFingerprint: Fingerprint,
    canonicalRequest: unknown,
    actor: IdentityLinkProvisioningActor,
    correlationId: string,
  ): Promise<RelinkIdentityCommandResult> {
    const replay = await this.findReplay(
      tx,
      'RELINK',
      idempotencyKey,
      canonicalRequest,
      (operation) => ({
        oldLinkId: existingLinkId,
        linkId: operation.resultLinkId ?? '',
        status: 'ACTIVE' as const,
      }),
    );
    if (replay) {
      return replay;
    }

    const oldLink = await tx.personExternalIdentityLink.findUnique({
      where: { id: existingLinkId },
    });
    if (!oldLink) {
      throw new NotFoundException('Identity link not found');
    }
    if (oldLink.status !== 'ACTIVE') {
      throw new ConflictException('Identity link is not active');
    }

    const oldSubjectFingerprint = this.fingerprintSubject({
      canonicalIssuer: oldLink.canonicalIssuer,
      opaqueSubject: oldLink.opaqueSubject,
    });
    const newSubjectFingerprint = this.fingerprintSubject(identity);
    const revokedOldLink = await tx.personExternalIdentityLink.update({
      where: { id: oldLink.id },
      data: {
        status: 'REVOKED',
        revokedAtUtc: new Date(),
        revocationReason: 'Relinked',
      },
    });
    const newLink = await tx.personExternalIdentityLink.create({
      data: {
        personId: oldLink.personId,
        canonicalIssuer: identity.canonicalIssuer,
        opaqueSubject: identity.opaqueSubject,
      },
    });
    await tx.identityLinkOperation.create({
      data: {
        operationType: 'RELINK',
        idempotencyKey,
        requestFingerprint: requestFingerprint.value,
        fingerprintKeyVersion: requestFingerprint.keyVersion,
        resultLinkId: newLink.id,
        resultStatus: newLink.status,
      },
    });
    await this.createAudit(tx, {
      action: 'RELINK',
      linkId: newLink.id,
      personId: oldLink.personId,
      canonicalIssuer: identity.canonicalIssuer,
      subjectFingerprint: newSubjectFingerprint,
      idempotencyKey,
      actor,
      correlationId,
      beforeState: this.linkState(oldLink),
      afterState: this.relinkState(
        revokedOldLink,
        newLink,
        oldSubjectFingerprint,
        newSubjectFingerprint,
      ),
    });

    return { oldLinkId: oldLink.id, linkId: newLink.id, status: 'ACTIVE' };
  }

  private async withUniqueRaceRecovery<T>(
    operationType: IdentityLinkOperationName,
    idempotencyKey: string,
    requestFingerprint: Fingerprint,
    canonicalRequest: unknown,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }

      const committed = await this.prisma.identityLinkOperation.findUnique({
        where: {
          operationType_idempotencyKey: { operationType, idempotencyKey },
        },
      });
      if (!committed) {
        throw new ConflictException('Identity link uniqueness conflict');
      }

      const equivalent = this.fingerprint.verifyRequestFingerprint(
        operationType,
        canonicalRequest,
        {
          value: committed.requestFingerprint,
          keyVersion: committed.fingerprintKeyVersion,
        },
      );
      if (!equivalent) {
        throw new ConflictException(
          'Idempotency key was already used for a different request',
        );
      }

      return this.resultFromOperation(
        operationType,
        committed,
        canonicalRequest,
      ) as T;
    }
  }

  private async findReplay<T>(
    tx: TransactionClient,
    operationType: IdentityLinkOperationName,
    idempotencyKey: string,
    canonicalRequest: unknown,
    result: (operation: {
      resultLinkId: string | null;
      resultStatus: string;
    }) => T,
  ): Promise<T | null> {
    const operation = await tx.identityLinkOperation.findUnique({
      where: {
        operationType_idempotencyKey: { operationType, idempotencyKey },
      },
    });
    if (!operation) {
      return null;
    }
    if (
      !this.fingerprint.verifyRequestFingerprint(
        operationType,
        canonicalRequest,
        {
          value: operation.requestFingerprint,
          keyVersion: operation.fingerprintKeyVersion,
        },
      )
    ) {
      throw new ConflictException(
        'Idempotency key was already used for a different request',
      );
    }
    return result(operation);
  }

  private async createAudit(
    tx: TransactionClient,
    input: {
      action: 'LINK' | 'REVOKE' | 'RELINK';
      linkId: string;
      personId: string;
      canonicalIssuer: string;
      subjectFingerprint: Fingerprint;
      idempotencyKey: string;
      actor: IdentityLinkProvisioningActor;
      correlationId: string;
      beforeState: IdentityLinkAuditState | null;
      afterState: IdentityLinkAuditState | RelinkAuditState;
    },
  ): Promise<void> {
    await tx.identityLinkAudit.create({
      data: {
        action: input.action,
        linkId: input.linkId,
        personId: input.personId,
        canonicalIssuer: input.canonicalIssuer,
        subjectFingerprint: input.subjectFingerprint.value,
        fingerprintKeyVersion: input.subjectFingerprint.keyVersion,
        actorType: input.actor.actorType,
        actorIdentifier: input.actor.actorIdentifier,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        beforeState: (input.beforeState ?? {}) as Prisma.InputJsonObject,
        afterState: input.afterState as unknown as Prisma.InputJsonObject,
      },
    });
  }

  private linkState(
    link: {
      id: string;
      personId: string;
      canonicalIssuer: string;
      status: 'ACTIVE' | 'REVOKED';
      linkedAtUtc: Date;
      revokedAtUtc: Date | null;
    },
    reason?: string,
  ): IdentityLinkAuditState {
    return {
      linkId: link.id,
      personId: link.personId,
      canonicalIssuer: link.canonicalIssuer,
      status: link.status,
      linkedAtUtc: link.linkedAtUtc.toISOString(),
      ...(link.revokedAtUtc && {
        revokedAtUtc: link.revokedAtUtc.toISOString(),
      }),
      ...(reason && { reason }),
    };
  }

  private relinkState(
    oldLink: {
      id: string;
      status: 'ACTIVE' | 'REVOKED';
    },
    newLink: {
      id: string;
      status: 'ACTIVE' | 'REVOKED';
    },
    oldSubjectFingerprint: Fingerprint,
    newSubjectFingerprint: Fingerprint,
  ): RelinkAuditState {
    return {
      oldLinkId: oldLink.id,
      newLinkId: newLink.id,
      oldSubjectFingerprint: oldSubjectFingerprint.value,
      newSubjectFingerprint: newSubjectFingerprint.value,
      oldStatus: oldLink.status,
      newStatus: newLink.status,
    };
  }

  private fingerprintRequest(
    operationType: IdentityLinkOperationName,
    request: unknown,
  ): Fingerprint {
    try {
      return this.fingerprint.fingerprintRequest(operationType, request);
    } catch (error) {
      if (error instanceof IdentityFingerprintUnavailableError) {
        throw new ServiceUnavailableException(
          'Identity fingerprinting is unavailable',
        );
      }
      throw error;
    }
  }

  private fingerprintSubject(identity: CanonicalIdentity): Fingerprint {
    try {
      return this.fingerprint.fingerprintSubject(
        identity.canonicalIssuer,
        identity.opaqueSubject,
      );
    } catch (error) {
      if (error instanceof IdentityFingerprintUnavailableError) {
        throw new ServiceUnavailableException(
          'Identity fingerprinting is unavailable',
        );
      }
      throw error;
    }
  }

  private async authorize(): Promise<IdentityLinkProvisioningActor> {
    const actor = await this.authorizer.authorize();
    if (!actor) {
      throw new ForbiddenException(
        'Identity-link provisioning authorization was denied',
      );
    }
    return Object.freeze({
      actorType: actor.actorType,
      actorIdentifier: actor.actorIdentifier,
    });
  }

  private validateIdempotencyKey(value: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('Idempotency key is required');
    }
    return value;
  }

  private validateReason(value: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException('Revocation reason is required');
    }
    return value;
  }

  private validateUuid(value: string, field: string): string {
    if (
      typeof value !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new BadRequestException(`${field} is malformed`);
    }
    return value;
  }

  private resultStatus(value: string): 'ACTIVE' | 'REVOKED' {
    if (value !== 'ACTIVE' && value !== 'REVOKED') {
      throw new ServiceUnavailableException(
        'Identity operation result is invalid',
      );
    }
    return value;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Error &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }

  private resultFromOperation(
    operationType: IdentityLinkOperationName,
    operation: {
      resultLinkId: string | null;
      resultStatus: string;
    },
    canonicalRequest: unknown,
  ): IdentityLinkCommandResult | RelinkIdentityCommandResult {
    const linkId = operation.resultLinkId ?? '';
    if (operationType === 'RELINK') {
      const existingLinkId =
        typeof canonicalRequest === 'object' &&
        canonicalRequest !== null &&
        'existingLinkId' in canonicalRequest &&
        typeof canonicalRequest.existingLinkId === 'string'
          ? canonicalRequest.existingLinkId
          : '';
      return { oldLinkId: existingLinkId, linkId, status: 'ACTIVE' };
    }
    return { linkId, status: this.resultStatus(operation.resultStatus) };
  }
}
