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

const MGMT_FIELD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EMPLOYEE_FIELD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const COLLEAGUE_FIELD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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
  customFieldValues: [
    {
      value: 'mgmt-value',
      definition: {
        id: MGMT_FIELD_ID,
        name: 'Internal Grade',
        visibility: 'MANAGEMENT',
        isActive: true,
      },
    },
    {
      value: 'employee-value',
      definition: {
        id: EMPLOYEE_FIELD_ID,
        name: 'Bio',
        visibility: 'EMPLOYEE',
        isActive: true,
      },
    },
    {
      value: 'colleague-value',
      definition: {
        id: COLLEAGUE_FIELD_ID,
        name: 'Office Location',
        visibility: 'COLLEAGUE',
        isActive: true,
      },
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

  it('Self: non-FPA self-view calls resolver then returns full s1+s2+s10+s11+s16 with employee-level s16', async () => {
    const resolve = jest.fn().mockResolvedValue(NEITHER_LINE_RESOLUTION);
    const { service } = createService({ resolve });

    const result = await service.getProfile(SUBJECT_ID, SUBJECT_ID);

    expect(resolve).toHaveBeenCalledWith(SUBJECT_ID, SUBJECT_ID);
    expect(Object.keys(result).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
      's2',
    ]);
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
    // SELF S16: management field absent; employee + colleague fields present
    const s16FieldIds = result.s16.map((f) => f.fieldId);
    expect(s16FieldIds).not.toContain(MGMT_FIELD_ID);
    expect(s16FieldIds).toContain(EMPLOYEE_FIELD_ID);
    expect(s16FieldIds).toContain(COLLEAGUE_FIELD_ID);
  });

  it('Reporting line: reportingLine true with ReadWrite s1 / Read s2 / Read s10/s11 -> all four sections present with full field data; s16 has all three fields', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      peoplePartnerLine: false,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'Read' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
        s16: { level: 'ReadWrite' },
      },
      peoplePartnerSectionAccess: null,
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(resolve).toHaveBeenCalledWith(VIEWER_ID, SUBJECT_ID);
    expect(Object.keys(result).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
      's2',
    ]);
    expect(result.s1?.manager).toEqual(FULL_PERSON_ROW.manager);
    expect(result.s1?.peoplePartner).toEqual(FULL_PERSON_ROW.peoplePartner);
    // Manager sees full S10 with leaveType present
    expect(result.s10![0]).toHaveProperty('leaveType', 'vacation');
    // Manager sees full S11 with role and dates present
    expect(result.s11![0]).toHaveProperty('role', 'Member');
    expect(result.s11![0]).toHaveProperty('projectName', 'Project Alpha');
    // MANAGER S16: management audience sees all three visibility tiers
    const s16FieldIds = result.s16.map((f) => f.fieldId);
    expect(s16FieldIds).toContain(MGMT_FIELD_ID);
    expect(s16FieldIds).toContain(EMPLOYEE_FIELD_ID);
    expect(s16FieldIds).toContain(COLLEAGUE_FIELD_ID);
  });

  it('Project line only, narrowed: s2.level None -> s1+s10+s11+s16 present with full data, s2 key absent', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: true,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'None' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
        s16: { level: 'ReadWrite' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's16']);
    expect(result.s2).toBeUndefined();
    // Project-line viewer is NOT a colleague (isColleague: false) so gets full S10/S11 data
    expect(result.s10![0]).toHaveProperty('leaveType', 'vacation');
    expect(result.s11![0]).toHaveProperty('role', 'Member');
    // Project-line DM/PM gets management-level S16 access
    const s16FieldIds = result.s16.map((f) => f.fieldId);
    expect(s16FieldIds).toContain(MGMT_FIELD_ID);
  });

  it('Colleague: neither line qualifies -> exactly s1+s10+s11+s16 (whitelist), s2 absent; s16 has only colleague-visibility field', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      managerSectionAccess: null,
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    // COLLEAGUE_WHITELIST_KEYS: exactly s1, s10, s11, s16 -- no s2 or any other key
    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's16']);
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
    // MANAGEMENT_FIELD_COLLEAGUE: management field absent, s16 is non-null (array)
    const s16FieldIds = result.s16.map((f) => f.fieldId);
    expect(s16FieldIds).not.toContain(MGMT_FIELD_ID);
    // EMPLOYEE_FIELD_COLLEAGUE: employee field absent
    expect(s16FieldIds).not.toContain(EMPLOYEE_FIELD_ID);
    // COLLEAGUE_FIELD_ALL: colleague-visibility field present
    expect(s16FieldIds).toContain(COLLEAGUE_FIELD_ID);
  });

  it('EMPTY_RECORDS: subject with no leaves and no project assignments -> s10:[] and s11:[] both present as empty arrays for Colleague; s16:[] when no colleague-visibility values exist', async () => {
    const emptyPersonRow = {
      ...FULL_PERSON_ROW,
      leaves: [],
      personProjectAssignments: [],
      customFieldValues: [],
    };
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      managerSectionAccess: null,
    });
    const { service } = createService({ resolve }, emptyPersonRow);

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's16']);
    expect(result.s10).toEqual([]);
    expect(result.s11).toEqual([]);
    // NO_VALUES: s16 always present even when there are no custom field values
    expect(result.s16).toEqual([]);
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

  it('Resolver unreachable: port already failed closed to the "neither line" shape -> Colleague whitelist s1+s10+s11+s16, no 5xx', async () => {
    const resolve = jest.fn().mockResolvedValue(NEITHER_LINE_RESOLUTION);
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's16']);
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

    // Falls back to Colleague whitelist: s1+s10+s11+s16 with field restrictions
    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's16']);
  });

  it('unrecognized level string from access-control-service fails closed (allowlist, not a denylist) -- s16 still present', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      managerSectionAccess: {
        s1: { level: 'SomeFutureLevel' },
        s2: { level: 'None' },
        s10: { level: 'None' },
        s11: { level: 'None' },
        s16: { level: 'None' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    // s16 is always present; other sections with None/unrecognized levels are absent
    expect(Object.keys(result)).toEqual(['s16']);
  });

  it('PP line: peoplePartnerLine true, neither Manager line qualifying -> unnarrowed s1+s2+s10+s11+s16 from peoplePartnerSectionAccess', async () => {
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
        s16: { level: 'ReadWrite' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(resolve).toHaveBeenCalledWith(VIEWER_ID, SUBJECT_ID);
    expect(Object.keys(result).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
      's2',
    ]);
    expect(result.s1?.manager).toEqual(FULL_PERSON_ROW.manager);
    expect(result.s1?.peoplePartner).toEqual(FULL_PERSON_ROW.peoplePartner);
    // PP sees full S10/S11 data (isColleague: false)
    expect(result.s10![0]).toHaveProperty('leaveType', 'vacation');
    expect(result.s11![0]).toHaveProperty('role', 'Member');
    // PP sees all S16 fields (management audience level)
    const s16FieldIds = result.s16.map((f) => f.fieldId);
    expect(s16FieldIds).toContain(MGMT_FIELD_ID);
    expect(s16FieldIds).toContain(COLLEAGUE_FIELD_ID);
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
        s16: { level: 'ReadWrite' },
      },
      peoplePartnerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
        s16: { level: 'ReadWrite' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
      's2',
    ]);
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
        s16: { level: 'ReadWrite' },
      },
      peoplePartnerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
        s10: { level: 'Read' },
        s11: { level: 'Read' },
        s16: { level: 'ReadWrite' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
      's2',
    ]);
    expect(result.s2).toMatchObject({
      personalEmail: FULL_PERSON_ROW.personalEmail,
    });
  });

  it('managerSectionAccess present but missing the s2/s10/s11 keys entirely: treated as None, never throws; s16 still present', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    // s2/s10/s11 missing from managerSectionAccess: all resolve to None, only s1 + s16 present
    expect(Object.keys(result).sort()).toEqual(['s1', 's16']);
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

    // Falls back to Colleague whitelist: s1+s10+s11+s16 with field restrictions
    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's16']);
  });

  it('No line qualifies (including PP): Colleague whitelist, s1+s10+s11+s16 present, s2 absent', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      peoplePartnerLine: false,
      managerSectionAccess: null,
      peoplePartnerSectionAccess: null,
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's16']);
    expect(result.s2).toBeUndefined();
  });

  // --- Full-profile-access tests (Story 1.5) ---

  it('Full profile access: fullProfileAccessLine true with all-ReadWrite fullProfileAccessSectionAccess -> all four sections present with full data, management-level S16', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      peoplePartnerLine: false,
      fullProfileAccessLine: true,
      managerSectionAccess: null,
      peoplePartnerSectionAccess: null,
      fullProfileAccessSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
        s10: { level: 'ReadWrite' },
        s11: { level: 'ReadWrite' },
        s16: { level: 'ReadWrite' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(resolve).toHaveBeenCalledWith(VIEWER_ID, SUBJECT_ID);
    // All four principal sections present (s1+s2+s10+s11) plus s16
    expect(Object.keys(result).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
      's2',
    ]);
    // Gets full (unrestricted) S10 data including leaveType
    expect(result.s10![0]).toHaveProperty('leaveType', 'vacation');
    // Gets full S11 data including role and dates
    expect(result.s11![0]).toHaveProperty('role', 'Member');
    expect(result.s11![0]).toHaveProperty('projectName', 'Project Alpha');
    // Management-level S16: all three visibility tiers visible
    const s16FieldIds = result.s16.map((f) => f.fieldId);
    expect(s16FieldIds).toContain(MGMT_FIELD_ID);
    expect(s16FieldIds).toContain(EMPLOYEE_FIELD_ID);
    expect(s16FieldIds).toContain(COLLEAGUE_FIELD_ID);
  });

  it('Full profile access: fullProfileAccessLine true takes priority over a narrowed Project-line-only resolution', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: true,
      peoplePartnerLine: false,
      fullProfileAccessLine: true,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'None' },   // narrowed Project-line would deny S2
        s10: { level: 'Read' },
        s11: { level: 'Read' },
        s16: { level: 'ReadWrite' },
      },
      peoplePartnerSectionAccess: null,
      fullProfileAccessSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' }, // Full-access overrides the None
        s10: { level: 'ReadWrite' },
        s11: { level: 'ReadWrite' },
        s16: { level: 'ReadWrite' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    // Full-profile-access takes priority: S2 must be present despite narrowed Project line
    expect(Object.keys(result).sort()).toEqual([
      's1',
      's10',
      's11',
      's16',
      's2',
    ]);
    expect(result.s2).toMatchObject({
      personalEmail: FULL_PERSON_ROW.personalEmail,
    });
  });

  it('Full profile access: fullProfileAccessLine true but fullProfileAccessSectionAccess null falls back gracefully (malformed response)', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      peoplePartnerLine: false,
      fullProfileAccessLine: true,
      managerSectionAccess: null,
      peoplePartnerSectionAccess: null,
      fullProfileAccessSectionAccess: null, // malformed: flag true but section access absent
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    // Falls back to Colleague whitelist (fail-closed: no access granted on malformed response)
    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's16']);
    expect(result.s2).toBeUndefined();
  });

  it('Full profile access: FPA holder viewing their own profile gets management-level S16, not employee-level', async () => {
    // Verifies the fix for the self-view short-circuit bug: the resolver must be called before
    // the self-view guard so FPA is checked first (spec §2.4: FullProfileAccessLine is viewer-only
    // and preserved for self-view; the resolver returns fullProfileAccessLine=true even when
    // viewerPersonId === subjectPersonId).
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      peoplePartnerLine: false,
      fullProfileAccessLine: true,
      managerSectionAccess: null,
      peoplePartnerSectionAccess: null,
      fullProfileAccessSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'ReadWrite' },
        s10: { level: 'ReadWrite' },
        s11: { level: 'ReadWrite' },
        s16: { level: 'ReadWrite' },
      },
    });
    const { service } = createService({ resolve });

    // Self-view: viewerPersonId === subjectPersonId
    const result = await service.getProfile(VIEWER_ID, VIEWER_ID);

    // FPA path: all sections present and S16 includes management-level field
    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's16', 's2']);
    const s16FieldIds = (result.s16 as Array<{ fieldId: string }>).map((f) => f.fieldId);
    expect(s16FieldIds).toContain(MGMT_FIELD_ID);
    // Resolver was called with the same ID for both viewer and subject
    expect(resolve).toHaveBeenCalledWith(VIEWER_ID, VIEWER_ID);
  });

  it('Full profile access: non-FPA self-view still returns employee-level S16', async () => {
    // After the fix, non-FPA self-view falls through to the self-view short-circuit as before.
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      peoplePartnerLine: false,
      fullProfileAccessLine: false,
      managerSectionAccess: null,
      peoplePartnerSectionAccess: null,
      fullProfileAccessSectionAccess: null,
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, VIEWER_ID);

    // Self-view path: S16 absent management field
    expect(Object.keys(result).sort()).toEqual(['s1', 's10', 's11', 's16', 's2']);
    const s16FieldIds = (result.s16 as Array<{ fieldId: string }>).map((f) => f.fieldId);
    expect(s16FieldIds).not.toContain(MGMT_FIELD_ID);
    expect(s16FieldIds).toContain(EMPLOYEE_FIELD_ID);
  });

  // --- S16 dedicated scenario tests (Story 1.10) ---

  it('INACTIVE_DEFINITION: inactive field definition is absent from s16 for all audiences', async () => {
    const inactivePersonRow = {
      ...FULL_PERSON_ROW,
      customFieldValues: [
        {
          value: 'colleague-value',
          definition: {
            id: COLLEAGUE_FIELD_ID,
            name: 'Office Location',
            visibility: 'COLLEAGUE',
            isActive: false, // inactive
          },
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
        s16: { level: 'ReadWrite' },
      },
      peoplePartnerSectionAccess: null,
    });
    const { service } = createService({ resolve }, inactivePersonRow);

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    // Even a colleague-visibility field is absent when the definition is inactive
    expect(result.s16).toEqual([]);
  });

  it('MANAGEMENT_FIELD_SELF: management-visibility field absent from s16 for Self audience', async () => {
    const mgmtOnlyRow = {
      ...FULL_PERSON_ROW,
      customFieldValues: [
        {
          value: 'mgmt-value',
          definition: {
            id: MGMT_FIELD_ID,
            name: 'Internal Grade',
            visibility: 'MANAGEMENT',
            isActive: true,
          },
        },
      ],
    };
    const resolve = jest.fn().mockResolvedValue(NEITHER_LINE_RESOLUTION);
    const { service } = createService({ resolve }, mgmtOnlyRow);

    const result = await service.getProfile(SUBJECT_ID, SUBJECT_ID);

    expect(result.s16).toEqual([]);
  });

  it('EMPLOYEE_FIELD_SELF: employee-visibility field present in s16 for Self audience', async () => {
    const employeeOnlyRow = {
      ...FULL_PERSON_ROW,
      customFieldValues: [
        {
          value: 'employee-value',
          definition: {
            id: EMPLOYEE_FIELD_ID,
            name: 'Bio',
            visibility: 'EMPLOYEE',
            isActive: true,
          },
        },
      ],
    };
    const resolve = jest.fn().mockResolvedValue(NEITHER_LINE_RESOLUTION);
    const { service } = createService({ resolve }, employeeOnlyRow);

    const result = await service.getProfile(SUBJECT_ID, SUBJECT_ID);

    expect(result.s16).toHaveLength(1);
    expect(result.s16[0]).toMatchObject({
      fieldId: EMPLOYEE_FIELD_ID,
      value: 'employee-value',
    });
  });

  it('UNRECOGNISED_VISIBILITY: unrecognised visibility value fails closed (treated as management-only)', async () => {
    const unknownVisRow = {
      ...FULL_PERSON_ROW,
      customFieldValues: [
        {
          value: 'mystery-value',
          definition: {
            id: COLLEAGUE_FIELD_ID,
            name: 'Unknown Field',
            visibility: 'SOMETHING_NEW',
            isActive: true,
          },
        },
      ],
    };
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      managerSectionAccess: null,
    });
    const { service } = createService({ resolve }, unknownVisRow);

    // Colleague should NOT see a field with unrecognised visibility (fail closed to management)
    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);
    expect(result.s16).toEqual([]);
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
