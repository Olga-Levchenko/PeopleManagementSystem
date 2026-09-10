import {
  grantsSectionAccess,
  grantsSectionWriteAccess,
  resolveS16WriteAccess,
} from '../profile-audience.util';
import { NEITHER_LINE_RESOLUTION } from '../profile.ports';

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
        s10: { level: 'Read' },
        s11: { level: 'Read' },
        s16: { level: 'Read' },
      },
      peoplePartnerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
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
