import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MANAGEMENT_NOTE_CONTENT_MAX_LENGTH } from './create-management-note.dto';

/**
 * Partial update only -- `content`/`visibleForEmployee`/`visibleForPm`, nothing else. Deliberately
 * has no `subjectPersonId` (the note's subject is not re-parentable through this endpoint) and no
 * `authorPersonId` (never rewritable). AC6 requires that flipping one flag changes no other field
 * on the record -- `ManagementNotesService.updateNote` must only ever set the keys actually present
 * on this DTO, via `class-validator`'s `whitelist`/`transform` global pipe, which strips anything
 * else outright before it reaches the service.
 */
export class UpdateManagementNoteDto {
  @ApiPropertyOptional({ maxLength: MANAGEMENT_NOTE_CONTENT_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_NOTE_CONTENT_MAX_LENGTH)
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visibleForEmployee?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  visibleForPm?: boolean;
}
