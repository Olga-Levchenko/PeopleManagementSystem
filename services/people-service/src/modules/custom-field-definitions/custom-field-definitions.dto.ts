import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum CustomFieldDataType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  BOOLEAN = 'BOOLEAN',
}

export enum CustomFieldVisibility {
  MANAGEMENT = 'MANAGEMENT',
  EMPLOYEE = 'EMPLOYEE',
  COLLEAGUE = 'COLLEAGUE',
}

export class CreateCustomFieldDefinitionDto {
  @ApiProperty({
    description:
      'Human-readable field label; must be unique across active definitions (case-insensitive)',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    enum: CustomFieldDataType,
    description: 'Immutable after creation',
  })
  @IsEnum(CustomFieldDataType)
  dataType!: CustomFieldDataType;

  @ApiProperty({
    enum: CustomFieldVisibility,
    description: 'Who can see this field on a profile',
  })
  @IsEnum(CustomFieldVisibility)
  visibility!: CustomFieldVisibility;
}

/**
 * dataType is intentionally absent: it is immutable after creation and must not be accepted
 * in an update payload (a 400 is returned if the caller sends it — enforced in the service).
 */
export class UpdateCustomFieldDefinitionDto {
  @ApiPropertyOptional({
    description:
      'Updated label; must remain unique across active definitions (case-insensitive)',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ enum: CustomFieldVisibility })
  @IsOptional()
  @IsEnum(CustomFieldVisibility)
  visibility?: CustomFieldVisibility;
}
