import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { RiskLevel } from '../../../generated/prisma/client';
import { PLATFORM_PERSON_ID_PATTERN } from '../../action-items/dto/create-action-item.dto';

export const RISK_DESCRIPTION_MAX_LENGTH = 10_000;
export const RISK_DETAILS_MAX_LENGTH = 10_000;

export class CreateRiskRecordDto {
  @ApiProperty({ format: 'uuid' })
  @Matches(PLATFORM_PERSON_ID_PATTERN, {
    message: 'subjectPersonId must be a UUID',
  })
  subjectPersonId!: string;

  @ApiProperty({ enum: RiskLevel })
  @IsEnum(RiskLevel)
  level!: RiskLevel;

  @ApiProperty({ maxLength: RISK_DESCRIPTION_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(RISK_DESCRIPTION_MAX_LENGTH)
  description!: string;

  @ApiPropertyOptional({ maxLength: RISK_DETAILS_MAX_LENGTH })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(RISK_DETAILS_MAX_LENGTH)
  details?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    description:
      'Calendar date of the risk event (UTC). Defaults to today when omitted.',
  })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  recordedAt?: string;
}
