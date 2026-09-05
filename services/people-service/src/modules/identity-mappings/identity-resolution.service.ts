import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IdentityValidationService,
  type CanonicalIdentity,
} from './identity-validation.service';
import type { IdentityResolutionResult } from './identity-resolution.ports';

@Injectable()
export class IdentityResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validation: IdentityValidationService,
  ) {}

  async resolve(
    issuer: string,
    subject: string,
    cancellationToken?: AbortSignal,
  ): Promise<IdentityResolutionResult> {
    const identity = this.validate(issuer, subject);
    if (cancellationToken?.aborted) {
      throw new Error('Identity resolution was cancelled');
    }

    try {
      const links = await this.prisma.personExternalIdentityLink.findMany({
        where: {
          canonicalIssuer: identity.canonicalIssuer,
          opaqueSubject: identity.opaqueSubject,
          status: 'ACTIVE',
        },
        select: { personId: true },
        take: 2,
      });
      if (cancellationToken?.aborted) {
        throw new Error('Identity resolution was cancelled');
      }

      if (links.length === 0) {
        return { outcome: 'missing' };
      }
      if (links.length > 1) {
        return { outcome: 'ambiguous' };
      }

      return { outcome: 'resolved', personId: links[0].personId };
    } catch (error) {
      if (cancellationToken?.aborted) {
        throw error;
      }
      if (!this.isPersistenceFailure(error)) {
        throw error;
      }
      return { outcome: 'unavailable' };
    }
  }

  private isPersistenceFailure(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.constructor.name.startsWith('PrismaClient') ||
        ('code' in error &&
          typeof error.code === 'string' &&
          error.code.startsWith('P')))
    );
  }

  private validate(issuer: string, subject: string): CanonicalIdentity {
    try {
      return this.validation.validateIdentity(issuer, subject);
    } catch {
      throw new BadRequestException('Identity resolution request is invalid');
    }
  }
}
