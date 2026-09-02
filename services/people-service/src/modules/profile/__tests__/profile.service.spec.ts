import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  NEITHER_LINE_RESOLUTION,
  parseAccessRoleResolution,
} from '../profile.ports';
import type { AccessRoleResolutionPort } from '../profile.ports';
import { ProfileService } from '../profile.service';

const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const MANAGER_ID = '33333333-3333-4333-8333-333333333333';
const PP_ID = '44444444-4444-4444-8444-444444444444';
const DEPARTMENT_ID = '55555555-5555-4555-8555-555555555555';

const FULL_PERSON_ROW = {
  fullName: 'Alex Ivanenko',
  photoUrl: 'https://example.test/photo.png',
  position: 'Senior Engineer',
  countryCity: 'Lviv, Ukraine',
  workEmail: 'alex.ivanenko@example.test',
  workPhone: '+380000000000',
  birthdayMonth: 6,
  birthdayDay: 15,
  startDate: new Date('2022-01-10T00:00:00.000Z'),
  personalPhone: '+380111111111',
  personalEmail: 'alex.personal@example.test',
  residentialAddress: '1 Test Street, Lviv',
  manager: { id: MANAGER_ID, fullName: 'Manager Personenko' },
  peoplePartner: { id: PP_ID, fullName: 'PP Personenko' },
  department: { id: DEPARTMENT_ID, name: 'Engineering' },
  leaves: [
    {
      startDate: new Date('2024-07-01T00:00:00.000Z'),
      endDate: new Date('2024-07-14T00:00:00.000Z'),
      leaveType: 'vacation',
    },
  ],
  personProjectAssignments: [
    {
      projectName: 'Project Alpha',
      role: 'Member',
      startDate: new Date('2023-06-01T00:00:00.000Z'),
      endDate: new Date('2024-06-01T00:00:00.000Z'),
    },
  ],
};

