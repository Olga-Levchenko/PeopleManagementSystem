import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { HrAdminPermissionPort } from './custom-field-definitions.ports';
import type {
  CreateCustomFieldDefinitionDto,
  UpdateCustomFieldDefinitionDto,
} from './custom-field-definitions.dto';

@Injectable()
export class CustomFieldDefinitionsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('HrAdminPermissionPort')
    private readonly permission: HrAdminPermissionPort,
  ) {}

  async listAll() {
    return this.prisma.customFieldDefinition.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async create(actorId: string, dto: CreateCustomFieldDefinitionDto) {
    await this.assertWritePermission(actorId);
    await this.assertNameAvailable(dto.name);

    return this.prisma.customFieldDefinition.create({
      data: {
        name: dto.name.trim(),
        dataType: dto.dataType,
        visibility: dto.visibility,
        isActive: true,
      },
    });
  }

  async update(
    actorId: string,
    id: string,
    dto: UpdateCustomFieldDefinitionDto,
  ) {
    await this.assertWritePermission(actorId);
    await this.assertExists(id);

    if (dto.name !== undefined) {
      await this.assertNameAvailable(dto.name, id);
    }

    return this.prisma.customFieldDefinition.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.visibility !== undefined && { visibility: dto.visibility }),
      },
    });
  }

  async deactivate(actorId: string, id: string) {
    await this.assertWritePermission(actorId);
    await this.assertExists(id);

    // Idempotent: already-inactive definitions return 200 with the current state.
    return this.prisma.customFieldDefinition.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async assertWritePermission(actorId: string): Promise<void> {
    const allowed = await this.permission.canWrite(actorId);
    if (!allowed) {
      throw new ForbiddenException('HR Admin permission is required');
    }
  }

  private async assertExists(id: string): Promise<void> {
    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Custom field definition not found');
    }
  }

  /**
   * Enforces case-insensitive uniqueness of `name` across active definitions.
   * `excludeId` is supplied on update so a definition can be renamed to its own
   * current name (no-op) without a spurious 409.
   */
  private async assertNameAvailable(
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const normalizedName = name.trim().toLowerCase();
    const conflict = await this.prisma.customFieldDefinition.findFirst({
      where: {
        name: { equals: normalizedName, mode: 'insensitive' },
        isActive: true,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });

    if (conflict) {
      throw new ConflictException(
        'A custom field with this name already exists.',
      );
    }
  }
}

/**
 * Guard called before any PATCH that carries a `dataType` field.
 * This is a standalone export so the controller can call it before invoking the service,
 * keeping the rejection as close to the boundary as possible.
 */
export function assertDataTypeNotPresent(body: Record<string, unknown>): void {
  if ('dataType' in body) {
    throw new BadRequestException('dataType cannot be changed after creation.');
  }
}
