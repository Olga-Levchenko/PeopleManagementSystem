import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EmployeesService } from '../employees.service';
import { SavedViewsService } from '../saved-views.service';

const viewerId = '11111111-1111-4111-8111-111111111111';
const recipientId = '22222222-2222-4222-8222-222222222222';
const viewId = '33333333-3333-4333-8333-333333333333';

const baseConfiguration = {
  visibleColumnKeys: ['fullName', 'position'],
  filters: { countryCity: 'Kyiv' },
};

describe('SavedViewsService', () => {
  const prisma = {
    employeeListSavedView: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    employeeListSavedViewShare: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    person: {
      findUnique: jest.fn(),
    },
    department: {
      findUnique: jest.fn(),
    },
    customFieldDefinition: {
      findUnique: jest.fn(),
    },
  };

  const employeesService = {
    getFieldCatalog: jest.fn(),
  } as unknown as EmployeesService;

  const service = new SavedViewsService(prisma as never, employeesService);

  beforeEach(() => {
    jest.clearAllMocks();
    (employeesService.getFieldCatalog as jest.Mock).mockResolvedValue({
      fields: [
        {
          key: 'fullName',
          label: 'Full name',
          kind: 'stored',
          dataType: 'string',
          filterable: false,
          columnable: true,
        },
        {
          key: 'position',
          label: 'Position',
          kind: 'stored',
          dataType: 'string',
          filterable: false,
          columnable: true,
        },
        {
          key: 'countryCity',
          label: 'Country / city',
          kind: 'stored',
          dataType: 'string',
          filterable: true,
          columnable: true,
        },
      ],
      listAudienceLevel: 'management',
    });
    prisma.department.findUnique.mockResolvedValue(null);
    prisma.customFieldDefinition.findUnique.mockResolvedValue(null);
  });

  it('creates a saved view for the creator', async () => {
    prisma.employeeListSavedView.findFirst.mockResolvedValue(null);
    prisma.employeeListSavedView.create.mockResolvedValue({
      id: viewId,
      name: 'Kyiv team',
      creatorPersonId: viewerId,
      pageSize: 25,
      configuration: baseConfiguration,
    });

    const result = await service.createSavedView(viewerId, {
      name: 'Kyiv team',
      configuration: baseConfiguration,
      pageSize: 25,
    });

    expect(result.isOwner).toBe(true);
    expect(result.name).toBe('Kyiv team');
    expect(result.pageSize).toBe(25);
  });

  it('rejects duplicate names for the same creator', async () => {
    prisma.employeeListSavedView.findFirst.mockResolvedValue({ id: viewId });

    await expect(
      service.createSavedView(viewerId, {
        name: 'Kyiv team',
        configuration: baseConfiguration,
        pageSize: 25,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects duplicate names when renaming an owned view', async () => {
    prisma.employeeListSavedView.findUnique.mockResolvedValue({
      id: viewId,
      creatorPersonId: viewerId,
      name: 'Kyiv team',
      pageSize: 25,
      configuration: baseConfiguration,
    });
    prisma.employeeListSavedView.findFirst.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
    });

    await expect(
      service.updateSavedView(viewerId, viewId, { name: 'Existing name' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('forbids recipients from updating a shared view', async () => {
    prisma.employeeListSavedView.findUnique.mockResolvedValue({
      id: viewId,
      creatorPersonId: recipientId,
      name: 'Shared',
      pageSize: 50,
      configuration: baseConfiguration,
    });
    prisma.employeeListSavedViewShare.findFirst.mockResolvedValue({
      id: 'share-1',
      viewId,
      recipientPersonId: viewerId,
    });

    await expect(
      service.updateSavedView(viewerId, viewId, { name: 'Renamed' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns idempotent share rows with status 200', async () => {
    prisma.employeeListSavedView.findUnique.mockResolvedValue({
      id: viewId,
      creatorPersonId: viewerId,
      name: 'Shared',
      pageSize: 50,
      configuration: baseConfiguration,
    });
    prisma.person.findUnique.mockResolvedValue({ id: recipientId });
    prisma.employeeListSavedViewShare.findUnique.mockResolvedValue({
      id: 'share-1',
      viewId,
      recipientPersonId: recipientId,
      sharedAt: new Date('2026-09-10T12:00:00.000Z'),
    });

    const result = await service.shareSavedView(viewerId, viewId, recipientId);

    expect(result.statusCode).toBe(200);
    expect(result.body.recipientPersonId).toBe(recipientId);
    expect(prisma.employeeListSavedViewShare.create).not.toHaveBeenCalled();
  });

  it('creates a new share with status 201', async () => {
    prisma.employeeListSavedView.findUnique.mockResolvedValue({
      id: viewId,
      creatorPersonId: viewerId,
      name: 'Shared',
      pageSize: 50,
      configuration: baseConfiguration,
    });
    prisma.person.findUnique.mockResolvedValue({ id: recipientId });
    prisma.employeeListSavedViewShare.findUnique.mockResolvedValue(null);
    prisma.employeeListSavedViewShare.create.mockResolvedValue({
      id: 'share-1',
      viewId,
      recipientPersonId: recipientId,
      sharedAt: new Date('2026-09-10T12:00:00.000Z'),
    });

    const result = await service.shareSavedView(viewerId, viewId, recipientId);

    expect(result.statusCode).toBe(201);
    expect(prisma.employeeListSavedViewShare.create).toHaveBeenCalled();
  });

  it('returns 404 when a non-owner tries to share an unknown view', async () => {
    prisma.employeeListSavedView.findUnique.mockResolvedValue(null);

    await expect(
      service.shareSavedView(viewerId, viewId, recipientId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
