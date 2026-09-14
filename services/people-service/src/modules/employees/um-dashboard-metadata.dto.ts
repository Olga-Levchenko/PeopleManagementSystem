import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UMDashboardPersonDto {
  @ApiProperty()
  personId!: string;

  @ApiProperty()
  fullName!: string;

  @ApiPropertyOptional({ nullable: true, type: Object })
  department!: { id: string; label: string } | null;

  @ApiProperty({ type: [Object] })
  projects!: Array<{ id: string; label: string }>;

  @ApiPropertyOptional({ nullable: true, type: String })
  leaveStatus!: string | null;
}

export class UMDashboardMetadataResponseDto {
  @ApiProperty({ type: [UMDashboardPersonDto] })
  people!: UMDashboardPersonDto[];
}
