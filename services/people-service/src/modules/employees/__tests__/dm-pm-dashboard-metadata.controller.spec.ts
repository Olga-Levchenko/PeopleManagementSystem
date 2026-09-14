import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DMPMDashboardMetadataController } from '../dm-pm-dashboard-metadata.controller';
import { EmployeesService } from '../employees.service';
import { RequestActorContext } from '../../organisational-relationships/request-actor.context';

describe('DMPMDashboardMetadataController', () => {
  const callerPersonId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const mockEmployeesService = {
    getDMPMDashboardMetadata: jest.fn(),
  };

  const mockActorContext = {
    resolveActorId: jest.fn(),
  };

  let controller: DMPMDashboardMetadataController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [DMPMDashboardMetadataController],
      providers: [
        { provide: EmployeesService, useValue: mockEmployeesService },
        { provide: RequestActorContext, useValue: mockActorContext },
      ],
    }).compile();

    controller = module.get(DMPMDashboardMetadataController);
    jest.clearAllMocks();
  });

  it('returns projects metadata for the authenticated caller who is a DM', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockEmployeesService.getDMPMDashboardMetadata.mockResolvedValue({
      projects: [
        {
          projectId: 'project-alpha',
          projectLabel: 'project-alpha',
          people: [
            {
              personId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              fullName: 'Morgan Ellis',
              department: { id: 'dept-1', label: 'Engineering' },
              leaveStatus: null,
            },
          ],
        },
      ],
    });

    const result = await controller.getDMPMDashboardMetadata();

    expect(mockActorContext.resolveActorId).toHaveBeenCalledTimes(1);
    expect(mockEmployeesService.getDMPMDashboardMetadata).toHaveBeenCalledWith(
      callerPersonId,
    );
    const typed = result as {
      projects: Array<{
        projectId: string;
        people: Array<{ personId: string; fullName: string }>;
      }>;
    };
    expect(typed.projects).toHaveLength(1);
    expect(typed.projects[0].projectId).toBe('project-alpha');
    expect(typed.projects[0].people).toHaveLength(1);
    expect(typed.projects[0].people[0].personId).toBe(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    );
    expect(typed.projects[0].people[0].fullName).toBe('Morgan Ellis');
  });

  it('returns empty projects array when caller has no DM/PM assignments', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockEmployeesService.getDMPMDashboardMetadata.mockResolvedValue({
      projects: [],
    });

    const result = await controller.getDMPMDashboardMetadata();

    expect(result).toEqual({ projects: [] });
  });

  it('propagates auth failure when actor cannot be resolved', async () => {
    mockActorContext.resolveActorId.mockRejectedValue(
      new NotFoundException('no identity mapping'),
    );

    await expect(controller.getDMPMDashboardMetadata()).rejects.toThrow(
      NotFoundException,
    );
    expect(
      mockEmployeesService.getDMPMDashboardMetadata,
    ).not.toHaveBeenCalled();
  });

  it('propagates service exceptions without swallowing them', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockEmployeesService.getDMPMDashboardMetadata.mockRejectedValue(
      new ForbiddenException('access denied'),
    );

    await expect(controller.getDMPMDashboardMetadata()).rejects.toThrow(
      ForbiddenException,
    );
  });
});
