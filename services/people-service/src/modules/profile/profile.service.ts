import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  deriveAudienceFromResolution,
  grantsSectionWriteAccess,
  resolveS16WriteAccess,
  type CustomFieldAudienceLevel,
} from './profile-audience.util';
import {
  DERIVED_FIELD_KEYS,
  EDITABLE_S1_FIELD_KEYS,
  EDITABLE_S2_FIELD_KEYS,
  ORG_RELATIONSHIP_FIELD_KEYS,
  parseCustomFieldKey,
} from './profile-field-keys.util';
import type {
  AccessRoleResolution,
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
  s16: S16CustomField[];
}

export interface PatchProfileFieldResponse {
  fieldKey: string;
  value: string | number | boolean | null;
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

/**
 * Pure visibility gate for a single custom field. Fail-closed: an unrecognised visibility value
 * is treated as `MANAGEMENT` (most restrictive).
 * - `COLLEAGUE` fields are visible to every audience.
 * - `EMPLOYEE` fields are visible to employee-level and management-level audiences (not colleague).
 * - `MANAGEMENT` fields are visible only to management-level audiences.
 *
 * Exported at module level so Epic-2 surfaces (list engine, export) can import it directly
 * without requiring an HTTP hop or a shared service injection.
 */
export function canSeeCustomField(
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

    const response: ProfileResponse = { s16: [] };
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

  async patchProfileField(
    viewerPersonId: string,
    subjectPersonId: string,
    fieldKey: string,
    value: unknown,
  ): Promise<PatchProfileFieldResponse> {
    if (!fieldKey || typeof fieldKey !== 'string' || fieldKey.trim() === '') {
      throw new BadRequestException('fieldKey is required.');
    }

    if (DERIVED_FIELD_KEYS.has(fieldKey)) {
      throw new BadRequestException(`Field '${fieldKey}' is not writable.`);
    }

    if (ORG_RELATIONSHIP_FIELD_KEYS.has(fieldKey)) {
      throw new ForbiddenException({
        message:
          'Organisational relationship fields cannot be edited through this endpoint.',
        error: 'ORG_RELATIONSHIP_FIELD_NOT_EDITABLE',
      });
    }

    const customDefinitionId = parseCustomFieldKey(fieldKey);
    if (fieldKey.startsWith('custom:') && customDefinitionId === null) {
      throw new BadRequestException(`Malformed field key '${fieldKey}'.`);
    }

    const person = await this.prisma.person.findUnique({
      where: { id: subjectPersonId },
      select: { id: true },
    });
    if (!person) {
      throw new NotFoundException('Person not found');
    }

    const isSelf = viewerPersonId === subjectPersonId;
    if (isSelf) {
      return this.patchSelfProfileField(subjectPersonId, fieldKey, value);
    }

    const resolution = await this.accessRoleResolution.resolve(
      viewerPersonId,
      subjectPersonId,
    );
    const audience = deriveAudienceFromResolution(
      resolution,
      viewerPersonId,
      subjectPersonId,
    );

    if (customDefinitionId) {
      return this.patchCustomFieldValue(
        subjectPersonId,
        fieldKey,
        customDefinitionId,
        value,
        resolution,
        audience.customFieldAudienceLevel,
      );
    }

    if (!EDITABLE_S1_FIELD_KEYS.has(fieldKey)) {
      throw new ForbiddenException();
    }

    if (!grantsSectionWriteAccess(audience.s1)) {
      throw new ForbiddenException();
    }

    const persisted = await this.patchStoredS1Field(
      subjectPersonId,
      fieldKey,
      value,
    );
    return { fieldKey, value: persisted };
  }

  private patchSelfProfileField(
    subjectPersonId: string,
    fieldKey: string,
    value: unknown,
  ): Promise<PatchProfileFieldResponse> {
    if (!EDITABLE_S2_FIELD_KEYS.has(fieldKey)) {
      throw new ForbiddenException(
        'Self-edit is not permitted on All Employees.',
      );
    }

    const audience = deriveAudienceFromResolution(
      {
        reportingLine: false,
        projectLine: false,
        peoplePartnerLine: false,
        fullProfileAccessLine: false,
        managerSectionAccess: null,
        peoplePartnerSectionAccess: null,
        fullProfileAccessSectionAccess: null,
      },
      subjectPersonId,
      subjectPersonId,
    );

    if (!grantsSectionWriteAccess(audience.s2)) {
      throw new ForbiddenException();
    }

    return this.patchStoredS2Field(subjectPersonId, fieldKey, value).then(
      (persisted) => ({ fieldKey, value: persisted }),
    );
  }

  private async patchStoredS2Field(
    subjectPersonId: string,
    fieldKey: string,
    value: unknown,
  ): Promise<string | null> {
    if (value === null) {
      await this.prisma.person.update({
        where: { id: subjectPersonId },
        data: { [fieldKey]: null },
      });
      return null;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException(`Invalid value for field '${fieldKey}'.`);
    }
    await this.prisma.person.update({
      where: { id: subjectPersonId },
      data: { [fieldKey]: value },
    });
    return value;
  }

  private async patchStoredS1Field(
    subjectPersonId: string,
    fieldKey: string,
    value: unknown,
  ): Promise<string | null> {
    switch (fieldKey) {
      case 'fullName': {
        if (typeof value !== 'string') {
          throw new BadRequestException(
            `Invalid value for field '${fieldKey}'.`,
          );
        }
        const trimmed = value.trim();
        if (!trimmed) {
          throw new BadRequestException(`Field '${fieldKey}' cannot be empty.`);
        }
        await this.prisma.person.update({
          where: { id: subjectPersonId },
          data: { fullName: trimmed },
        });
        return trimmed;
      }
      case 'position':
      case 'countryCity': {
        if (value === null) {
          await this.prisma.person.update({
            where: { id: subjectPersonId },
            data: { [fieldKey]: null },
          });
          return null;
        }
        if (typeof value !== 'string') {
          throw new BadRequestException(
            `Invalid value for field '${fieldKey}'.`,
          );
        }
        await this.prisma.person.update({
          where: { id: subjectPersonId },
          data: { [fieldKey]: value },
        });
        return value;
      }
      case 'startDate': {
        const parsed = this.parseIsoDateOrNull(value, fieldKey);
        await this.prisma.person.update({
          where: { id: subjectPersonId },
          data: { startDate: parsed },
        });
        return parsed ? parsed.toISOString().slice(0, 10) : null;
      }
      default:
        throw new ForbiddenException();
    }
  }

  private async patchCustomFieldValue(
    subjectPersonId: string,
    fieldKey: string,
    definitionId: string,
    value: unknown,
    resolution: AccessRoleResolution,
    audienceLevel: CustomFieldAudienceLevel,
  ): Promise<PatchProfileFieldResponse> {
    const s16Write = resolveS16WriteAccess(resolution);
    if (!grantsSectionWriteAccess(s16Write)) {
      throw new ForbiddenException();
    }

    const definition = await this.prisma.customFieldDefinition.findUnique({
      where: { id: definitionId },
      select: { id: true, visibility: true, dataType: true, isActive: true },
    });
    if (!definition || !definition.isActive) {
      throw new BadRequestException(
        `Custom field definition for '${fieldKey}' is not active.`,
      );
    }
    if (!canSeeCustomField(definition.visibility, audienceLevel)) {
      throw new ForbiddenException();
    }

    const storedValue = this.validateCustomFieldValue(
      fieldKey,
      definition.dataType,
      value,
    );

    await this.prisma.customFieldValue.upsert({
      where: {
        definitionId_personId: {
          definitionId,
          personId: subjectPersonId,
        },
      },
      create: {
        definitionId,
        personId: subjectPersonId,
        value: storedValue,
      },
      update: { value: storedValue },
    });

    return {
      fieldKey,
      value: this.deserializeCustomFieldResponseValue(
        definition.dataType,
        storedValue,
      ),
    };
  }

  private validateCustomFieldValue(
    fieldKey: string,
    dataType: string,
    value: unknown,
  ): string {
    switch (dataType) {
      case 'TEXT': {
        if (typeof value !== 'string') {
          throw new BadRequestException(
            `Invalid value for field '${fieldKey}'.`,
          );
        }
        return value.trim();
      }
      case 'NUMBER': {
        const numeric =
          typeof value === 'number'
            ? value
            : typeof value === 'string'
              ? Number(value)
              : NaN;
        if (!Number.isFinite(numeric)) {
          throw new BadRequestException(
            `Invalid value for field '${fieldKey}'.`,
          );
        }
        return String(numeric);
      }
      case 'DATE': {
        const parsed = this.parseIsoDateOrNull(value, fieldKey);
        return parsed ? parsed.toISOString().slice(0, 10) : '';
      }
      case 'BOOLEAN': {
        if (value !== true && value !== false) {
          throw new BadRequestException(
            `Invalid value for field '${fieldKey}'.`,
          );
        }
        return value ? 'true' : 'false';
      }
      default:
        throw new BadRequestException(`Invalid value for field '${fieldKey}'.`);
    }
  }

  private deserializeCustomFieldResponseValue(
    dataType: string,
    storedValue: string,
  ): string | number | boolean | null {
    switch (dataType) {
      case 'NUMBER':
        return storedValue === '' ? null : Number(storedValue);
      case 'BOOLEAN':
        return storedValue === 'true';
      case 'DATE':
        return storedValue === '' ? null : storedValue;
      default:
        return storedValue;
    }
  }

  private parseIsoDateOrNull(value: unknown, fieldKey: string): Date | null {
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`Invalid value for field '${fieldKey}'.`);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid value for field '${fieldKey}'.`);
    }
    return parsed;
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
   * The resolver is always called first -- including for self-view -- because
   * `FullProfileAccessLine` is viewer-only (not relationship-derived) and is preserved by the
   * resolver even for self-view (spec §2.4). An FPA holder viewing their own profile must
   * receive `'management'` customFieldAudienceLevel, not the default `'employee'` that the
   * self-view short-circuit would produce. For non-FPA self-view the short-circuit below still
   * applies after the FPA check. Manager (Reporting-line/Project-line, via `managerSectionAccess`)
   * and PP-line (via `peoplePartnerSectionAccess`) are two independent, simultaneously-possible
   * qualifying lines -- per-section, the most-permissive level across whichever lines qualify wins
   * (matching `ManagerSectionAccessPolicy`'s own most-permissive-path-wins rule one level up: a
   * narrowed Project-line-only viewer who is also the subject's PP must still get PP's ReadWrite
   * on S2, not the narrowed Project-line Read/None -- checking Manager first and returning
   * immediately would silently drop that). A malformed section object (present but missing a
   * `level` key) is treated as absent, not dereferenced -- fails closed, never throws. No line
   * qualifying at all resolves to the Colleague whitelist (S1 read-only, no S2; S10/S11 read
   * with field restrictions).
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
    const resolution = await this.accessRoleResolution.resolve(
      viewerPersonId,
      subjectPersonId,
    );

    return deriveAudienceFromResolution(
      resolution,
      viewerPersonId,
      subjectPersonId,
    );
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
          canSeeCustomField(cfv.definition.visibility, audienceLevel),
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
