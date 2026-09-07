import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { FunctionalRolesController } from '../functional-roles.controller';
import { FunctionalRolesService } from '../functional-roles.service';

const mockResponse = () => {
  const res = { status: jest.fn().mockReturnThis() } as unknown as Response;
  return res;
};

const mockRequest = (
  overrides: Partial<Request> & { session?: Record<string, unknown> } = {},
): Request => {
  const { session = {}, ...rest } = overrides;
  return {
    headers: {},
    correlationId: 'test-correlation-id',
    session,
    ...rest,
  } as unknown as Request;
};

describe('FunctionalRolesController — resolveAuthorization', () => {
  let controller: FunctionalRolesController;
  let service: jest.Mocked<FunctionalRolesService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [FunctionalRolesController],
      providers: [
        {
          provide: FunctionalRolesService,
          useValue: {
            getCatalogue: jest.fn().mockResolvedValue({ status: 200, body: { permissions: [] } }),
            getRoles: jest.fn().mockResolvedValue({ status: 200, body: { roles: [] } }),
          },
        },
      ],
    }).compile();

    controller = module.get(FunctionalRolesController);
    service = module.get(FunctionalRolesService);
  });

  it('forwards an explicit bearer token when present in the request header', async () => {
    const req = mockRequest({ headers: { authorization: 'Bearer incoming-token' } });
    await controller.getRoles(req, mockResponse());

    expect(service.getRoles).toHaveBeenCalledWith(
      expect.objectContaining({ authorization: 'Bearer incoming-token' }),
    );
  });

  it('falls back to session access token when no bearer token is in the request header', async () => {
    const req = mockRequest({ session: { accessToken: 'session-access-token' } });
    await controller.getCatalogue(req, mockResponse());

    expect(service.getCatalogue).toHaveBeenCalledWith(
      expect.objectContaining({ authorization: 'Bearer session-access-token' }),
    );
  });

  it('passes undefined authorization when neither bearer header nor session token is present', async () => {
    const req = mockRequest();
    await controller.getRoles(req, mockResponse());

    expect(service.getRoles).toHaveBeenCalledWith(
      expect.objectContaining({ authorization: undefined }),
    );
  });
});
