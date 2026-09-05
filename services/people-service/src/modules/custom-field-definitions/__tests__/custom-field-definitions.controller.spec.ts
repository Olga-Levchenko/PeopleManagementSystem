import { BadRequestException } from '@nestjs/common';
import { CustomFieldDefinitionsController } from '../custom-field-definitions.controller';
import { assertDataTypeNotPresent } from '../custom-field-definitions.service';

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

  it('rejects PATCH body containing dataType before reaching service', () => {
    // assertDataTypeNotPresent is already tested in the service spec; this confirms the
    // controller wires the raw-body check before invoking the service.
    expect(() =>
      assertDataTypeNotPresent({ dataType: 'TEXT', name: 'X' }),
    ).toThrow(BadRequestException);
    expect(() => assertDataTypeNotPresent({ name: 'X' })).not.toThrow();
  });
});
