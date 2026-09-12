import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ActionItem } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessRoleResolutionPort } from '../management-notes/access-control-client';
import type { CancelActionItemDto } from './dto/cancel-action-item.dto';
import type { CreateActionItemDto } from './dto/create-action-item.dto';
import type { PermissionsCheckPort } from './permissions-client';

export interface ActionItemView {
  id: string;
  title: string;
  description: string | null;
  assigneePersonId: string;
  authorPersonId: string;
  dueDate: Date;
  linkUrl: string | null;
  status: string;
  source: string;
  completionDate: Date | null;
  cancelReason: string | null;
  isOverdue: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ActionItemsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('PermissionsCheckPort')
    private readonly permissionsCheck: PermissionsCheckPort,
    @Inject('AccessRoleResolutionPort')
    private readonly accessRoleResolution: AccessRoleResolutionPort,
  ) {}

  async createActionItem(
    viewerPersonId: string,
    dto: CreateActionItemDto,
    subjectToken: string,
  ): Promise<ActionItemView> {
    const hasPermission =
      await this.permissionsCheck.hasCreateActionItemsPermission(subjectToken);
    if (!hasPermission) {
      throw new ForbiddenException();
    }

    const isSelfAssign = dto.assigneePersonId === viewerPersonId;
    if (!isSelfAssign) {
      const resolution = await this.accessRoleResolution.resolve(
        viewerPersonId,
        dto.assigneePersonId,
        subjectToken,
      );
      const hasQualifyingLine =
        resolution.reportingLine ||
        resolution.peoplePartnerLine ||
        resolution.projectLine;
      if (!hasQualifyingLine) {
        throw new ForbiddenException();
      }
    }

    const item = await this.prisma.actionItem.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        assigneePersonId: dto.assigneePersonId,
        authorPersonId: viewerPersonId,
        dueDate: dto.dueDate,
        linkUrl: dto.linkUrl ?? null,
        status: 'open',
        source: 'manual',
        completionDate: null,
        cancelReason: null,
      },
    });

    return this.toView(item);
  }

  async completeActionItem(
    viewerPersonId: string,
    actionItemId: string,
  ): Promise<ActionItemView> {
    const existing = await this.prisma.actionItem.findUnique({
      where: { id: actionItemId },
    });
    if (!existing) {
      throw new NotFoundException();
    }
    if (existing.assigneePersonId !== viewerPersonId) {
      throw new ForbiddenException();
    }

    const completionDate = new Date();
    const updated = await this.prisma.actionItem.updateMany({
      where: { id: actionItemId, status: 'open' },
      data: {
        status: 'completed',
        completionDate,
      },
    });
    if (updated.count === 0) {
      throw new ConflictException();
    }

    const item = await this.prisma.actionItem.findUniqueOrThrow({
      where: { id: actionItemId },
    });
    return this.toView(item);
  }

  async cancelActionItem(
    viewerPersonId: string,
    actionItemId: string,
    dto: CancelActionItemDto,
  ): Promise<ActionItemView> {
    const existing = await this.prisma.actionItem.findUnique({
      where: { id: actionItemId },
    });
    if (!existing) {
      throw new NotFoundException();
    }
    if (existing.authorPersonId !== viewerPersonId) {
      throw new ForbiddenException();
    }

    const updated = await this.prisma.actionItem.updateMany({
      where: { id: actionItemId, status: 'open' },
      data: {
        status: 'cancelled',
        cancelReason: dto.cancelReason,
        completionDate: null,
      },
    });
    if (updated.count === 0) {
      throw new ConflictException();
    }

    const item = await this.prisma.actionItem.findUniqueOrThrow({
      where: { id: actionItemId },
    });
    return this.toView(item);
  }

  computeIsOverdue(item: Pick<ActionItem, 'status' | 'dueDate'>): boolean {
    if (item.status !== 'open') {
      return false;
    }
    const todayUtc = utcCalendarDate(new Date());
    const dueUtc = utcCalendarDate(item.dueDate);
    return todayUtc > dueUtc;
  }

  private toView(item: ActionItem): ActionItemView {
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      assigneePersonId: item.assigneePersonId,
      authorPersonId: item.authorPersonId,
      dueDate: item.dueDate,
      linkUrl: item.linkUrl,
      status: item.status,
      source: item.source,
      completionDate: item.completionDate,
      cancelReason: item.cancelReason,
      isOverdue: this.computeIsOverdue(item),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}

function utcCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
