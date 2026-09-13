import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RiskLevel } from '../../../generated/prisma/client';

export class RiskRecordEntity {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  subjectPersonId!: string;

  @ApiProperty({ format: 'uuid' })
  authorPersonId!: string;

  @ApiProperty({ enum: RiskLevel })
  level!: RiskLevel;

  @ApiProperty()
  description!: string;

  @ApiPropertyOptional({ nullable: true })
  details!: string | null;

  @ApiProperty({ type: String, format: 'date' })
  recordedAt!: Date;

  @ApiProperty({
    enum: ['up', 'down'],
    nullable: true,
    description:
      'Trend vs immediately preceding record; null when first or unchanged.',
  })
  trendDirection!: 'up' | 'down' | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class RiskSummaryEntity {
  @ApiProperty({ enum: RiskLevel, nullable: true })
  currentLevel!: RiskLevel | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  recordedAt!: Date | null;
}

export class RiskHistoryResponseEntity {
  @ApiProperty({ type: RiskSummaryEntity })
  summary!: RiskSummaryEntity;

  @ApiProperty({ type: [RiskRecordEntity] })
  records!: RiskRecordEntity[];
}
