import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { AccessRoleResolutionPort } from '../../profile/profile.ports';
import { NEITHER_LINE_RESOLUTION } from '../../profile/profile.ports';
import { EmployeesService } from '../employees.service';

async function loadExportWorksheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet('Employees');
  if (!worksheet) {
    throw new Error('Employees worksheet missing from export workbook.');
  }
  return worksheet;
}

describe('EmployeesService export', () => {
  const viewerId = '11111111-1111-4111-8111-111111111111';
  const subjectWithAccess = '22222222-2222-4222-8222-222222222222';
  const subjectWithoutAccess = '33333333-3333-4333-8333-333333333333';

  const managerResolution = {
    ...NEITHER_LINE_RESOLUTION,
    reportingLine: true,
    managerSectionAccess: { s1: { level: 'ReadWrite' as const } },
  };

  const deniedS1Resolution = {
    ...NEITHER_LINE_RESOLUTION,
    reportingLine: true,
    managerSectionAccess: { s1: { level: 'None' as const } },
  };

  const personRow = (id: string, fullName: string) => ({
    id,
    fullName,
    position: 'Engineer',
    countryCity: 'City A',
    startDate: new Date('2020-01-01T00:00:00.000Z'),
    department: { name: 'Engineering' },
    customFieldValues: [],
  });

  const prisma = {
    customFieldDefinition: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
    },
    person: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    personProjectAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    department: {
      findUnique: jest.fn(),
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
    resolve.mockResolvedValue(managerResolution);
    resolveBatch.mockImplementation(
      (_viewer: string, subjectPersonIds: readonly string[]) => {
        const results = new Map<string, typeof managerResolution>();
        for (const subjectPersonId of subjectPersonIds) {
          results.set(subjectPersonId, managerResolution);
        }
        return Promise.resolve(results);
      },
    );
    prisma.department.findUnique.mockResolvedValue(null);
    prisma.customFieldDefinition.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Array<Promise<unknown>>),
    );
    prisma.person.findMany.mockImplementation(
      (args: {
        where?: { managerId?: string };
        skip?: number;
        take?: number;
      }) => {
        if (args.where?.managerId) {
          return Promise.resolve([{ id: subjectWithAccess }]);
        }
        if (args.skip !== undefined) {
          return Promise.resolve([
            personRow(subjectWithAccess, 'Accessible Person'),
            personRow(subjectWithoutAccess, 'Hidden Person'),
          ]);
        }
        return Promise.resolve([]);
      },
    );
  });

  it('rejects unknown column keys with 400', async () => {
    await expect(
      service.exportEmployeesToXlsx(viewerId, {}, {}, ['not-a-column']),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects export for colleague catalog audience with 403', async () => {
    prisma.customFieldDefinition.findMany.mockResolvedValue([]);
    resolve.mockResolvedValue(NEITHER_LINE_RESOLUTION);
    resolveBatch.mockResolvedValue(new Map());

    await expect(
      service.exportEmployeesToXlsx(viewerId, {}, {}, ['fullName']),
    ).rejects.toMatchObject({
      response: {
        statusCode: 403,
        error: 'COLLEAGUE_BROWSE_RESTRICTED',
      },
    });
  });

  it('exports all matching rows across internal pages', async () => {
    prisma.person.count.mockResolvedValue(2);
    resolveBatch.mockResolvedValue(
      new Map([
        [subjectWithAccess, managerResolution],
        [subjectWithoutAccess, deniedS1Resolution],
      ]),
    );

    const { buffer } = await service.exportEmployeesToXlsx(viewerId, {}, {}, [
      'fullName',
      'position',
    ]);

    expect(buffer.byteLength).toBeGreaterThan(0);
    expect(resolveBatch).toHaveBeenCalled();
  });

  it('leaves blank cells for subjects without field access', async () => {
    prisma.person.count.mockResolvedValue(2);
    resolveBatch.mockResolvedValue(
      new Map([
        [subjectWithAccess, managerResolution],
        [subjectWithoutAccess, deniedS1Resolution],
      ]),
    );

    const { buffer } = await service.exportEmployeesToXlsx(viewerId, {}, {}, [
      'fullName',
    ]);

    const worksheet = await loadExportWorksheet(buffer);
    expect(worksheet.getRow(2).getCell(1).value).toBe('Accessible Person');
    const deniedCellValue = worksheet.getRow(3).getCell(1).value;
    expect(deniedCellValue === null || deniedCellValue === '').toBe(true);
  });

  it('export row set matches concatenated listEmployees pages', async () => {
    const people = [
      personRow(subjectWithAccess, 'Alpha Person'),
      personRow(subjectWithoutAccess, 'Beta Person'),
    ];

    prisma.person.count.mockResolvedValue(people.length);
    prisma.person.findMany.mockImplementation(
      (args: {
        where?: { managerId?: string };
        skip?: number;
        take?: number;
      }) => {
        if (args.where?.managerId) {
          return Promise.resolve([{ id: subjectWithAccess }]);
        }
        if (args.skip !== undefined) {
          return Promise.resolve(people);
        }
        return Promise.resolve([]);
      },
    );
    resolveBatch.mockResolvedValue(
      new Map(people.map((person) => [person.id, managerResolution])),
    );

    const query = { countryCity: 'City A' };
    const listResult = await service.listEmployees(viewerId, {
      ...query,
      page: 1,
      pageSize: 100,
    });
    const { buffer } = await service.exportEmployeesToXlsx(
      viewerId,
      query,
      {},
      ['fullName'],
    );

    const worksheet = await loadExportWorksheet(buffer);
    expect(worksheet.rowCount - 1).toBe(listResult.totalCount);

    const exportNames: Array<string | number | boolean | null | undefined> = [];
    for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
      exportNames.push(worksheet.getRow(rowIndex).getCell(1).value);
    }
    const listNames = listResult.items.map((item) => item.values.fullName);
    expect(exportNames).toEqual(listNames);
  });

  it('uses a single full candidate scan for custom-field-filter exports', async () => {
    const customFieldId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    prisma.customFieldDefinition.findMany.mockResolvedValue([
      {
        id: customFieldId,
        name: 'Desk',
        visibility: 'MANAGEMENT',
        dataType: 'TEXT',
      },
    ]);
    prisma.customFieldDefinition.findUnique.mockResolvedValue({
      id: customFieldId,
      isActive: true,
    });
    prisma.person.findMany.mockResolvedValue([
      {
        id: subjectWithAccess,
        fullName: 'Accessible Person',
        position: 'Engineer',
        countryCity: 'City A',
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        department: { name: 'Engineering' },
        customFieldValues: [
          {
            value: 'Desk 1',
            definition: {
              id: customFieldId,
              name: 'Desk',
              visibility: 'MANAGEMENT',
              isActive: true,
            },
          },
        ],
      },
    ]);
    resolveBatch.mockResolvedValue(
      new Map([[subjectWithAccess, managerResolution]]),
    );

    await service.exportEmployeesToXlsx(
      viewerId,
      {},
      { [`custom:${customFieldId}`]: 'Desk 1' },
      ['fullName', `custom:${customFieldId}`],
    );

    const exportCandidateScans = prisma.person.findMany.mock.calls.filter(
      (call: [{ select?: { fullName?: boolean }; skip?: number }]) =>
        call[0]?.skip === undefined && call[0]?.select?.fullName === true,
    );
    expect(exportCandidateScans).toHaveLength(1);
  });
});