describe('ProfileService', () => {
  const createService = (
    accessRoleResolution: AccessRoleResolutionPort,
    personRow: unknown = FULL_PERSON_ROW,
  ) => {
    const prisma = {
      person: {
        findUnique: jest.fn().mockResolvedValue(personRow),
      },
    } as unknown as PrismaService;

    return {
      service: new ProfileService(prisma, accessRoleResolution),
      prisma,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Self: short-circuits before calling the resolver and returns full s1+s2+s10+s11', async () => {
    const resolve = jest.fn();
    const { service } = createService({ resolve });

    const result = await service.getProfile(SUBJECT_ID, SUBJECT_ID);

    expect(resolve).not.toHaveBeenCalled();
    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's2']);
    expect(result.s1).toMatchObject({
      fullName: FULL_PERSON_ROW.fullName,
      manager: FULL_PERSON_ROW.manager,
      peoplePartner: FULL_PERSON_ROW.peoplePartner,
    });
    expect(result.s2).toMatchObject({
      personalEmail: FULL_PERSON_ROW.personalEmail,
    });
    // Self sees full S10 data including leaveType
    expect(result.s10).toHaveLength(1);
    expect(result.s10![0]).toMatchObject({ leaveType: 'vacation' });
    // Self sees full S11 data including role and dates
    expect(result.s11).toHaveLength(1);
    expect(result.s11![0]).toMatchObject({
      role: 'Member',
      projectName: 'Project Alpha',
    });
  });

  it('Reporting line: reportingLine true with ReadWrite s1 / Read s2 / Read s10/s11 -> all four sections present with full field data', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      peoplePartnerLine: false,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'Read' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
      },
      peoplePartnerSectionAccess: null,
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(resolve).toHaveBeenCalledWith(VIEWER_ID, SUBJECT_ID);
    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's2']);
    expect(result.s1?.manager).toEqual(FULL_PERSON_ROW.manager);
    expect(result.s1?.peoplePartner).toEqual(FULL_PERSON_ROW.peoplePartner);
    // Manager sees full S10 with leaveType present
    expect(result.s10![0]).toHaveProperty('leaveType', 'vacation');
    // Manager sees full S11 with role and dates present
    expect(result.s11![0]).toHaveProperty('role', 'Member');
    expect(result.s11![0]).toHaveProperty('projectName', 'Project Alpha');
  });

  it('Project line only, narrowed: s2.level None -> s1+s10+s11 present with full data, s2 key absent', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: true,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'None' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11']);
    expect(result.s2).toBeUndefined();
    // Project-line viewer is NOT a colleague (isColleague: false) so gets full S10/S11 data
    expect(result.s10![0]).toHaveProperty('leaveType', 'vacation');
    expect(result.s11![0]).toHaveProperty('role', 'Member');
  });

  it('Colleague: neither line qualifies -> exactly s1+s10+s11 (whitelist), s2 absent', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      managerSectionAccess: null,
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    // Key-set assertion: exactly s1, s10, s11 -- no s2 or any other key
    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11']);
    expect(result.s2).toBeUndefined();
    expect(result.s1?.manager).toEqual(FULL_PERSON_ROW.manager);
    expect(result.s1?.peoplePartner).toEqual(FULL_PERSON_ROW.peoplePartner);
    // S10: dates present, leaveType stripped
    expect(result.s10).toHaveLength(1);
    expect(result.s10![0]).toHaveProperty('startDate');
    expect(result.s10![0]).toHaveProperty('endDate');
    expect(result.s10![0]).not.toHaveProperty('leaveType');
    // S11: projectName present, role/startDate/endDate stripped
    expect(result.s11).toHaveLength(1);
    expect(result.s11![0]).toHaveProperty('projectName', 'Project Alpha');
    expect(result.s11![0]).not.toHaveProperty('role');
    expect(result.s11![0]).not.toHaveProperty('startDate');
    expect(result.s11![0]).not.toHaveProperty('endDate');
  });

  it('EMPTY_RECORDS: subject with no leaves and no project assignments -> s10:[] and s11:[] both present as empty arrays for Colleague', async () => {
    const emptyPersonRow = {
      ...FULL_PERSON_ROW,
      leaves: [],
      personProjectAssignments: [],
    };
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      managerSectionAccess: null,
    });
    const { service } = createService({ resolve }, emptyPersonRow);

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11']);
    expect(result.s10).toEqual([]);
    expect(result.s11).toEqual([]);
  });

  it('toS10 full mapper: leaveType empty string -> key omitted (empty string is not a valid type value) for non-colleague viewer', async () => {
    const rowWithEmptyLeaveType = {
      ...FULL_PERSON_ROW,
      leaves: [
        {
          startDate: new Date('2024-07-01T00:00:00.000Z'),
          endDate: new Date('2024-07-14T00:00:00.000Z'),
          leaveType: '',
        },
      ],
    };
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      peoplePartnerLine: false,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'Read' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
      },
      peoplePartnerSectionAccess: null,
    });
    const { service } = createService({ resolve }, rowWithEmptyLeaveType);

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(result.s10).toHaveLength(1);
    expect(result.s10![0]).not.toHaveProperty('leaveType');
    expect(result.s10![0]).toHaveProperty('startDate');
    expect(result.s10![0]).toHaveProperty('endDate');
  });

  it('toS11 full mapper: role null -> key omitted (not present as null) for non-colleague viewer', async () => {
    const rowWithNullRole = {
      ...FULL_PERSON_ROW,
      personProjectAssignments: [
        {
          projectName: 'Project Alpha',
          role: null,
          startDate: new Date('2023-06-01T00:00:00.000Z'),
          endDate: new Date('2024-06-01T00:00:00.000Z'),
        },
      ],
    };
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      peoplePartnerLine: false,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'Read' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
      },
      peoplePartnerSectionAccess: null,
    });
    const { service } = createService({ resolve }, rowWithNullRole);

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(result.s11).toHaveLength(1);
    expect(result.s11![0]).toHaveProperty('projectName', 'Project Alpha');
    expect(result.s11![0]).not.toHaveProperty('role');
    expect(result.s11![0]).toHaveProperty('startDate');
    expect(result.s11![0]).toHaveProperty('endDate');
  });

  it('toS11 full mapper: startDate null with endDate set -> startDate key absent, endDate key present', async () => {
    const rowWithNullStart = {
      ...FULL_PERSON_ROW,
      personProjectAssignments: [
        {
          projectName: 'Project Alpha',
          role: 'Member',
          startDate: null,
          endDate: new Date('2024-06-01T00:00:00.000Z'),
        },
      ],
    };
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      peoplePartnerLine: false,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'Read' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
      },
      peoplePartnerSectionAccess: null,
    });
    const { service } = createService({ resolve }, rowWithNullStart);

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(result.s11).toHaveLength(1);
    expect(result.s11![0]).toHaveProperty('projectName', 'Project Alpha');
    expect(result.s11![0]).toHaveProperty('role', 'Member');
    expect(result.s11![0]).not.toHaveProperty('startDate');
    expect(result.s11![0]).toHaveProperty('endDate');
  });

  it('toS11 full mapper: endDate null with startDate set -> endDate key absent, startDate key present', async () => {
    const rowWithNullEnd = {
      ...FULL_PERSON_ROW,
      personProjectAssignments: [
        {
          projectName: 'Project Alpha',
          role: 'Member',
          startDate: new Date('2023-06-01T00:00:00.000Z'),
          endDate: null,
        },
      ],
    };
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      peoplePartnerLine: false,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'Read' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
      },
      peoplePartnerSectionAccess: null,
    });
    const { service } = createService({ resolve }, rowWithNullEnd);

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(result.s11).toHaveLength(1);
    expect(result.s11![0]).toHaveProperty('projectName', 'Project Alpha');
    expect(result.s11![0]).toHaveProperty('role', 'Member');
    expect(result.s11![0]).toHaveProperty('startDate');
    expect(result.s11![0]).not.toHaveProperty('endDate');
  });

  it('Resolver unreachable: port already failed closed to the "neither line" shape -> Colleague whitelist s1+s10+s11, no 5xx', async () => {
    const resolve = jest.fn().mockResolvedValue(NEITHER_LINE_RESOLUTION);
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11']);
  });

  it('Unknown subjectPersonId: no Person row matches -> NotFoundException, resolver never called', async () => {
    const resolve = jest.fn();
    const { service } = createService({ resolve }, null);

    await expect(
      service.getProfile(VIEWER_ID, SUBJECT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('reportingLine||projectLine true but managerSectionAccess missing falls back to Colleague (defensive, malformed response)', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      managerSectionAccess: null,
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    // Falls back to Colleague whitelist: s1+s10+s11 with field restrictions
    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11']);
  });

  it('unrecognized level string from access-control-service fails closed (allowlist, not a denylist)', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      managerSectionAccess: {
        s1: { level: 'SomeFutureLevel' },
        s2: { level: 'None' },
        s10: { level: 'None' },
        s11: { level: 'None' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result)).toEqual([]);
  });

  it('PP line: peoplePartnerLine true, neither Manager line qualifying -> unnarrowed s1+s2+s10+s11 from peoplePartnerSectionAccess', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      peoplePartnerLine: true,
      managerSectionAccess: null,
      peoplePartnerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(resolve).toHaveBeenCalledWith(VIEWER_ID, SUBJECT_ID);
    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's2']);
    expect(result.s1?.manager).toEqual(FULL_PERSON_ROW.manager);
    expect(result.s1?.peoplePartner).toEqual(FULL_PERSON_ROW.peoplePartner);
    // PP sees full S10/S11 data (isColleague: false)
    expect(result.s10![0]).toHaveProperty('leaveType', 'vacation');
    expect(result.s11![0]).toHaveProperty('role', 'Member');
  });

  it('PP line and Reporting line both qualify: most-permissive-wins per section (Reporting Read vs PP ReadWrite on S2 -> PP wins)', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      peoplePartnerLine: true,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'Read' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
      },
      peoplePartnerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's2']);
    expect(result.s2).toMatchObject({
      personalEmail: FULL_PERSON_ROW.personalEmail,
    });
  });

  it('Narrowed Project line and PP line both qualify: PP is the only line that grants S2 -- checking Manager first must not drop it', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: true,
      peoplePartnerLine: true,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'None' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
      },
      peoplePartnerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's2']);
    expect(result.s2).toMatchObject({
      personalEmail: FULL_PERSON_ROW.personalEmail,
    });
  });

  it('managerSectionAccess present but missing the s2/s10/s11 keys entirely: treated as None, never throws', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    // s2/s10/s11 missing from managerSectionAccess: all resolve to None, only s1 present
    expect(Object.keys(result)).toEqual(['s1']);
  });

  it('PP line qualifies but peoplePartnerSectionAccess missing falls back to Colleague (defensive, malformed response)', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      peoplePartnerLine: true,
      managerSectionAccess: null,
      peoplePartnerSectionAccess: null,
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    // Falls back to Colleague whitelist: s1+s10+s11 with field restrictions
    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11']);
  });

  it('No line qualifies (including PP): Colleague whitelist, s1+s10+s11 present, s2 absent', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      peoplePartnerLine: false,
      managerSectionAccess: null,
      peoplePartnerSectionAccess: null,
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11']);
    expect(result.s2).toBeUndefined();
  });
});

