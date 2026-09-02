import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AccessRoleResolutionPort,
  SectionAccessLevel,
} from './profile.ports';

export interface PersonSummary {
  id: string;
  fullName: string;
}

export interface DepartmentSummary {
  id: string;
  name: string | null;
}

export interface S1IdentityCard {
  fullName: string;
  photoUrl: string | null;
  position: string | null;
  department: DepartmentSummary | null;
  countryCity: string | null;
  workEmail: string | null;
  workPhone: string | null;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  startDate: Date | null;
  manager: PersonSummary | null;
  peoplePartner: PersonSummary | null;
}

export interface S2PersonalContacts {
  personalPhone: string | null;
  personalEmail: string | null;
  residentialAddress: string | null;
}

/**
 * A section absent from this object entirely means "no access" -- never `s2: null`, never an
 * empty `{}`. Callers must assert on `Object.keys`, not a null check, per the frozen I/O matrix.
 */
export interface ProfileResponse {
  s1?: S1IdentityCard;
  s2?: S2PersonalContacts;
}

type PersonWithRelations = {
  fullName: string;
  photoUrl: string | null;
  position: string | null;
  countryCity: string | null;
  workEmail: string | null;
  workPhone: string | null;
  birthdayMonth: number | null;
  birthdayDay: number | null;
  startDate: Date | null;
  personalPhone: string | null;
  personalEmail: string | null;
  residentialAddress: string | null;
  manager: PersonSummary | null;
  peoplePartner: PersonSummary | null;
  department: DepartmentSummary | null;
};

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('AccessRoleResolutionPort')
    private readonly accessRoleResolution: AccessRoleResolutionPort,
  ) {}

  async getProfile(
    viewerPersonId: string,
    subjectPersonId: string,
  ): Promise<ProfileResponse> {
    const person = await this.prisma.person.findUnique({
      where: { id: subjectPersonId },
      select: {
        fullName: true,
        photoUrl: true,
        position: true,
        countryCity: true,
        workEmail: true,
        workPhone: true,
        birthdayMonth: true,
        birthdayDay: true,
        startDate: true,
        personalPhone: true,
        personalEmail: true,
        residentialAddress: true,
        manager: { select: { id: true, fullName: true } },
        peoplePartner: { select: { id: true, fullName: true } },
        department: { select: { id: true, name: true } },
      },
    });
    if (!person) {
      throw new NotFoundException('Person not found');
    }

    const audience = await this.resolveAudience(
      viewerPersonId,
      subjectPersonId,
    );

    const response: ProfileResponse = {};
    if (this.grantsAccess(audience.s1)) {
      response.s1 = this.toS1(person);
    }
    if (this.grantsAccess(audience.s2)) {
      response.s2 = this.toS2(person);
    }
    return response;
  }

  /**
   * Allowlist, not a denylist: only a recognized granting level includes the section. An
   * unexpected value from access-control-service (wire-shape drift, a future level, a malformed
   * response) must fail closed to "no access", never fail open to "grant it" -- a `!== 'None'`
   * check would do the opposite.
   */
  private grantsAccess(level: SectionAccessLevel): boolean {
    return level === 'Read' || level === 'ReadWrite';
  }

  /**
   * Self short-circuits before ever calling the resolver -- never call
   * `AccessRoleResolutionPort.resolve` for a person against themselves. Otherwise, Manager
   * (Reporting-line/Project-line, via `managerSectionAccess`) and PP-line (via
   * `peoplePartnerSectionAccess`) are two independent, simultaneously-possible qualifying lines --
   * per-section, the most-permissive level across whichever lines qualify wins (matching
   * `ManagerSectionAccessPolicy`'s own most-permissive-path-wins rule one level up: a narrowed
   * Project-line-only viewer who is also the subject's PP must still get PP's ReadWrite on S2,
   * not the narrowed Project-line Read/None -- checking Manager first and returning immediately
   * would silently drop that). A malformed section object (present but missing a `level` key) is
   * treated as absent, not dereferenced -- fails closed, never throws. No line qualifying at all
   * resolves to the Colleague whitelist (S1 read-only, no S2).
   */
  private async resolveAudience(
    viewerPersonId: string,
    subjectPersonId: string,
  ): Promise<{ s1: SectionAccessLevel; s2: SectionAccessLevel }> {
    if (viewerPersonId === subjectPersonId) {
      return { s1: 'ReadWrite', s2: 'ReadWrite' };
    }

    const resolution = await this.accessRoleResolution.resolve(
      viewerPersonId,
      subjectPersonId,
    );

    const managerAccess =
      resolution.reportingLine || resolution.projectLine
        ? resolution.managerSectionAccess
        : null;
    const ppAccess = resolution.peoplePartnerLine
      ? resolution.peoplePartnerSectionAccess
      : null;

    if (!managerAccess && !ppAccess) {
      return { s1: 'Read', s2: 'None' };
    }

    return {
      s1: this.mostPermissive(managerAccess?.s1?.level, ppAccess?.s1?.level),
      s2: this.mostPermissive(managerAccess?.s2?.level, ppAccess?.s2?.level),
    };
  }

  /**
   * Most-permissive-wins across independently-qualifying lines. An `undefined` input (line
   * didn't qualify, or its section object was malformed/missing a `level`) is treated as `None`,
   * never dereferenced further -- allowlist ranking, not a denylist, so an unrecognized level
   * string also loses (falls through to the `?? 0` default) rather than winning by accident.
   */
  private mostPermissive(
    ...levels: (SectionAccessLevel | undefined)[]
  ): SectionAccessLevel {
    const rank: Record<SectionAccessLevel, number> = {
      None: 0,
      Read: 1,
      ReadWrite: 2,
    };
    return levels.reduce<SectionAccessLevel>((best, level) => {
      const candidateRank = level ? rank[level] : undefined;
      return candidateRank !== undefined && candidateRank > rank[best]
        ? level!
        : best;
    }, 'None');
  }

  private toS1(person: PersonWithRelations): S1IdentityCard {
    return {
      fullName: person.fullName,
      photoUrl: person.photoUrl,
      position: person.position,
      department: person.department,
      countryCity: person.countryCity,
      workEmail: person.workEmail,
      workPhone: person.workPhone,
      birthdayMonth: person.birthdayMonth,
      birthdayDay: person.birthdayDay,
      startDate: person.startDate,
      manager: person.manager,
      peoplePartner: person.peoplePartner,
    };
  }

  private toS2(person: PersonWithRelations): S2PersonalContacts {
    return {
      personalPhone: person.personalPhone,
      personalEmail: person.personalEmail,
      residentialAddress: person.residentialAddress,
    };
  }
}
