import { Test, TestingModule } from '@nestjs/testing';
import { AuthConfigController } from '../auth-config.controller';
import { AuthConfigService } from '../auth-config.service';
import { AuthConfigEntity } from '../entities/auth-config.entity';

describe('AuthConfigController', () => {
  let controller: AuthConfigController;

  const resolvedConfig: AuthConfigEntity = {
    issuer: 'http://localhost:8080/realms/people-management',
    jwksUri:
      'http://localhost:8080/realms/people-management/protocol/openid-connect/certs',
    realm: 'people-management',
  };
  const authConfigService = {
    getConfig: jest.fn().mockReturnValue(resolvedConfig),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthConfigController],
      providers: [{ provide: AuthConfigService, useValue: authConfigService }],
    }).compile();

    controller = module.get(AuthConfigController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates to AuthConfigService and returns its result', () => {
    expect(controller.getConfig()).toEqual(resolvedConfig);
    expect(authConfigService.getConfig).toHaveBeenCalledTimes(1);
  });
});
