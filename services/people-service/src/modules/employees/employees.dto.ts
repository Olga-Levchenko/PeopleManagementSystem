import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  Matches,
} from 'class-validator';

export class RiskDashboardMetadataDto {
  @IsArray()
  @ArrayMaxSize(500)
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    each: true,
  })
  personIds!: string[];
}

export class ListEmployeesQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 50;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryCity?: string;

  @ApiPropertyOptional({ enum: ['fullName', 'position', 'departmentName', 'countryCity'] })
  @IsOptional()
  @IsString()
  sortBy?: 'fullName' | 'position' | 'departmentName' | 'countryCity';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsString()
  sortDirection?: 'asc' | 'desc';

  @ApiPropertyOptional({
    description: 'Inclusive lower bound for yearsWithCompany',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  yearsWithCompanyMin?: number;

  @ApiPropertyOptional({
    description: 'Inclusive upper bound for yearsWithCompany',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  yearsWithCompanyMax?: number;
}

export class ExportEmployeesQueryDto extends ListEmployeesQueryDto {
  @ApiProperty({
    description: 'Comma-separated catalog column keys to export',
    example: 'fullName,position',
  })
  @IsString()
  columns!: string;
}
