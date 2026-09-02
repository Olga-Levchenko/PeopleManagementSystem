import { Type } from 'class-transformer';
import {
  IsJSON,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const ROLE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class RoleKeyParamsDto {
  @IsString()
  @Matches(ROLE_KEY_PATTERN)
  roleKey!: string;
}

export class RolePermissionParamsDto extends RoleKeyParamsDto {
  @IsString()
  @IsNotEmpty()
  permissionKey!: string;
}

export class PersonParamsDto {
  @IsUUID()
  personId!: string;
}

export class PersonRoleParamsDto extends PersonParamsDto {
  @IsString()
  @Matches(ROLE_KEY_PATTERN)
  roleKey!: string;
}

export class CreateFunctionalRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(ROLE_KEY_PATTERN)
  roleKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/\S/)
  displayName!: string;
}

export class UpdateFunctionalRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Matches(/\S/)
  displayName!: string;
}

export class DeactivateFunctionalRoleDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  reason!: string;
}

export class GrantPermissionDto {
  @IsOptional()
  @IsObject()
  @Type(() => Object)
  scope?: Record<string, unknown>;
}

export class AssignFunctionalRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(ROLE_KEY_PATTERN)
  roleKey!: string;
}

export class RevokePermissionQueryDto {
  @IsOptional()
  @IsString()
  @IsJSON()
  scope?: string;
}
