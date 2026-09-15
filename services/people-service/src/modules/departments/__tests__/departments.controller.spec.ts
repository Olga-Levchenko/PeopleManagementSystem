import { DepartmentsController } from '../departments.controller';

describe('DepartmentsController', () => {
  it('delegates to service.search with query name', async () => {
    const rows = [{ id: 'dept-1', name: 'Engineering' }];
    const service = { search: jest.fn().mockResolvedValue(rows) } as never;
    const controller = new DepartmentsController(service);

    const result = await controller.list({ name: 'eng' });

    expect(service.search).toHaveBeenCalledWith('eng');
    expect(result).toBe(rows);
  });

  it('passes undefined to service.search when name is absent', async () => {
    const service = { search: jest.fn().mockResolvedValue([]) } as never;
    const controller = new DepartmentsController(service);

    await controller.list({});

    expect(service.search).toHaveBeenCalledWith(undefined);
  });
});