describe('parseAccessRoleResolution', () => {
  it('non-object input -> NEITHER_LINE_RESOLUTION (fail closed)', () => {
    expect(parseAccessRoleResolution(null)).toEqual(NEITHER_LINE_RESOLUTION);
    expect(parseAccessRoleResolution('string')).toEqual(
      NEITHER_LINE_RESOLUTION,
    );
    expect(parseAccessRoleResolution(42)).toEqual(NEITHER_LINE_RESOLUTION);
  });

  it('boolean flags require strict === true (truthy non-boolean treated as false)', () => {
    const result = parseAccessRoleResolution({
      reportingLine: 1,
      projectLine: 'yes',
      peoplePartnerLine: {},
      managerSectionAccess: null,
      peoplePartnerSectionAccess: null,
    });
    expect(result.reportingLine).toBe(false);
    expect(result.projectLine).toBe(false);
    expect(result.peoplePartnerLine).toBe(false);
  });

  it('unrecognized level string -> coerced to None (allowlist)', () => {
    const result = parseAccessRoleResolution({
      reportingLine: true,
      projectLine: false,
      peoplePartnerLine: false,
      managerSectionAccess: {
        s1: { level: 'SuperAdmin' },
        s2: { level: 'Read' },
        s10: { level: 'ReadWrite' },
        s11: { level: null },
      },
      peoplePartnerSectionAccess: null,
    });
    expect(result.managerSectionAccess?.s1.level).toBe('None');
    expect(result.managerSectionAccess?.s2.level).toBe('Read');
    expect(result.managerSectionAccess?.s10.level).toBe('ReadWrite');
    expect(result.managerSectionAccess?.s11.level).toBe('None');
  });

  it('valid full payload parses correctly', () => {
    const result = parseAccessRoleResolution({
      reportingLine: true,
      projectLine: false,
      peoplePartnerLine: true,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'Read' },
        s10: { level: 'Read' },
        s11: { level: 'None' },
      },
      peoplePartnerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
      },
    });
    expect(result.reportingLine).toBe(true);
    expect(result.peoplePartnerLine).toBe(true);
    expect(result.managerSectionAccess?.s1.level).toBe('ReadWrite');
    expect(result.peoplePartnerSectionAccess?.s2.level).toBe('ReadWrite');
  });

  it('section access group that is not an object -> null', () => {
    const result = parseAccessRoleResolution({
      reportingLine: true,
      projectLine: false,
      peoplePartnerLine: false,
      managerSectionAccess: 'broken',
      peoplePartnerSectionAccess: null,
    });
    expect(result.managerSectionAccess).toBeNull();
  });
});
