import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { OidcService } from '../../auth/oidc.service';
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
          provide: OidcService,
          useValue: {
            resolveAuthorization: jest
              .fn()
              .mockImplementation(
                (
                  _session: unknown,
                  incomingAuthorization: string | undefined,
                ) => Promise.resolve(incomingAuthorization),
              ),
          },
        },
        {
          provide: FunctionalRolesService,
          useValue: {
            getCatalogue: jest
              .fn()
              .mockResolvedValue({ status: 200, body: { permissions: [] } }),
            getRoles: jest
              .fn()
              .mockResolvedValue({ status: 200, body: { roles: [] } }),
          },
        },
      ],
    }).compile();

    controller = module.get(FunctionalRolesController);
    service = module.get(FunctionalRolesService);
  });

  it('forwards an explicit bearer token when present in the request header', async () => {
    const req = mockRequest({
      headers: { authorization: 'Bearer incoming-token' },
    });
    await controller.getRoles(req, mockResponse());

    expect(service.getRoles).toHaveBeenCalledWith(
      expect.objectContaining({ authorization: 'Bearer incoming-token' }),
    );
  });

  it('exchanges a browser session token instead of forwarding it', async () => {
    const oidc = {
      resolveAuthorization: jest
        .fn()
        .mockResolvedValue('Bearer exchanged-access-control-token'),
    };
    controller = new FunctionalRolesController(
      service,
      oidc as unknown as OidcService,
    );
    const req = mockRequest({
      session: { accessToken: 'session-access-token' },
    });
    await controller.getCatalogue(req, mockResponse());

    expect(service.getCatalogue).toHaveBeenCalledWith(
      expect.objectContaining({
        authorization: 'Bearer exchanged-access-control-token',
      }),
    );
    expect(oidc.resolveAuthorization).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'session-access-token' }),
      undefined,
      'access-control-service',
    );
  });

  it('passes undefined authorization when neither bearer header nor session token is present', async () => {
    const req = mockRequest();
    await controller.getRoles(req, mockResponse());

    expect(service.getRoles).toHaveBeenCalledWith(
      expect.objectContaining({ authorization: undefined }),
    );
  });

  it('passes undefined authorization when session itself is absent (e.g. no session middleware)', async () => {
    const req = {
      headers: {},
      correlationId: 'test-correlation-id',
    } as unknown as Request;
    await controller.getRoles(req, mockResponse());

    expect(service.getRoles).toHaveBeenCalledWith(
      expect.objectContaining({ authorization: undefined }),
    );
  });
});
