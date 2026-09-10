import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

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
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryCity?: string;

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
