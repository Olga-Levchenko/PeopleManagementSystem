import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ACTION_ITEM_DESCRIPTION_MAX_LENGTH } from './create-action-item.dto';

export class CancelActionItemDto {
  @ApiProperty({ maxLength: ACTION_ITEM_DESCRIPTION_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(ACTION_ITEM_DESCRIPTION_MAX_LENGTH)
  cancelReason!: string;
}
