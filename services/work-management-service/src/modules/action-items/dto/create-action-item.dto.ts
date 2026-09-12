import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Platform Person.id values are UUID-shaped but not always RFC-4122 versioned (seed uses `0000`). */
export const PLATFORM_PERSON_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ACTION_ITEM_TITLE_MAX_LENGTH = 500;
export const ACTION_ITEM_DESCRIPTION_MAX_LENGTH = 10_000;
export const ACTION_ITEM_LINK_URL_MAX_LENGTH = 2_048;

export class CreateActionItemDto {
  @ApiProperty({ maxLength: ACTION_ITEM_TITLE_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(ACTION_ITEM_TITLE_MAX_LENGTH)
  title!: string;

  @ApiProperty({ format: 'uuid' })
  @Matches(PLATFORM_PERSON_ID_PATTERN, {
    message: 'assigneePersonId must be a UUID',
  })
  assigneePersonId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  dueDate!: Date;

  @ApiPropertyOptional({ maxLength: ACTION_ITEM_DESCRIPTION_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(ACTION_ITEM_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional({ maxLength: ACTION_ITEM_LINK_URL_MAX_LENGTH })
  @IsOptional()
  @IsUrl()
  @MaxLength(ACTION_ITEM_LINK_URL_MAX_LENGTH)
  linkUrl?: string;
}
