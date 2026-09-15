import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DMPMDashboardMetadataController } from '../dm-pm-dashboard-metadata.controller';
import { EmployeesService } from '../employees.service';
import { RequestActorContext } from '../../organisational-relationships/request-actor.context';
import { ServiceTokenExchangeService } from '../../auth/service-token-exchange.service';

describe('DMPMDashboardMetadataController', () => {
  const callerPersonId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const mockEmployeesService = { getDMPMDashboardMetadata: jest.fn() };
  const mockActorContext = { resolveActorId: jest.fn(), accessToken: 'raw-people-token' };
  const mockTokenExchange = { exchangeForAudience: jest.fn() };
  const mockConfig = { getOrThrow: jest.fn() };

  let controller: DMPMDashboardMetadataController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [DMPMDashboardMetadataController],
      providers: [
        { provide: EmployeesService, useValue: mockEmployeesService },
        { provide: RequestActorContext, useValue: mockActorContext },
        { provide: ServiceTokenExchangeService, useValue: mockTokenExchange },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    controller = module.get(DMPMDashboardMetadataController);
    jest.clearAllMocks();
  });

  afterEach(() => jest.restoreAllMocks());

  const makeAcsGranted = () =>
    ({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ granted: true }),
    }) as unknown as Response;

  const makeAcsDenied = () =>
    ({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ granted: false }),
    }) as unknown as Response;

  it('returns projects metadata when caller has the DM permission', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockTokenExchange.exchangeForAudience.mockResolvedValue('acs-token');
    mockConfig.getOrThrow.mockReturnValue('http://acs');
    // delivery-manager check → granted; project-manager check → denied
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeAcsGranted())
      .mockResolvedValueOnce(makeAcsDenied());
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
    expect(mockEmployeesService.getDMPMDashboardMetadata).toHaveBeenCalledWith(callerPersonId);
    const typed = result as {
      projects: Array<{
        projectId: string;
        people: Array<{ personId: string; fullName: string }>;
      }>;
    };
    expect(typed.projects).toHaveLength(1);
    expect(typed.projects[0].projectId).toBe('project-alpha');
    expect(typed.projects[0].people[0].personId).toBe(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    );
  });

  it('returns projects metadata when caller has the PM permission (DM check denied)', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockTokenExchange.exchangeForAudience.mockResolvedValue('acs-token');
    mockConfig.getOrThrow.mockReturnValue('http://acs');
    // delivery-manager check → denied; project-manager check → granted
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeAcsDenied())
      .mockResolvedValueOnce(makeAcsGranted());
    mockEmployeesService.getDMPMDashboardMetadata.mockResolvedValue({ projects: [] });

    const result = await controller.getDMPMDashboardMetadata();

    expect(mockEmployeesService.getDMPMDashboardMetadata).toHaveBeenCalledWith(callerPersonId);
    expect(result).toEqual({ projects: [] });
  });

  it('throws ForbiddenException when caller has neither DM nor PM permission', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockTokenExchange.exchangeForAudience.mockResolvedValue('acs-token');
    mockConfig.getOrThrow.mockReturnValue('http://acs');
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeAcsDenied())
      .mockResolvedValueOnce(makeAcsDenied());

    await expect(controller.getDMPMDashboardMetadata()).rejects.toThrow(ForbiddenException);
    expect(mockEmployeesService.getDMPMDashboardMetadata).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when ACS is unreachable for both checks (fail-closed)', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockTokenExchange.exchangeForAudience.mockResolvedValue('acs-token');
    mockConfig.getOrThrow.mockReturnValue('http://acs');
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

    await expect(controller.getDMPMDashboardMetadata()).rejects.toThrow(ForbiddenException);
    expect(mockEmployeesService.getDMPMDashboardMetadata).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when token exchange fails (fail-closed)', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockTokenExchange.exchangeForAudience.mockRejectedValue(new Error('exchange error'));

    await expect(controller.getDMPMDashboardMetadata()).rejects.toThrow(ForbiddenException);
    expect(mockEmployeesService.getDMPMDashboardMetadata).not.toHaveBeenCalled();
  });

  it('propagates auth failure when actor cannot be resolved', async () => {
    mockActorContext.resolveActorId.mockRejectedValue(
      new NotFoundException('no identity mapping'),
    );
    mockTokenExchange.exchangeForAudience.mockResolvedValue('acs-token');
    mockConfig.getOrThrow.mockReturnValue('http://acs');
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(makeAcsGranted())
      .mockResolvedValueOnce(makeAcsDenied());

    await expect(controller.getDMPMDashboardMetadata()).rejects.toThrow(NotFoundException);
    expect(mockEmployeesService.getDMPMDashboardMetadata).not.toHaveBeenCalled();
  });
});
