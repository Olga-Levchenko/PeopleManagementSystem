import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { CampaignActivatedEvent } from '@pms/contracts';
import { PLATFORM_PERSON_ID_PATTERN } from '../../action-items/dto/create-action-item.dto';
import {
  ACTION_ITEM_DESCRIPTION_MAX_LENGTH,
  ACTION_ITEM_LINK_URL_MAX_LENGTH,
  ACTION_ITEM_TITLE_MAX_LENGTH,
} from '../../action-items/dto/create-action-item.dto';

class CampaignActivatedEventSourceDto {
  @IsString()
  @Matches(/^work-management-service$/)
  service!: 'work-management-service';

  @IsString()
  @Matches(/^campaign$/)
  aggregateType!: 'campaign';

  @IsUUID()
  aggregateId!: string;

  @IsInt()
  @Min(1)
  aggregateVersion!: number;
}

export class CampaignActivatedEventDto implements CampaignActivatedEvent {
  @IsUUID()
  eventId!: string;

  @Equals(1)
  schemaVersion!: 1;

  @IsDateString()
  occurredAtUtc!: string;

  @ValidateNested()
  @Type(() => CampaignActivatedEventSourceDto)
  source!: CampaignActivatedEventSourceDto;

  @IsUUID()
  campaignId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(ACTION_ITEM_TITLE_MAX_LENGTH)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(ACTION_ITEM_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsUrl()
  @MaxLength(ACTION_ITEM_LINK_URL_MAX_LENGTH)
  linkUrl!: string;

  @IsDateString()
  dueDate!: string;

  @Matches(PLATFORM_PERSON_ID_PATTERN, {
    message: 'authorPersonId must be a UUID',
  })
  authorPersonId!: string;

  @IsArray()
  @IsString({ each: true })
  @Matches(PLATFORM_PERSON_ID_PATTERN, {
    each: true,
    message: 'each recipientPersonId must be a UUID',
  })
  recipientPersonIds!: string[];
}
