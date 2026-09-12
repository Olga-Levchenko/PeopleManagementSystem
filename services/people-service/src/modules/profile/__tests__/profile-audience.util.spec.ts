import {
  deriveAudienceFromResolution,
  grantsSectionAccess,
  grantsSectionWriteAccess,
  resolveS16WriteAccess,
} from '../profile-audience.util';
import { NEITHER_LINE_RESOLUTION } from '../profile.ports';

const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';

describe('grantsSectionWriteAccess', () => {
  it('grants only ReadWrite', () => {
    expect(grantsSectionWriteAccess('ReadWrite')).toBe(true);
    expect(grantsSectionWriteAccess('Read')).toBe(false);
    expect(grantsSectionWriteAccess('None')).toBe(false);
  });

  it('differs from grantsSectionAccess which includes Read', () => {
    expect(grantsSectionAccess('Read')).toBe(true);
    expect(grantsSectionWriteAccess('Read')).toBe(false);
  });
});

describe('resolveS16WriteAccess', () => {
  it('returns ReadWrite from full profile access section access', () => {
    const level = resolveS16WriteAccess({
      ...NEITHER_LINE_RESOLUTION,
      fullProfileAccessLine: true,
      fullProfileAccessSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
        s4: { level: 'ReadWrite' },
        s6: { level: 'ReadWrite' },
        s9: { level: 'ReadWrite' },
        s10: { level: 'ReadWrite' },
        s11: { level: 'ReadWrite' },
        s16: { level: 'ReadWrite' },
      },
    });
    expect(level).toBe('ReadWrite');
  });

  it('returns most-permissive s16 across manager and PP paths', () => {
    const level = resolveS16WriteAccess({
      ...NEITHER_LINE_RESOLUTION,
      reportingLine: true,
      peoplePartnerLine: true,
      managerSectionAccess: {
        s1: { level: 'Read' },
        s2: { level: 'Read' },
        s4: { level: 'Read' },
        s6: { level: 'Read' },
        s9: { level: 'Read' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
        s16: { level: 'Read' },
      },
      peoplePartnerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
        s4: { level: 'ReadWrite' },
        s6: { level: 'ReadWrite' },
        s9: { level: 'ReadWrite' },
        s10: { level: 'ReadWrite' },
        s11: { level: 'ReadWrite' },
        s16: { level: 'ReadWrite' },
      },
    });
    expect(level).toBe('ReadWrite');
  });

  it('returns None when no qualifying line exists', () => {
    expect(resolveS16WriteAccess(NEITHER_LINE_RESOLUTION)).toBe('None');
  });
});

