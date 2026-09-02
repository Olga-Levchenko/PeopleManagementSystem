import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NEITHER_LINE_RESOLUTION } from '../profile.ports';
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

  it('Self: short-circuits before calling the resolver and returns full s1+s2', async () => {
    const resolve = jest.fn();
    const { service } = createService({ resolve });

    const result = await service.getProfile(SUBJECT_ID, SUBJECT_ID);

    expect(resolve).not.toHaveBeenCalled();
    expect(Object.keys(result).sort()).toEqual(['s1', 's2']);
    expect(result.s1).toMatchObject({
      fullName: FULL_PERSON_ROW.fullName,
      manager: FULL_PERSON_ROW.manager,
      peoplePartner: FULL_PERSON_ROW.peoplePartner,
    });
    expect(result.s2).toMatchObject({
      personalEmail: FULL_PERSON_ROW.personalEmail,
    });
  });

  it('Reporting line: reportingLine true with ReadWrite s1 / Read s2 -> both sections present', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'Read' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(resolve).toHaveBeenCalledWith(VIEWER_ID, SUBJECT_ID);
    expect(Object.keys(result).sort()).toEqual(['s1', 's2']);
    expect(result.s1?.manager).toEqual(FULL_PERSON_ROW.manager);
    expect(result.s1?.peoplePartner).toEqual(FULL_PERSON_ROW.peoplePartner);
  });

  it('Project line only, narrowed: s2.level None -> s1 present, s2 key absent', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: true,
      managerSectionAccess: {
        s1: { level: 'ReadWrite' },
        s2: { level: 'None' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result)).toEqual(['s1']);
    expect(result.s2).toBeUndefined();
  });

  it('Colleague: neither line qualifies -> only s1 present (whitelist), s2 absent', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: false,
      projectLine: false,
      managerSectionAccess: null,
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result)).toEqual(['s1']);
    expect(result.s2).toBeUndefined();
    expect(result.s1?.manager).toEqual(FULL_PERSON_ROW.manager);
    expect(result.s1?.peoplePartner).toEqual(FULL_PERSON_ROW.peoplePartner);
  });

  it('Resolver unreachable: port already failed closed to the "neither line" shape -> same Colleague, S1-only, no 5xx', async () => {
    const resolve = jest.fn().mockResolvedValue(NEITHER_LINE_RESOLUTION);
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result)).toEqual(['s1']);
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

    expect(Object.keys(result)).toEqual(['s1']);
  });

  it('unrecognized level string from access-control-service fails closed (allowlist, not a denylist)', async () => {
    const resolve = jest.fn().mockResolvedValue({
      reportingLine: true,
      projectLine: false,
      managerSectionAccess: {
        s1: { level: 'SomeFutureLevel' },
        s2: { level: 'None' },
      },
    });
    const { service } = createService({ resolve });

    const result = await service.getProfile(VIEWER_ID, SUBJECT_ID);

    expect(Object.keys(result)).toEqual([]);
  });
});
