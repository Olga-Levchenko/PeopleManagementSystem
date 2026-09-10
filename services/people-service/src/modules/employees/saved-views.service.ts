import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertCustomDefinitionsActiveForSave,
  assertDepartmentExistsForSave,
  assertSavedViewConfiguration,
  parseSavedViewConfiguration,
  resolveApplicableFilters,
  type SavedViewConfiguration,
} from './employees-list-config.validator';
import { EmployeesService } from './employees.service';
import type {
  CreateSavedViewDto,
  SavedViewResponse,
  SavedViewShareResponse,
  UpdateSavedViewDto,
} from './saved-views.dto';

@Injectable()
export class SavedViewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeesService: EmployeesService,
  ) {}

  async listSavedViews(viewerPersonId: string): Promise<SavedViewResponse[]> {
    const [ownedViews, sharedViews] = await Promise.all([
      this.prisma.employeeListSavedView.findMany({
        where: { creatorPersonId: viewerPersonId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.employeeListSavedView.findMany({
        where: {
          shares: { some: { recipientPersonId: viewerPersonId } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const owned = await Promise.all(
      ownedViews.map((view) => this.toResponse(view, true)),
    );
    const shared = await Promise.all(
      sharedViews.map((view) => this.toResponse(view, false)),
    );

    return [...owned, ...shared];
  }

  async createSavedView(
    viewerPersonId: string,
    dto: CreateSavedViewDto,
  ): Promise<SavedViewResponse> {
    await this.validateForSave(viewerPersonId, dto.configuration);
    await this.assertUniqueName(viewerPersonId, dto.name);

    const created = await this.prisma.employeeListSavedView.create({
      data: {
        name: dto.name,
        creatorPersonId: viewerPersonId,
        pageSize: dto.pageSize,
        configuration: dto.configuration as unknown as Prisma.InputJsonValue,
      },
    });

    return this.toResponse(created, true);
  }

  async updateSavedView(
    viewerPersonId: string,
    viewId: string,
    dto: UpdateSavedViewDto,
  ): Promise<SavedViewResponse> {
    const view = await this.findOwnedViewForMutation(viewerPersonId, viewId);

    if (
      dto.name === undefined &&
      dto.configuration === undefined &&
      dto.pageSize === undefined
    ) {
      throw new BadRequestException('At least one field must be provided.');
    }

    if (dto.name !== undefined && dto.name !== view.name) {
      await this.assertUniqueName(viewerPersonId, dto.name, viewId);
    }

    const nextConfiguration =
      dto.configuration ?? parseSavedViewConfiguration(view.configuration);
    if (dto.configuration !== undefined) {
      await this.validateForSave(viewerPersonId, dto.configuration);
    }

    const updated = await this.prisma.employeeListSavedView.update({
      where: { id: viewId },
      data: {
        name: dto.name ?? view.name,
        pageSize: dto.pageSize ?? view.pageSize,
        configuration: (dto.configuration ??
          nextConfiguration) as unknown as Prisma.InputJsonValue,
      },
    });

    return this.toResponse(updated, true);
  }

  async deleteSavedView(viewerPersonId: string, viewId: string): Promise<void> {
    await this.findOwnedViewForMutation(viewerPersonId, viewId);
    await this.prisma.employeeListSavedView.delete({ where: { id: viewId } });
  }

  async shareSavedView(
    viewerPersonId: string,
    viewId: string,
    recipientPersonId: string,
  ): Promise<{ body: SavedViewShareResponse; statusCode: 200 | 201 }> {
    const view = await this.findOwnedViewForMutation(viewerPersonId, viewId);

    if (recipientPersonId === viewerPersonId) {
      throw new BadRequestException('Cannot share a view with yourself.');
    }

    const recipient = await this.prisma.person.findUnique({
      where: { id: recipientPersonId },
      select: { id: true },
    });
    if (!recipient) {
      throw new NotFoundException('Recipient person was not found.');
    }

    const existing = await this.prisma.employeeListSavedViewShare.findUnique({
      where: {
        viewId_recipientPersonId: {
          viewId: view.id,
          recipientPersonId,
        },
      },
    });
    if (existing) {
      return {
        body: this.toShareResponse(existing),
        statusCode: 200,
      };
    }

    const created = await this.prisma.employeeListSavedViewShare.create({
      data: {
        viewId: view.id,
        recipientPersonId,
      },
    });

    return {
      body: this.toShareResponse(created),
      statusCode: 201,
    };
  }

  async revokeShare(
    viewerPersonId: string,
    viewId: string,
    recipientPersonId: string,
  ): Promise<void> {
    await this.findOwnedViewForMutation(viewerPersonId, viewId);

    const share = await this.prisma.employeeListSavedViewShare.findUnique({
      where: {
        viewId_recipientPersonId: {
          viewId,
          recipientPersonId,
        },
      },
    });
    if (!share) {
      throw new NotFoundException('Share was not found.');
    }

    await this.prisma.employeeListSavedViewShare.delete({
      where: { id: share.id },
    });
  }

  private async validateForSave(
    viewerPersonId: string,
    configuration: SavedViewConfiguration,
  ): Promise<void> {
    const catalog = await this.employeesService.getFieldCatalog(viewerPersonId);
    assertSavedViewConfiguration(configuration, catalog.fields);
    await assertDepartmentExistsForSave(
      configuration.filters.departmentId,
      (id) =>
        this.prisma.department.findUnique({
          where: { id },
          select: { id: true },
        }),
    );
    await assertCustomDefinitionsActiveForSave(
      configuration.filters.customFieldFilters,
      (id) =>
        this.prisma.customFieldDefinition.findUnique({
          where: { id },
          select: { id: true, isActive: true },
        }),
    );

    for (const columnKey of configuration.visibleColumnKeys) {
      if (columnKey.startsWith('custom:')) {
        const definitionId = columnKey.replace(/^custom:/, '');
        const definition = await this.prisma.customFieldDefinition.findUnique({
          where: { id: definitionId },
          select: { id: true, isActive: true },
        });
        if (!definition || !definition.isActive) {
          throw new BadRequestException(
            `Column '${columnKey}' references an inactive or unknown custom field.`,
          );
        }
      }
    }
  }

  private async assertUniqueName(
    creatorPersonId: string,
    name: string,
    excludeViewId?: string,
  ): Promise<void> {
    const existing = await this.prisma.employeeListSavedView.findFirst({
      where: {
        creatorPersonId,
        name,
        ...(excludeViewId ? { NOT: { id: excludeViewId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `A saved view named '${name}' already exists.`,
      );
    }
  }

  private async findOwnedViewForMutation(
    viewerPersonId: string,
    viewId: string,
  ) {
    const view = await this.prisma.employeeListSavedView.findUnique({
      where: { id: viewId },
    });
    if (!view) {
      throw new NotFoundException('Saved view was not found.');
    }
    if (view.creatorPersonId !== viewerPersonId) {
      const shared = await this.prisma.employeeListSavedViewShare.findFirst({
        where: { viewId, recipientPersonId: viewerPersonId },
      });
      if (shared) {
        throw new ForbiddenException(
          'Only the view owner may modify this saved view.',
        );
      }
      throw new NotFoundException('Saved view was not found.');
    }
    return view;
  }

  private async toResponse(
    view: {
      id: string;
      name: string;
      creatorPersonId: string;
      pageSize: number;
      configuration: unknown;
    },
    isOwner: boolean,
  ): Promise<SavedViewResponse> {
    const configuration = parseSavedViewConfiguration(view.configuration);
    const applicableFilters = await resolveApplicableFilters(
      configuration.filters,
      (id) =>
        this.prisma.department.findUnique({
          where: { id },
          select: { id: true },
        }),
      (id) =>
        this.prisma.customFieldDefinition.findUnique({
          where: { id },
          select: { id: true, isActive: true },
        }),
    );

    const resolvedColumnKeys: string[] = [];
    for (const key of configuration.visibleColumnKeys) {
      if (!key.startsWith('custom:')) {
        resolvedColumnKeys.push(key);
        continue;
      }
      const definitionId = key.replace(/^custom:/, '');
      const definition = await this.prisma.customFieldDefinition.findUnique({
        where: { id: definitionId },
        select: { isActive: true },
      });
      if (definition?.isActive) {
        resolvedColumnKeys.push(key);
      }
    }

    const applicableConfiguration: SavedViewConfiguration = {
      visibleColumnKeys:
        resolvedColumnKeys.length > 0 ? resolvedColumnKeys : ['fullName'],
      filters: applicableFilters,
    };

    return {
      id: view.id,
      name: view.name,
      creatorPersonId: view.creatorPersonId,
      isOwner,
      pageSize: view.pageSize,
      configuration,
      applicableConfiguration,
    };
  }

  private toShareResponse(share: {
    id: string;
    viewId: string;
    recipientPersonId: string;
    sharedAt: Date;
  }): SavedViewShareResponse {
    return {
      id: share.id,
      viewId: share.viewId,
      recipientPersonId: share.recipientPersonId,
      sharedAt: share.sharedAt.toISOString(),
    };
  }
}
