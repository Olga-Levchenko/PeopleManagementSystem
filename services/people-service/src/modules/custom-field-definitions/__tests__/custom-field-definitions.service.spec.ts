import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CustomFieldDataType,
  CustomFieldVisibility,
} from '../custom-field-definitions.dto';
import type { HrAdminPermissionPort } from '../custom-field-definitions.ports';
import {
  assertDataTypeNotPresent,
  CustomFieldDefinitionsService,
} from '../custom-field-definitions.service';

const ACTOR_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const DEF_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

const getMock = (target: object, property: string): jest.Mock =>
  (target as Record<string, jest.Mock>)[property];

const makeDefinition = (overrides?: object) => ({
  id: DEF_ID,
  name: 'Level',
  dataType: 'TEXT' as const,
  visibility: 'MANAGEMENT' as const,
  isActive: true,
  ...overrides,
});

const allowedPermission: HrAdminPermissionPort = {
  canWrite: jest.fn().mockResolvedValue(true),
};

const deniedPermission: HrAdminPermissionPort = {
  canWrite: jest.fn().mockResolvedValue(false),
};

const makePrisma = (overrides?: object) =>
  ({
    customFieldDefinition: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(makeDefinition()),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }: { data: object }) => ({
        id: DEF_ID,
        isActive: true,
        ...data,
      })),
      update: jest.fn().mockImplementation(({ data }: { data: object }) => ({
        ...makeDefinition(),
        ...data,
      })),
    },
    ...overrides,
  }) as unknown as PrismaService;

const makeService = (
  prisma: PrismaService = makePrisma(),
  permission: HrAdminPermissionPort = allowedPermission,
) => new CustomFieldDefinitionsService(prisma, permission);

describe('CustomFieldDefinitionsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listAll', () => {
    it('returns all definitions ordered by isActive desc, name asc', async () => {
      const definitions = [
        makeDefinition(),
        makeDefinition({ id: 'x', name: 'Zz', isActive: false }),
      ];
      const prisma = makePrisma();
      (prisma.customFieldDefinition.findMany as jest.Mock).mockResolvedValue(
        definitions,
      );
      const service = makeService(prisma);

      const result = await service.listAll();

      expect(result).toBe(definitions);
      expect(
        getMock(prisma.customFieldDefinition, 'findMany'),
      ).toHaveBeenCalledWith({
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      });
    });
  });

  describe('create', () => {
    it('returns 201-shape with isActive: true on happy path', async () => {
      const service = makeService();
      const result = await service.create(ACTOR_ID, {
        name: 'Level',
        dataType: CustomFieldDataType.TEXT,
        visibility: CustomFieldVisibility.MANAGEMENT,
      });

      expect(result).toMatchObject({
        id: DEF_ID,
        name: 'Level',
        dataType: CustomFieldDataType.TEXT,
        visibility: CustomFieldVisibility.MANAGEMENT,
        isActive: true,
      });
    });

    it('throws 409 ConflictException when an active definition with the same name exists', async () => {
      const prisma = makePrisma();
      (prisma.customFieldDefinition.findFirst as jest.Mock).mockResolvedValue({
        id: 'other-id',
      });
      const service = makeService(prisma);

      await expect(
        service.create(ACTOR_ID, {
          name: 'Level',
          dataType: CustomFieldDataType.NUMBER,
          visibility: CustomFieldVisibility.EMPLOYEE,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws 403 ForbiddenException when actor lacks HR Admin permission', async () => {
      const service = makeService(makePrisma(), deniedPermission);

      await expect(
        service.create(ACTOR_ID, {
          name: 'Level',
          dataType: CustomFieldDataType.TEXT,
          visibility: CustomFieldVisibility.MANAGEMENT,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('update', () => {
    it('updates name and visibility on happy path', async () => {
      const service = makeService();

      const result = await service.update(ACTOR_ID, DEF_ID, {
        name: 'Seniority',
        visibility: CustomFieldVisibility.EMPLOYEE,
      });

      expect(result).toMatchObject({
        name: 'Seniority',
        visibility: 'EMPLOYEE',
      });
    });

    it('throws 404 NotFoundException when id does not exist', async () => {
      const prisma = makePrisma();
      (prisma.customFieldDefinition.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      const service = makeService(prisma);

      await expect(
        service.update(ACTOR_ID, DEF_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 409 ConflictException when another active definition uses the same name', async () => {
      const prisma = makePrisma();
      (prisma.customFieldDefinition.findFirst as jest.Mock).mockResolvedValue({
        id: 'other-id',
      });
      const service = makeService(prisma);

      await expect(
        service.update(ACTOR_ID, DEF_ID, { name: 'AlreadyTaken' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws 403 when actor lacks HR Admin permission', async () => {
      const service = makeService(makePrisma(), deniedPermission);

      await expect(
        service.update(ACTOR_ID, DEF_ID, { name: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('deactivate', () => {
    it('sets isActive to false (happy path)', async () => {
      const service = makeService();

      const result = await service.deactivate(ACTOR_ID, DEF_ID);

      expect(result).toMatchObject({ isActive: false });
    });

    it('is idempotent: already-inactive definition returns 200 with isActive false', async () => {
      const prisma = makePrisma();
      (prisma.customFieldDefinition.findUnique as jest.Mock).mockResolvedValue(
        makeDefinition({ isActive: false }),
      );
      (prisma.customFieldDefinition.update as jest.Mock).mockResolvedValue(
        makeDefinition({ isActive: false }),
      );
      const service = makeService(prisma);

      const result = await service.deactivate(ACTOR_ID, DEF_ID);

      expect(result.isActive).toBe(false);
    });

    it('throws 404 when id does not exist', async () => {
      const prisma = makePrisma();
      (prisma.customFieldDefinition.findUnique as jest.Mock).mockResolvedValue(
        null,
      );
      const service = makeService(prisma);

      await expect(service.deactivate(ACTOR_ID, DEF_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 403 when actor lacks HR Admin permission', async () => {
      const service = makeService(makePrisma(), deniedPermission);

      await expect(service.deactivate(ACTOR_ID, DEF_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('assertDataTypeNotPresent (standalone guard)', () => {
    it('does not throw when body has no dataType field', () => {
      expect(() => assertDataTypeNotPresent({ name: 'Level' })).not.toThrow();
    });

    it('throws 400 BadRequestException when body contains dataType', () => {
      expect(() => assertDataTypeNotPresent({ dataType: 'NUMBER' })).toThrow(
        BadRequestException,
      );
    });
  });
});
