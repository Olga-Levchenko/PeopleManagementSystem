import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
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
  // ValidateIf, not IsOptional, on all three fields below -- IsOptional treats an explicit
  // `null` the same as `undefined` and skips the type validator entirely, letting `null` reach
  // Prisma against a non-nullable column. ValidateIf only skips validation when the field is
  // truly absent (undefined); an explicit `null` still fails IsString/IsBoolean and gets a clean
  // 400 instead of an unhandled 500.
  @ApiPropertyOptional({ maxLength: MANAGEMENT_NOTE_CONTENT_MAX_LENGTH })
  @ValidateIf((o: UpdateManagementNoteDto) => o.content !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(MANAGEMENT_NOTE_CONTENT_MAX_LENGTH)
  content?: string;

  @ApiPropertyOptional()
  @ValidateIf(
    (o: UpdateManagementNoteDto) => o.visibleForEmployee !== undefined,
  )
  @IsBoolean()
  visibleForEmployee?: boolean;

  @ApiPropertyOptional()
  @ValidateIf((o: UpdateManagementNoteDto) => o.visibleForPm !== undefined)
  @IsBoolean()
  visibleForPm?: boolean;
}
