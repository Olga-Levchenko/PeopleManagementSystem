import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { CreateManagementNoteDto } from './dto/create-management-note.dto';
import { UpdateManagementNoteDto } from './dto/update-management-note.dto';
import { ManagementNotesService } from './management-notes.service';

interface AuthenticatedRequest extends Request {
  user?: { sub?: string };
}

/**
 * Reads the verified actor id off `request.user.sub` -- same convention as `people-service`'s
 * `RequestActorContext` (`JwtAuthGuard` has already run by the time any handler here executes, so
 * `request.user` is always populated on every non-`@Public()` route; this only guards against a
 * malformed/empty `sub`, mirroring `RequestActorContext`'s own defensive check).
 */
function requireActorId(request: AuthenticatedRequest): string {
  const actorId = request.user?.sub;
  if (!actorId) {
    throw new UnauthorizedException('Authenticated actor is required');
  }
  return actorId;
}

export function extractBearerToken(
  authorization: string | undefined,
): string | undefined {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function requireBearerToken(request: AuthenticatedRequest): string {
  const token = extractBearerToken(request.headers.authorization);
  if (!token) {
    throw new UnauthorizedException('Authenticated bearer token is required');
  }
  return token;
}

@ApiBearerAuth()
@Controller('management-notes')
export class ManagementNotesController {
  constructor(private readonly service: ManagementNotesService) {}

  @Get()
  listNotes(
    @Query('subjectPersonId', new ParseUUIDPipe()) subjectPersonId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.listNotes(
      requireActorId(request),
      subjectPersonId,
      requireBearerToken(request),
    );
  }

  @Post()
  createNote(
    @Body() dto: CreateManagementNoteDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.createNote(
      requireActorId(request),
      dto,
      requireBearerToken(request),
    );
  }

  @Patch(':id')
  updateNote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateManagementNoteDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.updateNote(
      requireActorId(request),
      id,
      dto,
      requireBearerToken(request),
    );
  }
}
