import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ManagementNote } from '../../generated/prisma/client';
import type { AccessRoleResolutionPort } from './access-control-client';
import type { CreateManagementNoteDto } from './dto/create-management-note.dto';
import type { UpdateManagementNoteDto } from './dto/update-management-note.dto';

export interface ManagementNoteView {
  id: string;
  subjectPersonId: string;
  authorPersonId: string;
  content: string;
  visibleForEmployee: boolean;
  visibleForPm: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The four mutually-exclusive outcomes of resolving a viewer's S7 access toward a subject, per
 * this spec's Boundaries table. `'full'` is UM/DM/PP (or a Full-profile-access holder) --
 * unconditional RW regardless of flags. `'pm'` is a PM-only viewer -- read-only,
 * `visibleForPm`-only. `'self'` is the subject viewing their own record -- read-only,
 * `visibleForEmployee`-only. `'none'` is everyone else -- 403, no note existence ever implied.
 */
type ManagementNotesAccess = 'full' | 'pm' | 'self' | 'none';

@Injectable()
export class ManagementNotesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('AccessRoleResolutionPort')
    private readonly accessRoleResolution: AccessRoleResolutionPort,
  ) {}

  /**
   * Resolves the viewer's S7 access toward `subjectPersonId`, per this spec's Boundaries table:
   *
   * - Self is checked BEFORE calling the resolver -- `AccessRoleResolver` returns `AccessRole.None`
   *   for self by its own contract (self is not a resolver concept), so calling it first here
   *   would silently produce `'none'` instead of `'self'`.
   * - Full RW when `reportingLine`, `peoplePartnerLine`, or `fullProfileAccessLine` is true, OR
   *   `projectRoles` contains `DeliveryManager` -- these conditions are independent and OR'd,
   *   which is what makes "most-permissive-path-wins" (AC5) fall out for free with no separate
   *   merge step.
   * - Otherwise, read-only PM access when `projectRoles` contains `ProjectManager`.
   * - Otherwise, no access at all.
   */
  private async resolveAccess(
    viewerId: string,
    subjectPersonId: string,
  ): Promise<ManagementNotesAccess> {
    if (viewerId === subjectPersonId) {
      return 'self';
    }

    const resolution = await this.accessRoleResolution.resolve(
      viewerId,
      subjectPersonId,
    );

    const isFullRw =
      resolution.reportingLine ||
      resolution.peoplePartnerLine ||
      resolution.fullProfileAccessLine ||
      resolution.projectRoles.includes('DeliveryManager');
    if (isFullRw) {
      return 'full';
    }

    if (resolution.projectRoles.includes('ProjectManager')) {
      return 'pm';
    }

    return 'none';
  }

  async listNotes(
    viewerId: string,
    subjectPersonId: string,
  ): Promise<ManagementNoteView[]> {
    const access = await this.resolveAccess(viewerId, subjectPersonId);

    switch (access) {
      case 'full':
        return this.findNotes(subjectPersonId, {});
      case 'pm':
        return this.findNotes(subjectPersonId, { visibleForPm: true });
      case 'self':
        return this.findNotes(subjectPersonId, { visibleForEmployee: true });
      case 'none':
        throw new ForbiddenException();
    }
  }

  async createNote(
    viewerId: string,
    dto: CreateManagementNoteDto,
  ): Promise<ManagementNoteView> {
    const access = await this.resolveAccess(viewerId, dto.subjectPersonId);
    if (access !== 'full') {
      // Covers 'pm' (read-only), 'self' (read-only for own record), and 'none' alike -- only
      // full RW may ever create a note, regardless of flag values requested.
      throw new ForbiddenException();
    }

    const note = await this.prisma.managementNote.create({
      data: {
        subjectPersonId: dto.subjectPersonId,
        // Always server-derived from the verified JWT actor, never accepted from the request body.
        authorPersonId: viewerId,
        content: dto.content,
        // Omitting a flag entirely leaves Prisma's own @default(false) column default in effect
        // (AC1) -- never an application-level `?? false` here, which would apply on every create
        // regardless of whether the DB schema's own default ever changes.
        ...(dto.visibleForEmployee !== undefined
          ? { visibleForEmployee: dto.visibleForEmployee }
          : {}),
        ...(dto.visibleForPm !== undefined
          ? { visibleForPm: dto.visibleForPm }
          : {}),
      },
    });

    return this.toView(note);
  }

  async updateNote(
    viewerId: string,
    noteId: string,
    dto: UpdateManagementNoteDto,
  ): Promise<ManagementNoteView> {
    // The note's own subjectPersonId is needed to resolve access, and PATCH /:id carries no
    // subjectPersonId of its own -- a genuinely-missing note 404s before any access check (there
    // is no subject to resolve access against), which reveals nothing about who can see any real
    // subject's notes. A note that DOES exist but the viewer lacks full RW over always 403s
    // without ever returning the note's content -- this is the scenario this spec's "no note
    // existence ever implied" boundary actually protects.
    const existing = await this.prisma.managementNote.findUnique({
      where: { id: noteId },
    });
    if (!existing) {
      throw new NotFoundException();
    }

    const access = await this.resolveAccess(viewerId, existing.subjectPersonId);
    if (access !== 'full') {
      throw new ForbiddenException();
    }

    const note = await this.prisma.managementNote.update({
      where: { id: noteId },
      data: {
        // Only the keys actually present on the (whitelisted/transformed) DTO are ever set -- AC6
        // requires that flipping one flag changes no other field on the record.
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.visibleForEmployee !== undefined
          ? { visibleForEmployee: dto.visibleForEmployee }
          : {}),
        ...(dto.visibleForPm !== undefined
          ? { visibleForPm: dto.visibleForPm }
          : {}),
      },
    });

    return this.toView(note);
  }

  private async findNotes(
    subjectPersonId: string,
    filter: Partial<
      Pick<ManagementNote, 'visibleForEmployee' | 'visibleForPm'>
    >,
  ): Promise<ManagementNoteView[]> {
    const notes = await this.prisma.managementNote.findMany({
      where: { subjectPersonId, ...filter },
      orderBy: { createdAt: 'desc' },
    });
    return notes.map((note) => this.toView(note));
  }

  private toView(note: ManagementNote): ManagementNoteView {
    return {
      id: note.id,
      subjectPersonId: note.subjectPersonId,
      authorPersonId: note.authorPersonId,
      content: note.content,
      visibleForEmployee: note.visibleForEmployee,
      visibleForPm: note.visibleForPm,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
  }
}
