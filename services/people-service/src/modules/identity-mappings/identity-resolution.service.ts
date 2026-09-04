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
  ): Promise<IdentityResolutionResult> {
    const identity = this.validate(issuer, subject);

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

      if (links.length === 0) {
        return { outcome: 'missing' };
      }
      if (links.length > 1) {
        return { outcome: 'ambiguous' };
      }

      return { outcome: 'resolved', personId: links[0].personId };
    } catch {
      return { outcome: 'unavailable' };
    }
  }

  private validate(issuer: string, subject: string): CanonicalIdentity {
    try {
      return this.validation.validateIdentity(issuer, subject);
    } catch {
      throw new BadRequestException('Identity resolution request is invalid');
    }
  }
}
