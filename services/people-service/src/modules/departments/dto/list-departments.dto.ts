import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListDepartmentsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;
}
