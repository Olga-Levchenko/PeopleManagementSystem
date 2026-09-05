import { BadRequestException } from '@nestjs/common';
import { CustomFieldDefinitionsController } from '../custom-field-definitions.controller';

describe('CustomFieldDefinitionsController — dataType rejection', () => {
  it('delegates listAll to service', async () => {
    const definitions = [{ id: '1', name: 'Level' }];
    const service = {
      listAll: jest.fn().mockResolvedValue(definitions),
    } as never;
    const actor = { actorId: 'actor-1' } as never;
    const controller = new CustomFieldDefinitionsController(service, actor);

    const result = await controller.listAll();

    expect(result).toBe(definitions);
  });

  it('throws BadRequestException from update when raw body contains dataType', () => {
    const service = {
      listAll: jest.fn(),
      update: jest.fn(),
    } as never;
    const actor = { actorId: 'actor-1' } as never;
    const controller = new CustomFieldDefinitionsController(service, actor);

    expect(() =>
      controller.update(
        'bbbbbbbb-0000-4000-8000-000000000001',
        {} as never,
        { dataType: 'TEXT', name: 'X' },
      ),
    ).toThrow(BadRequestException);

    expect(service.update).not.toHaveBeenCalled();
  });

  it('calls service.update when raw body has no dataType', async () => {
    const updated = { id: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Seniority' };
    const service = {
      listAll: jest.fn(),
      update: jest.fn().mockResolvedValue(updated),
    } as never;
    const actor = { actorId: 'actor-1' } as never;
    const controller = new CustomFieldDefinitionsController(service, actor);

    const result = await controller.update(
      'bbbbbbbb-0000-4000-8000-000000000001',
      { name: 'Seniority' } as never,
      { name: 'Seniority' },
    );

    expect(service.update).toHaveBeenCalledWith(
      'actor-1',
      'bbbbbbbb-0000-4000-8000-000000000001',
      { name: 'Seniority' },
    );
    expect(result).toBe(updated);
  });
});
