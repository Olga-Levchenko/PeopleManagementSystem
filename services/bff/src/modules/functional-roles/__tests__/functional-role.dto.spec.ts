import 'reflect-metadata';
import { validate } from 'class-validator';
import {
  CreateFunctionalRoleDto,
  GrantPermissionDto,
  PersonRoleParamsDto,
  RevokePermissionQueryDto,
} from '../dto/functional-role.dto';

describe('functional-role DTOs', () => {
  it('rejects invalid role keys and blank display names', async () => {
    const dto = Object.assign(new CreateFunctionalRoleDto(), {
      roleKey: 'Not A Role',
      displayName: ' ',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['roleKey', 'displayName']),
    );
  });

  it('accepts a scoped dashboard grant object', async () => {
    const dto = Object.assign(new GrantPermissionDto(), {
      scope: { dashboardType: 'unit-manager' },
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects malformed revoke scope JSON', async () => {
    const dto = Object.assign(new RevokePermissionQueryDto(), {
      scope: '{not-json}',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('scope');
  });

  it('rejects invalid role and person path parameters', async () => {
    const params = Object.assign(new PersonRoleParamsDto(), {
      personId: 'not-a-uuid',
      roleKey: 'Not A Role',
    });

    const errors = await validate(params);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['personId', 'roleKey']),
    );
  });
});
