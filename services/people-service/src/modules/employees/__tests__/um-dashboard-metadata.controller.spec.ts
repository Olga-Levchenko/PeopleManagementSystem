import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { UMDashboardMetadataController } from '../um-dashboard-metadata.controller';
import { EmployeesService } from '../employees.service';
import { RequestActorContext } from '../../organisational-relationships/request-actor.context';
import { ServiceTokenExchangeService } from '../../auth/service-token-exchange.service';

describe('UMDashboardMetadataController', () => {
  const callerPersonId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const mockEmployeesService = { getUMDashboardMetadata: jest.fn() };
  const mockActorContext = { resolveActorId: jest.fn(), accessToken: 'raw-people-token' };
  const mockTokenExchange = { exchangeForAudience: jest.fn() };
  const mockConfig = { getOrThrow: jest.fn() };

  let controller: UMDashboardMetadataController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [UMDashboardMetadataController],
      providers: [
        { provide: EmployeesService, useValue: mockEmployeesService },
        { provide: RequestActorContext, useValue: mockActorContext },
        { provide: ServiceTokenExchangeService, useValue: mockTokenExchange },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    controller = module.get(UMDashboardMetadataController);
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

  it('returns direct reports for the authenticated caller when permission is granted', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockTokenExchange.exchangeForAudience.mockResolvedValue('acs-token');
    mockConfig.getOrThrow.mockReturnValue('http://acs');
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(makeAcsGranted());
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

    expect(mockTokenExchange.exchangeForAudience).toHaveBeenCalledWith(
      'raw-people-token',
      'access-control-service',
    );
    expect(mockActorContext.resolveActorId).toHaveBeenCalledTimes(1);
    expect(mockEmployeesService.getUMDashboardMetadata).toHaveBeenCalledWith(callerPersonId);
    const typed = result as { people: Array<{ personId: string; fullName: string }> };
    expect(typed.people).toHaveLength(1);
    expect(typed.people[0].personId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(typed.people[0].fullName).toBe('Anna Schmidt');
  });

  it('returns empty people array when caller has zero direct reports', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockTokenExchange.exchangeForAudience.mockResolvedValue('acs-token');
    mockConfig.getOrThrow.mockReturnValue('http://acs');
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(makeAcsGranted());
    mockEmployeesService.getUMDashboardMetadata.mockResolvedValue({ people: [] });

    const result = await controller.getUMDashboardMetadata();

    expect(result).toEqual({ people: [] });
  });

  it('throws ForbiddenException when ACS returns granted: false', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockTokenExchange.exchangeForAudience.mockResolvedValue('acs-token');
    mockConfig.getOrThrow.mockReturnValue('http://acs');
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(makeAcsDenied());

    await expect(controller.getUMDashboardMetadata()).rejects.toThrow(ForbiddenException);
    expect(mockEmployeesService.getUMDashboardMetadata).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when ACS returns non-2xx (fail-closed)', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockTokenExchange.exchangeForAudience.mockResolvedValue('acs-token');
    mockConfig.getOrThrow.mockReturnValue('http://acs');
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: jest.fn(),
    } as unknown as Response);

    await expect(controller.getUMDashboardMetadata()).rejects.toThrow(ForbiddenException);
    expect(mockEmployeesService.getUMDashboardMetadata).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when token exchange fails (fail-closed)', async () => {
    mockActorContext.resolveActorId.mockResolvedValue(callerPersonId);
    mockTokenExchange.exchangeForAudience.mockRejectedValue(new Error('exchange error'));

    await expect(controller.getUMDashboardMetadata()).rejects.toThrow(ForbiddenException);
    expect(mockEmployeesService.getUMDashboardMetadata).not.toHaveBeenCalled();
  });

  it('propagates auth failure when actor cannot be resolved', async () => {
    mockActorContext.resolveActorId.mockRejectedValue(
      new NotFoundException('no identity mapping'),
    );
    mockTokenExchange.exchangeForAudience.mockResolvedValue('acs-token');
    mockConfig.getOrThrow.mockReturnValue('http://acs');
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(makeAcsGranted());

    await expect(controller.getUMDashboardMetadata()).rejects.toThrow(NotFoundException);
    expect(mockEmployeesService.getUMDashboardMetadata).not.toHaveBeenCalled();
  });
});
