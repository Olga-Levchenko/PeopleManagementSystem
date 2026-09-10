import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type {
  SavedViewConfiguration,
  SavedViewFilters,
} from './employees-list-config.validator';

export class SavedViewFiltersDto implements SavedViewFilters {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  yearsWithCompanyMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  yearsWithCompanyMax?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  customFieldFilters?: Record<string, string>;
}

export class SavedViewConfigurationDto implements SavedViewConfiguration {
  @ApiProperty({ type: [String] })
  @IsString({ each: true })
  visibleColumnKeys!: string[];

  @ApiProperty({ type: SavedViewFiltersDto })
  @ValidateNested()
  @Type(() => SavedViewFiltersDto)
  filters!: SavedViewFiltersDto;
}

export class CreateSavedViewDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty()
  @ValidateNested()
  @Type(() => SavedViewConfigurationDto)
  configuration!: SavedViewConfigurationDto;

  @ApiProperty({ minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize!: number;
}

export class UpdateSavedViewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => SavedViewConfigurationDto)
  configuration?: SavedViewConfigurationDto;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ShareSavedViewDto {
  @ApiProperty()
  @IsUUID()
  recipientPersonId!: string;
}

export interface SavedViewResponse {
  id: string;
  name: string;
  creatorPersonId: string;
  isOwner: boolean;
  pageSize: number;
  configuration: SavedViewConfiguration;
  applicableConfiguration: SavedViewConfiguration;
}

export interface SavedViewShareResponse {
  id: string;
  viewId: string;
  recipientPersonId: string;
  sharedAt: string;
}
