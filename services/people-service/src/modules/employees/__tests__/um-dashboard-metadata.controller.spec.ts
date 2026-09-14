import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { UMDashboardMetadataController } from '../um-dashboard-metadata.controller';
import { EmployeesService } from '../employees.service';
import { RequestActorContext } from '../../organisational-relationships/request-actor.context';

describe('UMDashboardMetadataController', () => {
  const callerPersonId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const mockEmployeesService = {
    getUMDashboardMetadata: jest.fn(),
  };

  const mockActorContext = {
    resolveActorId: jest.fn(),
  };

  let controller: UMDashboardMetadataController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UMDashboardMetadataController],
      providers: [
        { provide: EmployeesService, useValue: mockEmployeesService },
        { provide: RequestActorContext, useValue: mockActorContext },
      ],
    }).compile();

    controller = module.get(UMDashboardMetadataController);
    jest.clearAllMocks();
  });

  it('returns direct reports for the authenticated caller', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockEmployeesService.getUMDashboardMetadata.mockResolvedValue({
      people: [
        {
          personId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          fullName: 'Anna Schmidt',
          department: { id: 'dept-1', label: 'Engineering' },
          projects: [{ id: 'proj-alpha', label: 'proj-alpha' }],
          leaveStatus: null,
        },
      ],
    });

    const result = await controller.getUMDashboardMetadata();

    expect(mockActorContext.resolveActorId).toHaveBeenCalledTimes(1);
    expect(mockEmployeesService.getUMDashboardMetadata).toHaveBeenCalledWith(
      callerPersonId,
    );
    expect(result).toEqual({
      people: [
        expect.objectContaining({
          personId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          fullName: 'Anna Schmidt',
        }),
      ],
    });
  });

  it('returns empty people array when caller has zero direct reports', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockEmployeesService.getUMDashboardMetadata.mockResolvedValue({
      people: [],
    });

    const result = await controller.getUMDashboardMetadata();

    expect(result).toEqual({ people: [] });
  });

  it('propagates auth failure when actor cannot be resolved', async () => {
    mockActorContext.resolveActorId.mockRejectedValue(
      new NotFoundException('no identity mapping'),
    );

    await expect(controller.getUMDashboardMetadata()).rejects.toThrow(
      NotFoundException,
    );
    expect(mockEmployeesService.getUMDashboardMetadata).not.toHaveBeenCalled();
  });

  it('propagates service exceptions without swallowing them', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockEmployeesService.getUMDashboardMetadata.mockRejectedValue(
      new ForbiddenException('access denied'),
    );

    await expect(controller.getUMDashboardMetadata()).rejects.toThrow(
      ForbiddenException,
    );
  });
});
