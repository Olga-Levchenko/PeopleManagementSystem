import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheckResult,
  HealthCheckService,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { HealthController } from '../health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  const healthResult: HealthCheckResult = {
    status: 'ok',
    info: { keycloak: { status: 'up' } },
    error: {},
    details: { keycloak: { status: 'up' } },
  };

  const healthCheckService = {
    check: jest.fn().mockResolvedValue(healthResult),
  };
  const httpHealthIndicator = {
    pingCheck: jest.fn().mockResolvedValue({ keycloak: { status: 'up' } }),
  };
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'KEYCLOAK_BASE_URL') return 'http://localhost:8080';
      if (key === 'KEYCLOAK_REALM') return 'people-management';
      throw new Error(`Unexpected config key requested: ${key}`);
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: HttpHealthIndicator, useValue: httpHealthIndicator },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns the health check result', async () => {
    const result = await controller.check();

    expect(result).toEqual(healthResult);
    expect(healthCheckService.check).toHaveBeenCalledWith([
      expect.any(Function),
    ]);
  });

  it('pings the realm-specific OIDC discovery endpoint, not a bare server ping', async () => {
    await controller.check();
    const [[indicatorFns]] = healthCheckService.check.mock.calls as [
      [Array<() => unknown>],
    ];

    await indicatorFns[0]();

    expect(httpHealthIndicator.pingCheck).toHaveBeenCalledWith(
      'keycloak',
      'http://localhost:8080/realms/people-management/.well-known/openid-configuration',
    );
  });
});
