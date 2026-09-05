import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Upper bound on a management note's free-form `content`. `ManagementNote.content` is an
 * unbounded Prisma `String` (maps to Postgres `text`, no column-level limit) -- this is an
 * application-level sanity bound against an unbounded write, not a database constraint mirror.
 * Shared between create and update so the two DTOs can't silently drift apart.
 */
export const MANAGEMENT_NOTE_CONTENT_MAX_LENGTH = 10_000;

/**
 * `visibleForEmployee`/`visibleForPm` are optional -- omitting both leaves the DB's own
 * `@default(false)` in effect (AC1), never an application-level default duplicating it.
 * `authorPersonId` is deliberately absent: it is always server-derived from the JWT `sub`, never
 * accepted from the request body (this spec's own Boundaries).
 */
export class CreateManagementNoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  subjectPersonId!: string;

  @ApiProperty({ maxLength: MANAGEMENT_NOTE_CONTENT_MAX_LENGTH })
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_NOTE_CONTENT_MAX_LENGTH)
  content!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visibleForEmployee?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visibleForPm?: boolean;
}
