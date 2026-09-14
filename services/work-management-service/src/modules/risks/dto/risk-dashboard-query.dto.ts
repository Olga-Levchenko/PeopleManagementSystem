import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { RiskLevel } from '../../../generated/prisma/client';

const RISK_LEVELS: RiskLevel[] = ['low', 'need_attention', 'medium', 'high', 'leaver'];

export class RiskDashboardQueryDto {
  @IsOptional()
  @IsIn(RISK_LEVELS)
  severity?: RiskLevel;

  @IsOptional() @IsString() departmentId?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() peoplePartnerId?: string;
  @IsOptional() @IsString() managerId?: string;
  @IsOptional() @IsString() cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 50;
}