describe('deriveAudienceFromResolution', () => {
  it('merges self S4/S9 Read and S6 None for non-FPA self-view', () => {
    const audience = deriveAudienceFromResolution(
      NEITHER_LINE_RESOLUTION,
      SUBJECT_ID,
      SUBJECT_ID,
    );

    expect(audience.s3).toBe('ReadWrite');
    expect(audience.s5).toBe('ReadWrite');
    expect(audience.s4).toBe('Read');
    expect(audience.s9).toBe('Read');
    expect(audience.s6).toBe('None');
    expect(audience.customFieldAudienceLevel).toBe('employee');
  });

  it('preserves FPA management S16 tier while merging self S4/S9/S6 overrides', () => {
    const audience = deriveAudienceFromResolution(
      {
        ...NEITHER_LINE_RESOLUTION,
        fullProfileAccessLine: true,
        fullProfileAccessSectionAccess: {
          s1: { level: 'ReadWrite' },
          s2: { level: 'ReadWrite' },
          s4: { level: 'ReadWrite' },
          s6: { level: 'ReadWrite' },
          s9: { level: 'ReadWrite' },
          s10: { level: 'ReadWrite' },
          s11: { level: 'ReadWrite' },
          s16: { level: 'ReadWrite' },
        },
      },
      VIEWER_ID,
      VIEWER_ID,
    );

    expect(audience.customFieldAudienceLevel).toBe('management');
    expect(audience.s4).toBe('Read');
    expect(audience.s9).toBe('Read');
    expect(audience.s6).toBe('None');
  });

  it('does not grant S4/S9 to colleague viewers', () => {
    const audience = deriveAudienceFromResolution(
      NEITHER_LINE_RESOLUTION,
      VIEWER_ID,
      SUBJECT_ID,
    );

    expect(audience.s3).toBe('None');
    expect(audience.s5).toBe('None');
    expect(audience.s4).toBe('None');
    expect(audience.s9).toBe('None');
    expect(audience.isColleague).toBe(true);
  });

  const managerSectionAccessRw = {
    s1: { level: 'ReadWrite' as const },
    s2: { level: 'Read' as const },
    s3: { level: 'Read' as const },
    s4: { level: 'ReadWrite' as const },
    s5: { level: 'Read' as const },
    s6: { level: 'ReadWrite' as const },
    s9: { level: 'ReadWrite' as const },
    s10: { level: 'Read' as const },
    s11: { level: 'Read' as const },
    s16: { level: 'ReadWrite' as const },
  };

  it('grants manager S4/S9 from ACS on reporting line toward another subject', () => {
    const audience = deriveAudienceFromResolution(
      {
        ...NEITHER_LINE_RESOLUTION,
        reportingLine: true,
        managerSectionAccess: managerSectionAccessRw,
      },
      VIEWER_ID,
      SUBJECT_ID,
    );

    expect(audience.s3).toBe('Read');
    expect(audience.s4).toBe('ReadWrite');
    expect(audience.s5).toBe('Read');
    expect(audience.s9).toBe('ReadWrite');
    expect(audience.s6).toBe('None');
    expect(audience.isColleague).toBe(false);
  });

  it('grants PP S4/S9 from peoplePartnerSectionAccess when PP line only', () => {
    const audience = deriveAudienceFromResolution(
      {
        ...NEITHER_LINE_RESOLUTION,
        peoplePartnerLine: true,
        peoplePartnerSectionAccess: managerSectionAccessRw,
      },
      VIEWER_ID,
      SUBJECT_ID,
    );

    expect(audience.s3).toBe('Read');
    expect(audience.s4).toBe('ReadWrite');
    expect(audience.s5).toBe('Read');
    expect(audience.s9).toBe('ReadWrite');
  });

  it('project-line-only manager receives S5 but not S3 when ACS narrows project line', () => {
    const audience = deriveAudienceFromResolution(
      {
        ...NEITHER_LINE_RESOLUTION,
        projectLine: true,
        managerSectionAccess: {
          ...managerSectionAccessRw,
          s2: { level: 'None' },
          s3: { level: 'None' },
          s5: { level: 'Read' },
        },
      },
      VIEWER_ID,
      SUBJECT_ID,
    );

    expect(audience.s3).toBe('None');
    expect(audience.s5).toBe('Read');
  });

  it('reporting and project line together restore S3 via most-permissive merge', () => {
    const audience = deriveAudienceFromResolution(
      {
        ...NEITHER_LINE_RESOLUTION,
        reportingLine: true,
        projectLine: true,
        managerSectionAccess: {
          ...managerSectionAccessRw,
          s3: { level: 'Read' },
          s5: { level: 'Read' },
        },
      },
      VIEWER_ID,
      SUBJECT_ID,
    );

    expect(audience.s3).toBe('Read');
    expect(audience.s5).toBe('Read');
  });

  it('project-line-only manager still receives S4/S9 when ACS grants RW', () => {
    const audience = deriveAudienceFromResolution(
      {
        ...NEITHER_LINE_RESOLUTION,
        projectLine: true,
        managerSectionAccess: {
          ...managerSectionAccessRw,
          s2: { level: 'None' },
        },
      },
      VIEWER_ID,
      SUBJECT_ID,
    );

    expect(audience.s2).toBe('None');
    expect(audience.s4).toBe('ReadWrite');
    expect(audience.s9).toBe('ReadWrite');
  });

  it('merges s6 None on self-view when resolution reports reporting line with s6 ReadWrite', () => {
    const audience = deriveAudienceFromResolution(
      {
        ...NEITHER_LINE_RESOLUTION,
        reportingLine: true,
        managerSectionAccess: {
          s1: { level: 'ReadWrite' },
          s2: { level: 'Read' },
          s4: { level: 'ReadWrite' },
          s6: { level: 'ReadWrite' },
          s9: { level: 'ReadWrite' },
          s10: { level: 'Read' },
          s11: { level: 'Read' },
          s16: { level: 'ReadWrite' },
        },
      },
      SUBJECT_ID,
      SUBJECT_ID,
    );

    expect(audience.s6).toBe('None');
    expect(audience.s4).toBe('Read');
    expect(audience.s9).toBe('Read');
  });
});
