import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DepartmentEntity {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;
}
