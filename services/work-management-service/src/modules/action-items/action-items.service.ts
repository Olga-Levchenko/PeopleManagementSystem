import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { ActionItem } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessRoleResolutionPort } from '../management-notes/access-control-client';
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
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
