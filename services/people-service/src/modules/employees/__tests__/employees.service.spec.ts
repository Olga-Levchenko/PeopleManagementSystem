import { BadRequestException } from '@nestjs/common';
import type { AccessRoleResolutionPort } from '../../profile/profile.ports';
import { NEITHER_LINE_RESOLUTION } from '../../profile/profile.ports';
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
    prisma.person.findMany.mockImplementation(
      (args: { where?: { managerId?: string } }) => {
        if (args.where?.managerId) {
          return Promise.resolve([{ id: managementSubjectId }]);
        }
        return Promise.resolve([]);
      },
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

  it('listEmployees calls resolveBatch once per page and projects S1 fields for colleague audience', async () => {
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
      new Map([[subjectId, NEITHER_LINE_RESOLUTION]]),
    );

    const result = await service.listEmployees(viewerId, {
      page: 1,
      pageSize: 50,
    });

    expect(resolveBatch).toHaveBeenCalledWith(viewerId, [subjectId]);
    expect(result.totalCount).toBe(1);
    expect(result.items[0]?.values.fullName).toBe('Subject Person');
    expect(result.items[0]?.values.yearsWithCompany).not.toBeNull();
    expect(result.items[0]?.editableFields).toEqual([]);
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
    prisma.person.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Array<Promise<unknown>>),
    );
    resolveBatch.mockResolvedValue(new Map());

    await service.listEmployees(viewerId, {
      page: 1,
      pageSize: 25,
      yearsWithCompanyMin: 3,
    });

    const findManyCalls = prisma.person.findMany.mock.calls as unknown[][];
    const findManyArgs = findManyCalls[0]?.[0] as {
      where?: { startDate?: { lte?: Date; gte?: Date } };
    };
    expect(findManyArgs.where?.startDate?.lte).toEqual(
      new Date(fixedNow - 3 * 365.25 * 24 * 60 * 60 * 1000),
    );

    jest.restoreAllMocks();
  });

  it('listEmployees applies yearsWithCompany range via intersected startDate window', async () => {
    const fixedNow = new Date('2026-01-01T00:00:00.000Z').getTime();
    jest.spyOn(Date, 'now').mockReturnValue(fixedNow);

    prisma.person.count.mockResolvedValue(0);
    prisma.person.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Array<Promise<unknown>>),
    );
    resolveBatch.mockResolvedValue(new Map());

    await service.listEmployees(viewerId, {
      page: 1,
      pageSize: 25,
      yearsWithCompanyMin: 2,
      yearsWithCompanyMax: 5,
    });

    const findManyCalls = prisma.person.findMany.mock.calls as unknown[][];
    const findManyArgs = findManyCalls[0]?.[0] as {
      where?: { startDate?: { lte?: Date; gte?: Date } };
    };
    expect(findManyArgs.where?.startDate?.lte).toEqual(
      new Date(fixedNow - 2 * 365.25 * 24 * 60 * 60 * 1000),
    );
    expect(findManyArgs.where?.startDate?.gte).toEqual(
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
          value: { equals: 'Standing', mode: 'insensitive' },
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
});
