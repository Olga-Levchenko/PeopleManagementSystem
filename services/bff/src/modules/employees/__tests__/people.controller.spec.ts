import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { OidcService } from '../../auth/oidc.service';
import { EmployeesService } from '../employees.service';
import { PeopleController } from '../people.controller';

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

describe('PeopleController profile proxy', () => {
  let controller: PeopleController;
  let service: jest.Mocked<Pick<EmployeesService, 'getProfile' | 'patchField'>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [PeopleController],
      providers: [
        {
          provide: OidcService,
          useValue: {
            resolveAuthorization: jest
              .fn()
              .mockResolvedValue('Bearer verified-token'),
          },
        },
        {
          provide: EmployeesService,
          useValue: {
            getProfile: jest.fn().mockResolvedValue({
              status: 200,
              body: { s1: { fullName: 'Subject Person' }, s16: [] },
            }),
            patchField: jest.fn().mockResolvedValue({
              status: 200,
              body: { fieldKey: 'personalPhone', value: '+380000000011' },
            }),
          },
        },
      ],
    }).compile();

    controller = module.get(PeopleController);
    service = module.get(EmployeesService);
  });

  it('forwards GET profile to EmployeesService.getProfile', async () => {
    const subjectPersonId = '22222222-2222-4222-8222-222222222222';
    const req = mockRequest({
      headers: { authorization: 'Bearer incoming-token' },
    });
    const res = mockResponse();

    const body = await controller.getProfile(subjectPersonId, req, res);

    expect(service.getProfile).toHaveBeenCalledWith(
      subjectPersonId,
      expect.objectContaining({
        authorization: 'Bearer verified-token',
        correlationId: 'test-correlation-id',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body).toEqual({ s1: { fullName: 'Subject Person' }, s16: [] });
  });

  it('forwards PATCH profile field to EmployeesService.patchField', async () => {
    const subjectPersonId = '22222222-2222-4222-8222-222222222222';
    const req = mockRequest({
      headers: { authorization: 'Bearer incoming-token' },
    });
    const res = mockResponse();
    const patchBody = { fieldKey: 'personalPhone', value: '+380000000011' };

    const body = await controller.patchProfileField(
      subjectPersonId,
      patchBody,
      req,
      res,
    );

    expect(service.patchField).toHaveBeenCalledWith(
      subjectPersonId,
      patchBody,
      expect.objectContaining({
        authorization: 'Bearer verified-token',
        correlationId: 'test-correlation-id',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(body).toEqual({
      fieldKey: 'personalPhone',
      value: '+380000000011',
    });
  });
});
