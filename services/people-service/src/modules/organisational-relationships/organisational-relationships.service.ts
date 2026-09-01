import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RELATIONSHIP_EVENT_SCHEMA_VERSION,
  type AccessEffect,
  type RelationshipChangedEvent,
  type RelationshipType,
} from '@pms/contracts';
import {
  RELATIONSHIP_PERMISSION,
  type ProjectionUpdatePort,
  type RelationshipPermissionPort,
} from './organisational-relationships.ports';

@Injectable()
export class OrganisationalRelationshipsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('RelationshipPermissionPort')
    private readonly permission: RelationshipPermissionPort,
    @Inject('ProjectionUpdatePort')
    private readonly projection: ProjectionUpdatePort,
  ) {}

  changeManager(actorId: string, personId: string, managerId?: string) {
    return this.changePersonRelationship(
      actorId,
      personId,
      'reports_to',
      managerId,
    );
  }

  changePeoplePartner(
    actorId: string,
    personId: string,
    peoplePartnerId?: string,
  ) {
    return this.changePersonRelationship(
      actorId,
      personId,
      'pp_assignment',
      peoplePartnerId,
    );
  }

  changeDepartment(
    actorId: string,
    personId: string,
    departmentId: string | null,
  ) {
    return this.changePersonRelationship(
      actorId,
      personId,
      'department_membership',
      departmentId,
    );
  }

  async changeDepartmentManager(
    actorId: string,
    departmentId: string,
    managerId?: string,
  ) {
    await this.assertPermission(actorId, departmentId, 'department_manager');

    const result = await this.prisma.$transaction(async (tx) => {
      const department = await tx.department.findUnique({
        where: { id: departmentId },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }

      if (managerId) {
        await this.assertPersonExists(tx, managerId);
        if (managerId === actorId && department.managerId !== actorId) {
          throw new UnprocessableEntityException(
            'An actor cannot assign themselves as manager of a department they do not already manage',
          );
        }
      }

      if (department.managerId === managerId) {
        return null;
      }

      const aggregateVersion = department.relationshipVersion + 1;
      await tx.department.update({
        where: { id: departmentId },
        data: {
          managerId: managerId ?? null,
          relationshipVersion: aggregateVersion,
        },
      });

      const event = this.createEvent(
        'department',
        departmentId,
        aggregateVersion,
        'department_manager',
        departmentId,
        department.managerId,
        managerId ?? null,
      );
      await this.persistChange(tx, event, actorId);
      return event;
    });

    return this.finish(result);
  }

  private async changePersonRelationship(
    actorId: string,
    personId: string,
    relationshipType: Extract<
      RelationshipType,
      'reports_to' | 'pp_assignment' | 'department_membership'
    >,
    relatedId?: string | null,
  ) {
    const normalizedRelatedId = relatedId ?? null;
    await this.assertPermission(actorId, personId, relationshipType);

    const result = await this.prisma.$transaction(async (tx) => {
      const person = await tx.person.findUnique({ where: { id: personId } });
      if (!person) {
        throw new NotFoundException('Person not found');
      }

      if (
        relationshipType === 'reports_to' ||
        relationshipType === 'pp_assignment'
      ) {
        if (normalizedRelatedId) {
          await this.assertPersonExists(tx, normalizedRelatedId);
          if (normalizedRelatedId === actorId) {
            throw new UnprocessableEntityException(
              'An actor cannot assign themselves as manager or People Partner',
            );
          }
        }
      } else if (normalizedRelatedId) {
        await this.assertDepartmentExists(tx, normalizedRelatedId);
        if (personId === actorId) {
          const department = await tx.department.findUnique({
            where: { id: normalizedRelatedId },
          });
          if (department?.managerId !== actorId) {
            throw new UnprocessableEntityException(
              'An actor cannot assign themselves to a department they do not manage',
            );
          }
        }
      }

      const beforeId =
        relationshipType === 'reports_to'
          ? person.managerId
          : relationshipType === 'pp_assignment'
            ? person.peoplePartnerId
            : person.departmentId;
      if (beforeId === normalizedRelatedId) {
        return null;
      }

      const aggregateVersion = person.relationshipVersion + 1;
      await tx.person.update({
        where: { id: personId },
        data: {
          relationshipVersion: aggregateVersion,
          ...(relationshipType === 'reports_to' && {
            managerId: normalizedRelatedId,
          }),
          ...(relationshipType === 'pp_assignment' && {
            peoplePartnerId: normalizedRelatedId,
          }),
          ...(relationshipType === 'department_membership' && {
            departmentId: normalizedRelatedId,
          }),
        },
      });

      const event = this.createEvent(
        'person',
        personId,
        aggregateVersion,
        relationshipType,
        personId,
        beforeId,
        normalizedRelatedId,
      );
      await this.persistChange(tx, event, actorId);
      return event;
    });

    return this.finish(result);
  }

  private async assertPermission(
    actorId: string,
    subjectId: string,
    relationshipType: string,
  ) {
    const allowed = await this.permission.canChange(
      actorId,
      subjectId,
      relationshipType,
    );
    if (!allowed) {
      throw new ForbiddenException(
        `Missing permission: ${RELATIONSHIP_PERMISSION}`,
      );
    }
  }

  private async assertPersonExists(
    tx: Prisma.TransactionClient,
    personId: string,
  ) {
    if (
      !(await tx.person.findUnique({
        where: { id: personId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('Person not found');
    }
  }

  private async assertDepartmentExists(
    tx: Prisma.TransactionClient,
    departmentId: string,
  ) {
    if (
      !(await tx.department.findUnique({
        where: { id: departmentId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('Department not found');
    }
  }

  private async persistChange(
    tx: Prisma.TransactionClient,
    event: RelationshipChangedEvent,
    actorId: string,
  ) {
    await tx.relationshipJournalEntry.create({
      data: {
        relationship: event.relationship.type.toUpperCase() as never,
        actorId,
        subjectId: event.relationship.subjectId,
        beforeId: event.relationship.beforeId,
        afterId: event.relationship.afterId,
        occurredAtUtc: new Date(event.occurredAtUtc),
      },
    });
    await tx.outboxEvent.create({
      data: {
        eventId: event.eventId,
        aggregateType: event.source.aggregateType.toUpperCase() as never,
        aggregateId: event.source.aggregateId,
        aggregateVersion: event.source.aggregateVersion,
        payload: event as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private createEvent(
    aggregateType: 'person' | 'department',
    aggregateId: string,
    aggregateVersion: number,
    relationshipType: RelationshipType,
    subjectId: string,
    beforeId: string | null,
    afterId: string | null,
  ): RelationshipChangedEvent {
    const accessEffect: AccessEffect =
      beforeId && afterId
        ? 'both'
        : afterId
          ? 'grant'
          : beforeId
            ? 'revoke'
            : 'none';
    return {
      eventId: crypto.randomUUID(),
      schemaVersion: RELATIONSHIP_EVENT_SCHEMA_VERSION,
      occurredAtUtc: new Date().toISOString(),
      source: {
        service: 'people-service',
        aggregateType,
        aggregateId,
        aggregateVersion,
      },
      relationship: { type: relationshipType, subjectId, beforeId, afterId },
      accessEffect,
    };
  }

  private async finish(event: RelationshipChangedEvent | null) {
    if (!event) {
      return;
    }

    try {
      await this.projection.update(event);
      await this.prisma.relationshipProjectionFreshness.upsert({
        where: { subjectId: event.relationship.subjectId },
        create: {
          subjectId: event.relationship.subjectId,
          status: 'CONFIRMED',
          lastConfirmedAtUtc: new Date(),
        },
        update: {
          status: 'CONFIRMED',
          reason: null,
          lastConfirmedAtUtc: new Date(),
        },
      });
    } catch (error) {
      await this.prisma.relationshipProjectionFreshness.upsert({
        where: { subjectId: event.relationship.subjectId },
        create: {
          subjectId: event.relationship.subjectId,
          status: 'UNCERTAIN',
          reason: 'Synchronous Access Control projection update failed',
          detectedAtUtc: new Date(),
        },
        update: {
          status: 'UNCERTAIN',
          reason: 'Synchronous Access Control projection update failed',
          detectedAtUtc: new Date(),
        },
      });
      throw error;
    }

    return event;
  }
}
