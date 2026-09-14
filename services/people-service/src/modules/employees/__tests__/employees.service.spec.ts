import { BadRequestException } from '@nestjs/common';
import type { AccessRoleResolutionPort } from '../../profile/profile.ports';
import { NEITHER_LINE_RESOLUTION } from '../../profile/profile.ports';
import { COLLEAGUE_CATALOG_FIELDS } from '../employees-colleague.util';
import {
  EmployeesService,
  computeYearsWithCompany,
} from '../employees.service';

describe('computeYearsWithCompany', () => {
  it('returns null when startDate is null', () => {
    expect(computeYearsWithCompany(null)).toBeNull();
  });

  it('returns whole years elapsed from startDate', () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    expect(computeYearsWithCompany(twoYearsAgo)).toBeGreaterThanOrEqual(1);
  });
});

describe('EmployeesService', () => {
  const viewerId = '11111111-1111-4111-8111-111111111111';
  const subjectId = '22222222-2222-4222-8222-222222222222';
  const managementSubjectId = '33333333-3333-4333-8333-333333333333';
  const colleagueSubjectId = '44444444-4444-4444-8444-444444444444';

  const prisma = {
    customFieldDefinition: {
      findMany: jest.fn(),
    },
    person: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    personProjectAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    department: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const resolve = jest.fn<AccessRoleResolutionPort['resolve']>();
  const resolveBatch = jest.fn<AccessRoleResolutionPort['resolveBatch']>();
  const accessRoleResolution: AccessRoleResolutionPort = {
    resolve,
    resolveBatch,
  };

  const service = new EmployeesService(prisma as never, accessRoleResolution);

  beforeEach(() => {
    jest.clearAllMocks();
    resolve.mockResolvedValue(NEITHER_LINE_RESOLUTION);
    resolveBatch.mockImplementation(
      (_viewer: string, subjectPersonIds: readonly string[]) => {
        const managementResolution = {
          ...NEITHER_LINE_RESOLUTION,
          reportingLine: true,
          managerSectionAccess: { s1: { level: 'ReadWrite' as const } },
        };
        const results = new Map<string, typeof managementResolution>();
        for (const subjectPersonId of subjectPersonIds) {
          results.set(subjectPersonId, managementResolution);
        }
        return Promise.resolve(results);
      },
    );
    prisma.person.findMany.mockImplementation(
      (args: { where?: { managerId?: string } }) => {
        if (args.where?.managerId) {
          return Promise.resolve([{ id: managementSubjectId }]);
        }
        return Promise.resolve([]);
      },
    );
  });

  it('returns dashboard metadata only for the supplied authorized IDs and de-duplicates projects', async () => {
    prisma.person.findMany.mockResolvedValue([
      {
        id: subjectId,
        fullName: 'Pseudonym',
        department: { id: 'dept', name: 'Engineering' },
        manager: null,
        peoplePartner: null,
        personProjectAssignments: [
          { projectName: 'Alpha' },
          { projectName: 'Alpha' },
        ],
      },
    ]);
    await expect(
      service.getRiskDashboardMetadata([subjectId]),
    ).resolves.toEqual({
      people: [
        {
          personId: subjectId,
          fullName: 'Pseudonym',
          department: { id: 'dept', label: 'Engineering' },
          manager: null,
          peoplePartner: null,
          projects: [{ id: 'Alpha', label: 'Alpha' }],
        },
      ],
    });
    expect(prisma.person.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [subjectId] } } }),
    );
  });

  it('getFieldCatalog includes management-only custom fields when ACS reports management audience', async () => {
    prisma.customFieldDefinition.findMany.mockResolvedValue([
      {
        id: 'cf-management',
        name: 'Internal Grade',
        visibility: 'MANAGEMENT',
        dataType: 'TEXT',
      },
      {
        id: 'cf-colleague',
        name: 'Desk',
        visibility: 'COLLEAGUE',
        dataType: 'TEXT',
      },
    ]);
    resolve.mockResolvedValue(NEITHER_LINE_RESOLUTION);
    resolveBatch.mockResolvedValue(
      new Map([
        [
          managementSubjectId,
          {
            ...NEITHER_LINE_RESOLUTION,
            reportingLine: true,
            managerSectionAccess: { s1: { level: 'ReadWrite' } },
          },
        ],
      ]),
    );

    const catalog = await service.getFieldCatalog(viewerId);

    const keys = catalog.fields.map((field) => field.key);
    expect(keys).toContain('custom:cf-management');
    expect(keys).toContain('custom:cf-colleague');
    expect(resolveBatch).toHaveBeenCalled();
  });

  it('getFieldCatalog includes management fields when a project teammate has management audience', async () => {
    const projectTeammateId = '55555555-5555-4555-8555-555555555555';
    prisma.customFieldDefinition.findMany.mockResolvedValue([
      {
        id: 'cf-management',
        name: 'Internal Grade',
        visibility: 'MANAGEMENT',
        dataType: 'TEXT',
      },
    ]);
    prisma.personProjectAssignment.findMany.mockImplementation(
      (args: { where?: { personId?: string; projectName?: unknown } }) => {
        if (args.where?.personId === viewerId) {
          return Promise.resolve([{ projectName: 'Alpha' }]);
        }
        if (args.where?.projectName) {
          return Promise.resolve([{ personId: projectTeammateId }]);
        }
        return Promise.resolve([]);
      },
    );
    resolve.mockResolvedValue(NEITHER_LINE_RESOLUTION);
    resolveBatch.mockResolvedValue(
      new Map([
        [
          projectTeammateId,
          {
            ...NEITHER_LINE_RESOLUTION,
            projectLine: true,
            managerSectionAccess: { s1: { level: 'ReadWrite' } },
          },
        ],
      ]),
    );

    const catalog = await service.getFieldCatalog(viewerId);

    expect(catalog.fields.map((field) => field.key)).toContain(
      'custom:cf-management',
    );
  });

  it('getFieldCatalog excludes management-only custom fields for colleague viewers', async () => {
    prisma.customFieldDefinition.findMany.mockResolvedValue([
      {
        id: 'cf-management',
        name: 'Internal Grade',
        visibility: 'MANAGEMENT',
        dataType: 'TEXT',
      },
      {
        id: 'cf-colleague',
        name: 'Desk',
        visibility: 'COLLEAGUE',
        dataType: 'TEXT',
      },
    ]);
    resolve.mockResolvedValue(NEITHER_LINE_RESOLUTION);
    resolveBatch.mockResolvedValue(new Map());

    const catalog = await service.getFieldCatalog(viewerId);

    const keys = catalog.fields.map((field) => field.key);
    expect(keys).not.toContain('custom:cf-management');
    expect(keys).toContain('custom:cf-colleague');
  });

  it('getFieldCatalog returns normative colleague whitelist without yearsWithCompany', async () => {
    prisma.customFieldDefinition.findMany.mockResolvedValue([]);
    resolve.mockResolvedValue(NEITHER_LINE_RESOLUTION);
    resolveBatch.mockResolvedValue(new Map());

    const catalog = await service.getFieldCatalog(viewerId);

    expect(catalog.listAudienceLevel).toBe('colleague');
    const keys = catalog.fields.map((field) => field.key);
    expect(keys).toEqual([
      ...COLLEAGUE_CATALOG_FIELDS.map((field) => field.key),
    ]);
    expect(keys).not.toContain('yearsWithCompany');
  });

  it('listEmployees calls resolveBatch once per page and projects colleague whitelist rows', async () => {
    prisma.customFieldDefinition.findMany.mockResolvedValue([]);
    resolve.mockResolvedValue(NEITHER_LINE_RESOLUTION);
    prisma.person.count.mockResolvedValue(1);
    prisma.person.findMany.mockResolvedValue([
      {
        id: subjectId,
        fullName: 'Subject Person',
        position: 'Engineer',
        countryCity: 'Kyiv',
        workEmail: 'subject@example.com',
        workPhone: '+380000000',
        birthdayMonth: 3,
        birthdayDay: 15,
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        department: { name: 'Platform' },
        manager: { fullName: 'Manager Person' },
        peoplePartner: { fullName: 'PP Person' },
        leaves: [
          {
            startDate: new Date('2026-06-01T00:00:00.000Z'),
            endDate: new Date('2026-06-10T00:00:00.000Z'),
            leaveType: 'vacation',
          },
        ],
        personProjectAssignments: [
          {
            projectName: 'Project Alpha',
            role: 'Member',
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T00:00:00.000Z'),
          },
        ],
        customFieldValues: [],
      },
    ]);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Array<Promise<unknown>>),
    );
    resolveBatch.mockResolvedValue(
      new Map([[subjectId, NEITHER_LINE_RESOLUTION]]),
    );

    const result = await service.listEmployees(viewerId, {
      page: 1,
      pageSize: 50,
    });

    expect(resolveBatch).toHaveBeenCalledWith(viewerId, [subjectId]);
    expect(result.totalCount).toBe(1);
    expect(result.items[0]?.values.fullName).toBe('Subject Person');
    expect(result.items[0]?.values.yearsWithCompany).toBeUndefined();
    expect(result.items[0]?.values.leaveDates).toBe('2026-06-01 – 2026-06-10');
    expect(result.items[0]?.values.projectName).toBe('Project Alpha');
    expect(result.items[0]?.values).not.toHaveProperty('leaveType');
    expect(result.items[0]?.values).not.toHaveProperty('role');
    expect(result.items[0]?.editableFields).toEqual([]);
  });

  it('listEmployees projects colleague whitelist for viewer own row under colleague catalog', async () => {
    prisma.customFieldDefinition.findMany.mockResolvedValue([]);
    resolve.mockResolvedValue(NEITHER_LINE_RESOLUTION);
    resolveBatch.mockResolvedValue(new Map());
    prisma.person.count.mockResolvedValue(1);
    prisma.person.findMany.mockResolvedValue([
      {
        id: viewerId,
        fullName: 'Viewer Person',
        position: 'Engineer',
        countryCity: 'Kyiv',
        workEmail: 'viewer@example.com',
        workPhone: null,
        birthdayMonth: 4,
        birthdayDay: 20,
        startDate: new Date('2019-05-01T00:00:00.000Z'),
        department: { name: 'Platform' },
        manager: { fullName: 'Manager Person' },
        peoplePartner: { fullName: 'PP Person' },
        leaves: [
          {
            startDate: new Date('2026-07-01T00:00:00.000Z'),
            endDate: new Date('2026-07-05T00:00:00.000Z'),
          },
        ],
        personProjectAssignments: [
          {
            projectName: 'Project Beta',
            role: 'Member',
            startDate: new Date('2026-01-01T00:00:00.000Z'),
            endDate: new Date('2026-12-31T00:00:00.000Z'),
          },
        ],
        customFieldValues: [],
      },
    ]);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Array<Promise<unknown>>),
    );
    resolveBatch.mockResolvedValue(
      new Map([[viewerId, NEITHER_LINE_RESOLUTION]]),
    );

    const result = await service.listEmployees(viewerId, {
      page: 1,
      pageSize: 50,
    });

    expect(result.items[0]?.values.yearsWithCompany).toBeUndefined();
    expect(result.items[0]?.values.leaveDates).toBe('2026-07-01 – 2026-07-05');
    expect(result.items[0]?.values.projectName).toBe('Project Beta');
  });

  it('listEmployees rejects departmentId filter for colleague catalog audience', async () => {
    prisma.customFieldDefinition.findMany.mockResolvedValue([]);
    resolve.mockResolvedValue(NEITHER_LINE_RESOLUTION);
    resolveBatch.mockResolvedValue(new Map());

    await expect(
      service.listEmployees(viewerId, {
        page: 1,
        pageSize: 50,
        departmentId: 'dept-123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listEmployees hybrid catalog projects management rows and colleague whitelist rows on same page', async () => {
    const managementResolution = {
      ...NEITHER_LINE_RESOLUTION,
      reportingLine: true,
      managerSectionAccess: { s1: { level: 'ReadWrite' as const } },
    };
    const personRowBase = {
      position: 'Engineer',
      countryCity: 'Kyiv',
      startDate: new Date('2020-01-01T00:00:00.000Z'),
      department: { name: 'Platform' },
      workEmail: 'person@example.com',
      workPhone: null,
      birthdayMonth: 1,
      birthdayDay: 1,
      manager: { fullName: 'Manager Person' },
      peoplePartner: { fullName: 'PP Person' },
      leaves: [],
      personProjectAssignments: [],
      customFieldValues: [],
    };

    prisma.customFieldDefinition.findMany.mockResolvedValue([]);
    resolve.mockResolvedValue(managementResolution);
    prisma.person.count.mockResolvedValue(2);
    prisma.person.findMany.mockResolvedValue([
      {
        id: managementSubjectId,
        fullName: 'Report Person',
        ...personRowBase,
      },
      {
        id: colleagueSubjectId,
        fullName: 'Colleague Person',
        ...personRowBase,
      },
    ]);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Array<Promise<unknown>>),
    );
    resolveBatch.mockImplementation(
      (_viewer: string, subjectPersonIds: readonly string[]) => {
        const results = new Map();
        for (const subjectPersonId of subjectPersonIds) {
          results.set(
            subjectPersonId,
            subjectPersonId === colleagueSubjectId
              ? NEITHER_LINE_RESOLUTION
              : managementResolution,
          );
        }
        return Promise.resolve(results);
      },
    );

    const result = await service.listEmployees(viewerId, {
      page: 1,
      pageSize: 50,
    });

    const reportRow = result.items.find(
      (item) => item.personId === managementSubjectId,
    );
    const colleagueRow = result.items.find(
      (item) => item.personId === colleagueSubjectId,
    );

    expect(reportRow?.values.yearsWithCompany).not.toBeNull();
    expect(colleagueRow?.values.yearsWithCompany).toBeUndefined();
    expect(colleagueRow?.values.workEmail).toBe('person@example.com');
  });

  it('listEmployees rejects management-only filters for colleague catalog audience', async () => {
    prisma.customFieldDefinition.findMany.mockResolvedValue([]);
    resolve.mockResolvedValue(NEITHER_LINE_RESOLUTION);
    resolveBatch.mockResolvedValue(new Map());

    await expect(
      service.listEmployees(viewerId, {
        page: 1,
        pageSize: 50,
        yearsWithCompanyMin: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('listEmployees includes editableFields for RW manager audience on other subjects', async () => {
    prisma.person.count.mockResolvedValue(1);
    prisma.person.findMany.mockResolvedValue([
      {
        id: subjectId,
        fullName: 'Subject Person',
        position: 'Engineer',
        countryCity: 'Kyiv',
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        department: { name: 'Platform' },
        customFieldValues: [],
      },
    ]);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Array<Promise<unknown>>),
    );
    resolveBatch.mockResolvedValue(
      new Map([
        [
          subjectId,
          {
            ...NEITHER_LINE_RESOLUTION,
            reportingLine: true,
            managerSectionAccess: {
              s1: { level: 'ReadWrite' },
              s2: { level: 'ReadWrite' },
              s10: { level: 'Read' },
              s11: { level: 'Read' },
              s16: { level: 'ReadWrite' },
            },
          },
        ],
      ]),
    );

    const result = await service.listEmployees(viewerId, {
      page: 1,
      pageSize: 50,
    });

    expect(result.items[0]?.editableFields).toEqual(
      expect.arrayContaining([
        'fullName',
        'position',
        'countryCity',
        'startDate',
      ]),
    );
  });

  it('listEmployees omits editableFields for R-only manager audience', async () => {
    prisma.person.count.mockResolvedValue(1);
    prisma.person.findMany.mockResolvedValue([
      {
        id: subjectId,
        fullName: 'Subject Person',
        position: 'Engineer',
        countryCity: 'Kyiv',
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        department: { name: 'Platform' },
        customFieldValues: [],
      },
    ]);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Array<Promise<unknown>>),
    );
    resolveBatch.mockResolvedValue(
      new Map([
        [
          subjectId,
          {
            ...NEITHER_LINE_RESOLUTION,
            reportingLine: true,
            managerSectionAccess: {
              s1: { level: 'Read' },
              s2: { level: 'Read' },
              s10: { level: 'Read' },
              s11: { level: 'Read' },
              s16: { level: 'Read' },
            },
          },
        ],
      ]),
    );

    const result = await service.listEmployees(viewerId, {
      page: 1,
      pageSize: 50,
    });

    expect(result.items[0]?.editableFields).toEqual([]);
  });

  it('listEmployees returns empty editableFields for viewer own row', async () => {
    prisma.person.count.mockResolvedValue(1);
    prisma.person.findMany.mockResolvedValue([
      {
        id: viewerId,
        fullName: 'Viewer Person',
        position: 'Lead',
        countryCity: 'Kyiv',
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        department: { name: 'Platform' },
        customFieldValues: [],
      },
    ]);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Array<Promise<unknown>>),
    );
    resolveBatch.mockResolvedValue(
      new Map([
        [
          viewerId,
          {
            ...NEITHER_LINE_RESOLUTION,
            reportingLine: true,
            managerSectionAccess: {
              s1: { level: 'ReadWrite' },
              s2: { level: 'ReadWrite' },
              s10: { level: 'Read' },
              s11: { level: 'Read' },
              s16: { level: 'ReadWrite' },
            },
          },
        ],
      ]),
    );

    const result = await service.listEmployees(viewerId, {
      page: 1,
      pageSize: 50,
    });

    expect(result.items[0]?.values.fullName).toBe('Viewer Person');
    expect(result.items[0]?.editableFields).toEqual([]);
  });

  it('listEmployees omits management custom fields for colleague-tier audience', async () => {
    prisma.person.count.mockResolvedValue(1);
    prisma.person.findMany.mockResolvedValue([
      {
        id: subjectId,
        fullName: 'Subject Person',
        position: 'Engineer',
        countryCity: 'Kyiv',
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        department: { name: 'Platform' },
        customFieldValues: [
          {
            value: 'Secret',
            definition: {
              id: 'cf-management',
              name: 'Internal Grade',
              visibility: 'MANAGEMENT',
              isActive: true,
            },
          },
        ],
      },
    ]);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Array<Promise<unknown>>),
    );
    resolveBatch.mockResolvedValue(
      new Map([[subjectId, NEITHER_LINE_RESOLUTION]]),
    );

    const result = await service.listEmployees(viewerId, {
      page: 1,
      pageSize: 50,
    });

    expect(result.items[0]?.values['custom:cf-management']).toBeUndefined();
  });

  it('listEmployees applies yearsWithCompanyMin filter via startDate upper bound', async () => {
    const fixedNow = new Date('2026-01-01T00:00:00.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

    prisma.person.count.mockResolvedValue(0);
    prisma.person.findMany.mockImplementation(
      (args: {
        where?: { managerId?: string; startDate?: unknown };
        skip?: number;
      }) => {
        if (args.where?.managerId) {
          return Promise.resolve([{ id: managementSubjectId }]);
        }
        if (args.skip !== undefined) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      },
    );
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Array<Promise<unknown>>),
    );

    await service.listEmployees(viewerId, {
      page: 1,
      pageSize: 25,
      yearsWithCompanyMin: 3,
    });

    const findManyCalls = prisma.person.findMany.mock.calls as unknown[][];
    const findManyArgs = findManyCalls
      .map(
        (call) =>
          call[0] as { where?: { startDate?: { lte?: Date; gte?: Date } } },
      )
      .find((args) => args.where?.startDate !== undefined);
    expect(findManyArgs?.where?.startDate?.lte).toEqual(
      new Date(fixedNow - 3 * 365.25 * 24 * 60 * 60 * 1000),
    );

    jest.restoreAllMocks();
  });

  it('listEmployees applies yearsWithCompany range via intersected startDate window', async () => {
    const fixedNow = new Date('2026-01-01T00:00:00.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

    prisma.person.count.mockResolvedValue(0);
    prisma.person.findMany.mockImplementation(
      (args: {
        where?: { managerId?: string; startDate?: unknown };
        skip?: number;
      }) => {
        if (args.where?.managerId) {
          return Promise.resolve([{ id: managementSubjectId }]);
        }
        if (args.skip !== undefined) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      },
    );
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Array<Promise<unknown>>),
    );

    await service.listEmployees(viewerId, {
      page: 1,
      pageSize: 25,
      yearsWithCompanyMin: 2,
      yearsWithCompanyMax: 5,
    });

    const findManyCalls = prisma.person.findMany.mock.calls as unknown[][];
    const findManyArgs = findManyCalls
      .map(
        (call) =>
          call[0] as { where?: { startDate?: { lte?: Date; gte?: Date } } },
      )
      .find((args) => args.where?.startDate !== undefined);
    expect(findManyArgs?.where?.startDate?.lte).toEqual(
      new Date(fixedNow - 2 * 365.25 * 24 * 60 * 60 * 1000),
    );
    expect(findManyArgs?.where?.startDate?.gte).toEqual(
      new Date(fixedNow - (5 + 1) * 365.25 * 24 * 60 * 60 * 1000),
    );

    jest.restoreAllMocks();
  });

  it('listEmployees rejects inverted yearsWithCompany range', async () => {
    await expect(
      service.listEmployees(viewerId, {
        page: 1,
        pageSize: 25,
        yearsWithCompanyMin: 10,
        yearsWithCompanyMax: 2,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('listEmployees applies custom field filters via custom: query keys', async () => {
    prisma.customFieldDefinition.findMany.mockResolvedValue([
      {
        id: 'cf-desk',
        name: 'Desk',
        visibility: 'COLLEAGUE',
        dataType: 'TEXT',
      },
    ]);
    resolve.mockResolvedValue(NEITHER_LINE_RESOLUTION);
    prisma.person.findMany.mockResolvedValue([]);
    resolveBatch.mockResolvedValue(new Map());

    await service.listEmployees(
      viewerId,
      { page: 1, pageSize: 25 },
      { 'custom:cf-desk': 'Standing' },
    );

    const findManyCalls = prisma.person.findMany.mock.calls as unknown[][];
    const listFindManyArgs = findManyCalls
      .map(
        (call) =>
          call[0] as {
            skip?: number;
            where?: { AND?: Array<{ customFieldValues?: unknown }> };
          },
      )
      .find((args) => args.where?.AND !== undefined && args.skip === undefined);
    expect(listFindManyArgs?.where?.AND?.[0]).toEqual({
      customFieldValues: {
        some: {
          definitionId: 'cf-desk',
          value: { contains: 'Standing', mode: 'insensitive' },
          definition: { isActive: true },
        },
      },
    });
  });

  it('listEmployees rejects custom field filters not in viewer-scoped catalog', async () => {
    prisma.customFieldDefinition.findMany.mockResolvedValue([
      {
        id: 'cf-colleague',
        name: 'Desk',
        visibility: 'COLLEAGUE',
        dataType: 'TEXT',
      },
    ]);
    resolve.mockResolvedValue(NEITHER_LINE_RESOLUTION);
    resolveBatch.mockResolvedValue(new Map());

    await expect(
      service.listEmployees(
        viewerId,
        { page: 1, pageSize: 25 },
        { 'custom:cf-management': 'SecretGrade' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('listEmployees excludes colleague-tier subjects from management custom field filter matches', async () => {
    const managementResolution = {
      ...NEITHER_LINE_RESOLUTION,
      reportingLine: true,
      managerSectionAccess: { s1: { level: 'ReadWrite' as const } },
    };
    const personRow = {
      fullName: 'Person',
      position: 'Engineer',
      countryCity: 'Kyiv',
      startDate: new Date('2020-01-01T00:00:00.000Z'),
      department: { name: 'Platform' },
      customFieldValues: [
        {
          value: 'G5',
          definition: {
            id: 'cf-management',
            name: 'Internal Grade',
            visibility: 'MANAGEMENT',
            isActive: true,
          },
        },
      ],
    };

    prisma.customFieldDefinition.findMany.mockResolvedValue([
      {
        id: 'cf-management',
        name: 'Internal Grade',
        visibility: 'MANAGEMENT',
        dataType: 'TEXT',
      },
      {
        id: 'cf-colleague',
        name: 'Desk',
        visibility: 'COLLEAGUE',
        dataType: 'TEXT',
      },
    ]);
    resolve.mockResolvedValue(managementResolution);
    resolveBatch.mockImplementation(
      (_viewer: string, subjectPersonIds: readonly string[]) => {
        const results = new Map();
        for (const subjectPersonId of subjectPersonIds) {
          results.set(
            subjectPersonId,
            subjectPersonId === colleagueSubjectId
              ? NEITHER_LINE_RESOLUTION
              : managementResolution,
          );
        }
        return Promise.resolve(results);
      },
    );
    prisma.person.findMany.mockImplementation(
      (args: { where?: { managerId?: string; AND?: unknown[] } }) => {
        if (args.where?.managerId) {
          return Promise.resolve([{ id: managementSubjectId }]);
        }
        if (args.where?.AND) {
          return Promise.resolve([
            { id: managementSubjectId, ...personRow, fullName: 'Report' },
            { id: colleagueSubjectId, ...personRow, fullName: 'Colleague' },
          ]);
        }
        return Promise.resolve([]);
      },
    );

    const result = await service.listEmployees(
      viewerId,
      { page: 1, pageSize: 50 },
      { 'custom:cf-management': 'G5' },
    );

    expect(result.totalCount).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.personId).toBe(managementSubjectId);
    expect(result.items[0]?.values['custom:cf-management']).toBe('G5');
  });

  describe('getUMDashboardMetadata', () => {
    const callerId = '77777777-7777-4777-8777-777777777777';
    const reportId = '88888888-8888-4888-8888-888888888888';

    it('returns mapped rows for direct reports of the caller', async () => {
      prisma.person.findMany.mockResolvedValueOnce([
        {
          id: reportId,
          fullName: 'Jamie Rivera',
          department: { id: 'dept-1', name: 'Engineering' },
          personProjectAssignments: [{ projectName: 'Alpha' }],
          leaves: [
            {
              leaveType: 'Annual',
              startDate: new Date(),
              endDate: new Date(),
            },
          ],
        },
      ]);

      const result = await service.getUMDashboardMetadata(callerId);

      expect(result.people).toHaveLength(1);
      expect(result.people[0].personId).toBe(reportId);
      expect(result.people[0].fullName).toBe('Jamie Rivera');
      expect(result.people[0].department).toEqual({
        id: 'dept-1',
        label: 'Engineering',
      });
      expect(result.people[0].projects).toEqual([
        { id: 'Alpha', label: 'Alpha' },
      ]);
      expect(result.people[0].leaveStatus).toBe('Annual');
    });

    it('returns leaveStatus null when person has no active leave', async () => {
      prisma.person.findMany.mockResolvedValueOnce([
        {
          id: reportId,
          fullName: 'Jamie Rivera',
          department: null,
          personProjectAssignments: [],
          leaves: [],
        },
      ]);

      const result = await service.getUMDashboardMetadata(callerId);

      expect(result.people[0].leaveStatus).toBeNull();
      expect(result.people[0].department).toBeNull();
      expect(result.people[0].projects).toEqual([]);
    });

    it('returns empty people array when caller has no direct reports', async () => {
      prisma.person.findMany.mockResolvedValueOnce([]);

      const result = await service.getUMDashboardMetadata(callerId);

      expect(result.people).toHaveLength(0);
    });

    it('queries Prisma with managerId equal to the caller ID', async () => {
      prisma.person.findMany.mockResolvedValueOnce([]);

      await service.getUMDashboardMetadata(callerId);

      expect(prisma.person.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { managerId: callerId } }),
      );
    });

    it('de-duplicates project names for the same person', async () => {
      prisma.person.findMany.mockResolvedValueOnce([
        {
          id: reportId,
          fullName: 'Jamie Rivera',
          department: null,
          personProjectAssignments: [
            { projectName: 'Alpha' },
            { projectName: 'Alpha' },
            { projectName: 'Beta' },
          ],
          leaves: [],
        },
      ]);

      const result = await service.getUMDashboardMetadata(callerId);

      expect(result.people[0].projects).toEqual([
        { id: 'Alpha', label: 'Alpha' },
        { id: 'Beta', label: 'Beta' },
      ]);
    });
  });

  describe('getDMPMDashboardMetadata', () => {
    const callerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const memberId1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const memberId2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

    const prismaWithAssignments = prisma as unknown as {
      personProjectAssignment: {
        findMany: jest.Mock;
      };
      person: {
        findMany: jest.Mock;
      };
    };

    it('returns grouped projects for a DeliveryManager', async () => {
      prismaWithAssignments.personProjectAssignment.findMany
        .mockResolvedValueOnce([{ projectName: 'project-alpha' }])
        .mockResolvedValueOnce([
          {
            projectName: 'project-alpha',
            person: {
              id: memberId1,
              fullName: 'Morgan Ellis',
              department: { id: 'dept-1', name: 'Engineering' },
              leaves: [{ leaveType: 'Annual' }],
            },
          },
        ]);

      const result = await service.getDMPMDashboardMetadata(callerId);

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].projectId).toBe('project-alpha');
      expect(result.projects[0].people).toHaveLength(1);
      expect(result.projects[0].people[0].personId).toBe(memberId1);
      expect(result.projects[0].people[0].leaveStatus).toBe('Annual');
    });

    it('returns grouped projects for a ProjectManager', async () => {
      prismaWithAssignments.personProjectAssignment.findMany
        .mockResolvedValueOnce([{ projectName: 'project-beta' }])
        .mockResolvedValueOnce([
          {
            projectName: 'project-beta',
            person: {
              id: memberId1,
              fullName: 'Robin Park',
              department: null,
              leaves: [],
            },
          },
        ]);

      const result = await service.getDMPMDashboardMetadata(callerId);

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].projectId).toBe('project-beta');
      expect(result.projects[0].people[0].fullName).toBe('Robin Park');
    });

    it('deduplicates projects when caller holds both DM and PM roles on the same project', async () => {
      // First call returns two assignments to the same project (DM + PM)
      prismaWithAssignments.personProjectAssignment.findMany
        .mockResolvedValueOnce([
          { projectName: 'project-alpha' },
          { projectName: 'project-alpha' },
        ])
        .mockResolvedValueOnce([
          {
            projectName: 'project-alpha',
            person: {
              id: memberId1,
              fullName: 'Alex Brandt',
              department: null,
              leaves: [],
            },
          },
        ]);

      const result = await service.getDMPMDashboardMetadata(callerId);

      expect(result.projects).toHaveLength(1);
    });

    it('deduplicates people within the same project', async () => {
      prismaWithAssignments.personProjectAssignment.findMany
        .mockResolvedValueOnce([{ projectName: 'project-alpha' }])
        .mockResolvedValueOnce([
          {
            projectName: 'project-alpha',
            person: {
              id: memberId1,
              fullName: 'Morgan Ellis',
              department: null,
              leaves: [],
            },
          },
          {
            projectName: 'project-alpha',
            person: {
              id: memberId1,
              fullName: 'Morgan Ellis',
              department: null,
              leaves: [],
            },
          },
        ]);

      const result = await service.getDMPMDashboardMetadata(callerId);

      expect(result.projects[0].people).toHaveLength(1);
    });

    it('returns empty projects when caller has no DM/PM assignments', async () => {
      prismaWithAssignments.personProjectAssignment.findMany.mockResolvedValueOnce(
        [],
      );

      const result = await service.getDMPMDashboardMetadata(callerId);

      expect(result.projects).toHaveLength(0);
    });

    it('propagates null leaveStatus when person has no active leave', async () => {
      prismaWithAssignments.personProjectAssignment.findMany
        .mockResolvedValueOnce([{ projectName: 'project-gamma' }])
        .mockResolvedValueOnce([
          {
            projectName: 'project-gamma',
            person: {
              id: memberId1,
              fullName: 'Sam Chen',
              department: null,
              leaves: [],
            },
          },
        ]);

      const result = await service.getDMPMDashboardMetadata(callerId);

      expect(result.projects[0].people[0].leaveStatus).toBeNull();
    });

    it('handles a person appearing in multiple projects without cross-project deduplication', async () => {
      prismaWithAssignments.personProjectAssignment.findMany
        .mockResolvedValueOnce([
          { projectName: 'project-alpha' },
          { projectName: 'project-beta' },
        ])
        .mockResolvedValueOnce([
          {
            projectName: 'project-alpha',
            person: {
              id: memberId1,
              fullName: 'Jordan Lee',
              department: null,
              leaves: [],
            },
          },
          {
            projectName: 'project-beta',
            person: {
              id: memberId1,
              fullName: 'Jordan Lee',
              department: null,
              leaves: [],
            },
          },
          {
            projectName: 'project-beta',
            person: {
              id: memberId2,
              fullName: 'Casey Kim',
              department: null,
              leaves: [],
            },
          },
        ]);

      const result = await service.getDMPMDashboardMetadata(callerId);

      const alpha = result.projects.find(
        (p) => p.projectId === 'project-alpha',
      );
      const beta = result.projects.find((p) => p.projectId === 'project-beta');
      expect(alpha?.people).toHaveLength(1);
      expect(beta?.people).toHaveLength(2);
    });
  });
});
