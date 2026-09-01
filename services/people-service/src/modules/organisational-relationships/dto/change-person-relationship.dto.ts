import { ApiProperty } from '@nestjs/swagger'
import { IsOptional, IsUUID } from 'class-validator'

export class ChangePersonRelationshipDto {
  @ApiProperty({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  relatedPersonId?: string
}
