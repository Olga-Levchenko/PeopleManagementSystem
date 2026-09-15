import { PrismaService } from '../../../prisma/prisma.service';
import { DepartmentsService } from '../departments.service';

const getJestFn = (target: object, property: string): jest.Mock =>
  (target as Record<string, jest.Mock>)[property];

const makePrisma = () =>
  ({
    department: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  }) as unknown as PrismaService;

describe('DepartmentsService.search', () => {
  afterEach(() => jest.restoreAllMocks());

  it('filters by name case-insensitively when name is provided', async () => {
    const prisma = makePrisma();
    const rows = [{ id: 'dept-1', name: 'Engineering' }];
    getJestFn(prisma.department, 'findMany').mockResolvedValue(rows);
    const service = new DepartmentsService(prisma);

    const result = await service.search('eng');

    expect(getJestFn(prisma.department, 'findMany')).toHaveBeenCalledWith({
      where: { name: { contains: 'eng', mode: 'insensitive' } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
    expect(result).toBe(rows);
  });

  it('omits where clause when name is undefined', async () => {
    const prisma = makePrisma();
    const service = new DepartmentsService(prisma);

    await service.search(undefined);

    expect(getJestFn(prisma.department, 'findMany')).toHaveBeenCalledWith({
      where: undefined,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
  });
});
