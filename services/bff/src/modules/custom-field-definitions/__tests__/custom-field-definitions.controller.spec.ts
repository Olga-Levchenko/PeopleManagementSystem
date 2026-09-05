import type { Request, Response } from 'express';
import { CustomFieldDefinitionsController } from '../custom-field-definitions.controller';
import type { CustomFieldDefinitionsService } from '../custom-field-definitions.service';

const makeRequest = (overrides?: object): Request =>
  ({
    headers: { authorization: 'Bearer test-token' },
    correlationId: 'test-correlation-id',
    ...overrides,
  }) as unknown as Request;

const makeResponse = (): jest.Mocked<Pick<Response, 'status'>> & Response => {
  const res = { status: jest.fn() } as unknown as jest.Mocked<Pick<Response, 'status'>> & Response;
  (res.status as jest.Mock).mockReturnValue(res);
  return res;
};

const makeService = (overrides: Partial<CustomFieldDefinitionsService>) =>
  overrides as unknown as CustomFieldDefinitionsService;

describe('CustomFieldDefinitionsController — status forwarding', () => {
  it('forwards 200 status from upstream list', async () => {
    const service = makeService({
      list: jest.fn().mockResolvedValue({ status: 200, body: [] }),
    });
    const response = makeResponse();
    const controller = new CustomFieldDefinitionsController(service);

    await controller.list(makeRequest(), response);

    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('forwards 201 status from upstream create', async () => {
    const created = { id: 'some-uuid', name: 'Level', dataType: 'TEXT', visibility: 'MANAGEMENT', isActive: true };
    const service = makeService({
      create: jest.fn().mockResolvedValue({ status: 201, body: created }),
    });
    const response = makeResponse();
    const controller = new CustomFieldDefinitionsController(service);

    const result = await controller.create({ name: 'Level', dataType: 'TEXT', visibility: 'MANAGEMENT' }, makeRequest(), response);

    expect(response.status).toHaveBeenCalledWith(201);
    expect(result).toBe(created);
  });

  it('forwards 200 status from upstream update', async () => {
    const updated = { id: 'some-uuid', name: 'Seniority', dataType: 'TEXT', visibility: 'MANAGEMENT', isActive: true };
    const service = makeService({
      update: jest.fn().mockResolvedValue({ status: 200, body: updated }),
    });
    const response = makeResponse();
    const controller = new CustomFieldDefinitionsController(service);

    const result = await controller.update('some-uuid', { name: 'Seniority' }, makeRequest(), response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(result).toBe(updated);
  });

  it('forwards 200 status from upstream deactivate', async () => {
    const deactivated = { id: 'some-uuid', name: 'Level', isActive: false };
    const service = makeService({
      deactivate: jest.fn().mockResolvedValue({ status: 200, body: deactivated }),
    });
    const response = makeResponse();
    const controller = new CustomFieldDefinitionsController(service);

    await controller.deactivate('some-uuid', makeRequest(), response);

    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('extracts authorization and correlationId into context', async () => {
    const listMock = jest.fn().mockResolvedValue({ status: 200, body: [] });
    const service = makeService({ list: listMock });
    const response = makeResponse();
    const controller = new CustomFieldDefinitionsController(service);

    await controller.list(
      makeRequest({ headers: { authorization: 'Bearer xyz' }, correlationId: 'abc-123' }),
      response,
    );

    expect(listMock).toHaveBeenCalledWith({ authorization: 'Bearer xyz', correlationId: 'abc-123' });
  });
});
