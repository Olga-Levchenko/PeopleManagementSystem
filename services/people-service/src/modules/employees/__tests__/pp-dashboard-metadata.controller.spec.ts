import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PPDashboardMetadataController } from '../pp-dashboard-metadata.controller';
import { EmployeesService } from '../employees.service';
import { RequestActorContext } from '../../organisational-relationships/request-actor.context';

describe('PPDashboardMetadataController', () => {
  const callerPersonId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const mockEmployeesService = {
    getPPDashboardMetadata: jest.fn(),
  };

  const mockActorContext = {
    resolveActorId: jest.fn(),
  };

  let controller: PPDashboardMetadataController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PPDashboardMetadataController],
      providers: [
        { provide: EmployeesService, useValue: mockEmployeesService },
        { provide: RequestActorContext, useValue: mockActorContext },
      ],
    }).compile();

    controller = module.get(PPDashboardMetadataController);
    jest.clearAllMocks();
  });

  it('returns people metadata for the authenticated caller who is a PP', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockEmployeesService.getPPDashboardMetadata.mockResolvedValue({
      people: [
        {
          personId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          fullName: 'Jordan Kim',
          department: { id: 'dept-1', label: 'Engineering' },
          projects: ['Alpha'],
          leaveStatus: null,
        },
      ],
    });

    const result = await controller.getPPDashboardMetadata();

    expect(mockActorContext.resolveActorId).toHaveBeenCalledTimes(1);
    expect(mockEmployeesService.getPPDashboardMetadata).toHaveBeenCalledWith(
      callerPersonId,
    );
    const typed = result as {
      people: Array<{
        personId: string;
        fullName: string;
        projects: string[];
      }>;
    };
    expect(typed.people).toHaveLength(1);
    expect(typed.people[0].personId).toBe(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    );
    expect(typed.people[0].fullName).toBe('Jordan Kim');
    expect(typed.people[0].projects).toEqual(['Alpha']);
  });

  it('returns empty people array when caller has no PP assignments', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockEmployeesService.getPPDashboardMetadata.mockResolvedValue({
      people: [],
    });

    const result = await controller.getPPDashboardMetadata();

    expect(result).toEqual({ people: [] });
  });

  it('propagates auth failure when actor cannot be resolved', async () => {
    mockActorContext.resolveActorId.mockRejectedValue(
      new NotFoundException('no identity mapping'),
    );

    await expect(controller.getPPDashboardMetadata()).rejects.toThrow(
      NotFoundException,
    );
    expect(mockEmployeesService.getPPDashboardMetadata).not.toHaveBeenCalled();
  });

  it('propagates service exceptions without swallowing them', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockEmployeesService.getPPDashboardMetadata.mockRejectedValue(
      new ForbiddenException('access denied'),
    );

    await expect(controller.getPPDashboardMetadata()).rejects.toThrow(
      ForbiddenException,
    );
  });
});
