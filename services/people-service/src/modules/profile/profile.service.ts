import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AccessRoleResolutionPort,
  S16CustomField,
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

/** S10: Leave entry. `leaveType` is present for Self/Manager/PP; absent (stripped) for Colleague. */
export interface S10Leave {
  startDate: Date;
  endDate: Date;
  leaveType?: string;
}

/** S11: Project assignment entry. `role`/`startDate`/`endDate` absent (stripped) for Colleague. */
export interface S11ProjectEntry {
  projectName: string;
  role?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * A section absent from this object entirely means "no access" -- never `s2: null`, never an
 * empty `{}`. Callers must assert on `Object.keys`, not a null check, per the frozen I/O matrix.
 * Exception: `s16` is always present (even as an empty array) because S16 uses per-field
 * filtering rather than section-level gating -- an empty array signals "no visible fields" without
 * revealing whether invisible fields exist.
 */
export interface ProfileResponse {
  s1?: S1IdentityCard;
  s2?: S2PersonalContacts;
  s10?: S10Leave[];
  s11?: S11ProjectEntry[];
  s16?: S16CustomField[];
}

type LeaveRow = {
  startDate: Date;
  endDate: Date;
  leaveType: string;
};

type ProjectAssignmentRow = {
  projectName: string;
  role: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

/**
 * Maps a viewer category to the custom-field visibility tier they can see.
 * Self → `'employee'` (sees employee + colleague fields; management fields are not for the subject
 * about themselves per the S16 matrix row).
 * Manager/PP → `'management'` (sees all visibility tiers).
 * Colleague → `'colleague'` (sees only colleague-visibility fields).
 */
type CustomFieldAudienceLevel = 'colleague' | 'employee' | 'management';

type CustomFieldValueRow = {
  value: string;
  definition: {
    id: string;
    name: string;
    visibility: string;
    isActive: boolean;
  };
};

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
  leaves: LeaveRow[];
  personProjectAssignments: ProjectAssignmentRow[];
  customFieldValues: CustomFieldValueRow[];
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
        leaves: {
          select: { startDate: true, endDate: true, leaveType: true },
          orderBy: { startDate: 'asc' },
        },
        personProjectAssignments: {
          select: {
            projectName: true,
            role: true,
            startDate: true,
            endDate: true,
          },
          orderBy: { startDate: 'asc' },
        },
        customFieldValues: {
          select: {
            value: true,
            definition: {
              select: {
                id: true,
                name: true,
                visibility: true,
                isActive: true,
              },
            },
          },
          orderBy: { definition: { name: 'asc' } },
        },
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
    if (this.grantsAccess(audience.s10)) {
      response.s10 = audience.isColleague
        ? this.toS10Colleague(person.leaves)
        : this.toS10(person.leaves);
    }
    if (this.grantsAccess(audience.s11)) {
      response.s11 = audience.isColleague
        ? this.toS11Colleague(person.personProjectAssignments)
        : this.toS11(person.personProjectAssignments);
    }
    // S16 is unconditionally present -- per-field filtering, not section-level gating.
    // An empty array signals "no visible fields" without revealing whether invisible ones exist.
    response.s16 = this.toS16(
      person.customFieldValues,
      audience.customFieldAudienceLevel,
    );
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
   * resolves to the Colleague whitelist (S1 read-only, no S2; S10/S11 read with field
   * restrictions).
   *
   * `isColleague` flag is distinct from `s2 === 'None'`: a narrowed Project-line-only viewer also
   * has `s2 === 'None'` per the section matrix but is entitled to full (unrestricted) S10/S11 data.
   * The flag makes the distinction unambiguous without further inspection of the resolution.
   */
  private async resolveAudience(
    viewerPersonId: string,
    subjectPersonId: string,
  ): Promise<{
    s1: SectionAccessLevel;
    s2: SectionAccessLevel;
    s10: SectionAccessLevel;
    s11: SectionAccessLevel;
    isColleague: boolean;
    customFieldAudienceLevel: CustomFieldAudienceLevel;
  }> {
    if (viewerPersonId === subjectPersonId) {
      return {
        s1: 'ReadWrite',
        s2: 'ReadWrite',
        s10: 'ReadWrite',
        s11: 'ReadWrite',
        isColleague: false,
        // Self sees employee + colleague fields; management fields are not for the subject
        // about themselves per the S16 section-matrix row.
        customFieldAudienceLevel: 'employee',
      };
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
      // Colleague whitelist: S10 and S11 are readable but with field restrictions applied
      // by the isColleague flag -- `leaveType` stripped from S10, `role`/dates stripped from S11.
      return {
        s1: 'Read',
        s2: 'None',
        s10: 'Read',
        s11: 'Read',
        isColleague: true,
        customFieldAudienceLevel: 'colleague',
      };
    }

    return {
      s1: this.mostPermissive(managerAccess?.s1?.level, ppAccess?.s1?.level),
      s2: this.mostPermissive(managerAccess?.s2?.level, ppAccess?.s2?.level),
      s10: this.mostPermissive(managerAccess?.s10?.level, ppAccess?.s10?.level),
      s11: this.mostPermissive(managerAccess?.s11?.level, ppAccess?.s11?.level),
      isColleague: false,
      customFieldAudienceLevel: 'management',
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

  /**
   * Pure visibility gate for a single custom field. Fail-closed: an unrecognised visibility value
   * is treated as `MANAGEMENT` (most restrictive).
   * - `COLLEAGUE` fields are visible to every audience.
   * - `EMPLOYEE` fields are visible to employee-level and management-level audiences (not colleague).
   * - `MANAGEMENT` fields are visible only to management-level audiences.
   */
  private canSeeCustomField(
    visibility: string,
    audienceLevel: CustomFieldAudienceLevel,
  ): boolean {
    switch (visibility) {
      case 'COLLEAGUE':
        return true;
      case 'EMPLOYEE':
        return audienceLevel === 'employee' || audienceLevel === 'management';
      case 'MANAGEMENT':
        return audienceLevel === 'management';
      default:
        // Unrecognised visibility value: fail closed, treat as management-only.
        return audienceLevel === 'management';
    }
  }

  /** Assembles the S16 array: always present, filtered by per-field visibility and isActive. */
  private toS16(
    customFieldValues: CustomFieldValueRow[],
    audienceLevel: CustomFieldAudienceLevel,
  ): S16CustomField[] {
    return customFieldValues
      .filter(
        (cfv) =>
          cfv.definition.isActive &&
          this.canSeeCustomField(cfv.definition.visibility, audienceLevel),
      )
      .map((cfv) => ({
        fieldId: cfv.definition.id,
        name: cfv.definition.name,
        value: cfv.value,
      }));
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

  /** Full S10 mapper (Self/Manager/PP): includes `leaveType`. */
  private toS10(leaves: LeaveRow[]): S10Leave[] {
    return leaves.map((l) => ({
      startDate: l.startDate,
      endDate: l.endDate,
      ...(l.leaveType ? { leaveType: l.leaveType } : {}),
    }));
  }

  /**
   * Colleague S10 mapper: strips `leaveType` entirely per the section matrix
   * (v1.5: "dates only, no type").
   */
  private toS10Colleague(leaves: LeaveRow[]): S10Leave[] {
    return leaves.map((l) => ({
      startDate: l.startDate,
      endDate: l.endDate,
    }));
  }

  /** Full S11 mapper (Self/Manager/PP): includes `role`, `startDate`, `endDate`. */
  private toS11(assignments: ProjectAssignmentRow[]): S11ProjectEntry[] {
    return assignments.map((a) => ({
      projectName: a.projectName,
      ...(a.role !== null ? { role: a.role } : {}),
      ...(a.startDate !== null ? { startDate: a.startDate } : {}),
      ...(a.endDate !== null ? { endDate: a.endDate } : {}),
    }));
  }

  /**
   * Colleague S11 mapper: strips `role`, `startDate`, `endDate` entirely per the section matrix
   * ("project name only").
   */
  private toS11Colleague(
    assignments: ProjectAssignmentRow[],
  ): S11ProjectEntry[] {
    return assignments.map((a) => ({ projectName: a.projectName }));
  }
}
