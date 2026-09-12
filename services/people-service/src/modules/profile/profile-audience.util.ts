import type { AccessRoleResolution, SectionAccessLevel } from './profile.ports';

export type CustomFieldAudienceLevel = 'colleague' | 'employee' | 'management';

export function grantsSectionAccess(level: SectionAccessLevel): boolean {
  return level === 'Read' || level === 'ReadWrite';
}

export function grantsSectionWriteAccess(level: SectionAccessLevel): boolean {
  return level === 'ReadWrite';
}

export function resolveS16WriteAccess(
  resolution: AccessRoleResolution,
): SectionAccessLevel {
  const fullAccess =
    resolution.fullProfileAccessLine &&
    resolution.fullProfileAccessSectionAccess != null
      ? resolution.fullProfileAccessSectionAccess
      : null;
  if (fullAccess) {
    return mostPermissive(fullAccess.s16?.level);
  }

  const managerAccess =
    resolution.reportingLine || resolution.projectLine
      ? resolution.managerSectionAccess
      : null;
  const ppAccess = resolution.peoplePartnerLine
    ? resolution.peoplePartnerSectionAccess
    : null;

  return mostPermissive(managerAccess?.s16?.level, ppAccess?.s16?.level);
}

export interface ResolvedProfileAudience {
  s1: SectionAccessLevel;
  s2: SectionAccessLevel;
  s3: SectionAccessLevel;
  s4: SectionAccessLevel;
  s5: SectionAccessLevel;
  s6: SectionAccessLevel;
  s9: SectionAccessLevel;
  s10: SectionAccessLevel;
  s11: SectionAccessLevel;
  isColleague: boolean;
  customFieldAudienceLevel: CustomFieldAudienceLevel;
}

function mostPermissive(
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

const NO_SECTION_ACCESS: Pick<
  ResolvedProfileAudience,
  's3' | 's4' | 's5' | 's6' | 's9'
> = {
  s3: 'None',
  s4: 'None',
  s5: 'None',
  s6: 'None',
  s9: 'None',
};

/**
 * Self-only section overrides merged at function exit (Story 2.7). Preserves FPA-first
 * `customFieldAudienceLevel` and other section levels from the underlying resolution.
 */
function applySelfSectionOverrides(
  audience: ResolvedProfileAudience,
  viewerPersonId: string,
  subjectPersonId: string,
): ResolvedProfileAudience {
  if (viewerPersonId !== subjectPersonId) {
    return audience;
  }
  return {
    ...audience,
    s4: 'Read',
    s9: 'Read',
    s6: 'None',
  };
}

/**
 * Derives per-subject profile audience from an already-resolved access-role payload.
 * Shared by profile assembly and the All Employees list (Story 2.1).
 */
export function deriveAudienceFromResolution(
  resolution: AccessRoleResolution,
  viewerPersonId: string,
  subjectPersonId: string,
): ResolvedProfileAudience {
  const fullAccess =
    resolution.fullProfileAccessLine &&
    resolution.fullProfileAccessSectionAccess != null
      ? resolution.fullProfileAccessSectionAccess
      : null;
  if (fullAccess) {
    return applySelfSectionOverrides(
      {
        s1: mostPermissive(fullAccess.s1?.level),
        s2: mostPermissive(fullAccess.s2?.level),
        s3: mostPermissive(fullAccess.s3?.level),
        s10: mostPermissive(fullAccess.s10?.level),
        s11: mostPermissive(fullAccess.s11?.level),
        s4: mostPermissive(fullAccess.s4?.level),
        s5: mostPermissive(fullAccess.s5?.level),
        s6: mostPermissive(fullAccess.s6?.level),
        s9: mostPermissive(fullAccess.s9?.level),
        isColleague: false,
        customFieldAudienceLevel: 'management',
      },
      viewerPersonId,
      subjectPersonId,
    );
  }

  if (viewerPersonId === subjectPersonId) {
    return applySelfSectionOverrides(
      {
        s1: 'ReadWrite',
        s2: 'ReadWrite',
        s3: 'ReadWrite',
        s5: 'ReadWrite',
        s10: 'ReadWrite',
        s11: 'ReadWrite',
        s4: 'None',
        s6: 'None',
        s9: 'None',
        isColleague: false,
        customFieldAudienceLevel: 'employee',
      },
      viewerPersonId,
      subjectPersonId,
    );
  }

  const managerAccess =
    resolution.reportingLine || resolution.projectLine
      ? resolution.managerSectionAccess
      : null;
  const ppAccess = resolution.peoplePartnerLine
    ? resolution.peoplePartnerSectionAccess
    : null;

  if (!managerAccess && !ppAccess) {
    return applySelfSectionOverrides(
      {
        s1: 'Read',
        s2: 'None',
        s10: 'Read',
        s11: 'Read',
        ...NO_SECTION_ACCESS,
        isColleague: true,
        customFieldAudienceLevel: 'colleague',
      },
      viewerPersonId,
      subjectPersonId,
    );
  }

  return applySelfSectionOverrides(
    {
      s1: mostPermissive(managerAccess?.s1?.level, ppAccess?.s1?.level),
      s2: mostPermissive(managerAccess?.s2?.level, ppAccess?.s2?.level),
      s10: mostPermissive(managerAccess?.s10?.level, ppAccess?.s10?.level),
      s11: mostPermissive(managerAccess?.s11?.level, ppAccess?.s11?.level),
      s3: 'None',
      s4: mostPermissive(managerAccess?.s4?.level, ppAccess?.s4?.level),
      s5: 'None',
      s6: 'None',
      s9: mostPermissive(managerAccess?.s9?.level, ppAccess?.s9?.level),
      isColleague: false,
      customFieldAudienceLevel: 'management',
    },
    viewerPersonId,
    subjectPersonId,
  );
}
