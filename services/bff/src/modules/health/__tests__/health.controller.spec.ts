import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckResult, HealthCheckService } from '@nestjs/terminus';
import { HealthController } from '../health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  const healthResult: HealthCheckResult = {
    status: 'ok',
    info: {},
    error: {},
    details: {},
  };

  const healthCheckService = {
    check: jest.fn().mockResolvedValue(healthResult),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return the health check result', async () => {
    const result = await controller.check();

    expect(result).toEqual(healthResult);
    expect(healthCheckService.check).toHaveBeenCalledWith([]);
  });
});
