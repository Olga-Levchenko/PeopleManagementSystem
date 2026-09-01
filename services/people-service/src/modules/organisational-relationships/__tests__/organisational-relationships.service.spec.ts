import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { OrganisationalRelationshipsService } from '../organisational-relationships.service';
import type {
  ProjectionUpdatePort,
  RelationshipPermissionPort,
} from '../organisational-relationships.ports';

type TransactionCallback = (
  callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
) => Promise<unknown>;

type JestMock = jest.MockedFunction<(...args: never[]) => unknown>;

const getMock = (target: object, property: string): JestMock =>
  (target as Record<string, unknown>)[property] as JestMock;

const objectContaining = <T extends object>(value: T): T => {
  const matcher: unknown = expect.objectContaining(value);
  return matcher as T;
};

describe('OrganisationalRelationshipsService', () => {
  const createService = (
    transaction: TransactionCallback,
    permission: RelationshipPermissionPort = {
      canChange: jest.fn().mockResolvedValue(true),
    },
    projection: ProjectionUpdatePort = {
      update: jest.fn().mockResolvedValue(undefined),
    },
  ) => {
    const prisma = {
      $transaction: jest.fn(transaction),
      relationshipProjectionFreshness: {
        upsert: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as PrismaService;

    return new OrganisationalRelationshipsService(
      prisma,
      permission,
      projection,
    );
  };

  const createPersonTransaction = (
    person: Record<string, unknown>,
    relatedPersonIds: string[] = [],
    departmentIds: string[] = [],
  ) => {
    const personFindUnique = jest
      .fn()
      .mockResolvedValueOnce(person)
      .mockImplementation(({ where }: { where: { id: string } }) =>
        relatedPersonIds.includes(where.id) ? { id: where.id } : null,
      );
    const departmentFindUnique = jest
      .fn()
      .mockImplementation(({ where }: { where: { id: string } }) =>
        departmentIds.includes(where.id) ? { id: where.id } : null,
      );

    return {
      person: {
        findUnique: personFindUnique,
        update: jest.fn().mockResolvedValue(person),
      },
      department: {
        findUnique: departmentFindUnique,
        update: jest.fn().mockResolvedValue(undefined),
      },
      relationshipJournalEntry: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      outboxEvent: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    } as unknown as Prisma.TransactionClient;
  };

  const createDepartmentTransaction = (
    department: Record<string, unknown>,
    personIds: string[] = [],
  ) =>
    ({
      department: {
        findUnique: jest.fn().mockResolvedValue(department),
        update: jest.fn().mockResolvedValue(department),
      },
      person: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: { where: { id: string } }) =>
            personIds.includes(where.id) ? { id: where.id } : null,
          ),
      },
      relationshipJournalEntry: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      outboxEvent: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    }) as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['manager', 'changeManager', 'managerId', 'reports_to'],
    [
      'People Partner',
      'changePeoplePartner',
      'peoplePartnerId',
      'pp_assignment',
    ],
  ] as const)(
    'persists a %s change with journal and outbox contents',
    async (_label, method, field, relationshipType) => {
      const actorId = '11111111-1111-4111-8111-111111111111';
      const personId = '22222222-2222-4222-8222-222222222222';
      const relatedId = '33333333-3333-4333-8333-333333333333';
      const tx = createPersonTransaction(
        { id: personId, [field]: null, relationshipVersion: 4 },
        [relatedId],
      );
      const service = createService(async (callback) => callback(tx));

      await service[method](actorId, personId, relatedId);

      expect(getMock(tx.person, 'update')).toHaveBeenCalledWith({
        where: { id: personId },
        data: {
          relationshipVersion: 5,
          [field]: relatedId,
        },
      });
      expect(
        getMock(tx.relationshipJournalEntry, 'create'),
      ).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({
            relationship: relationshipType.toUpperCase(),
            actorId,
            subjectId: personId,
            beforeId: null,
            afterId: relatedId,
          }),
        }),
      );
      expect(getMock(tx.outboxEvent, 'create')).toHaveBeenCalledWith(
        objectContaining({
          data: objectContaining({
            aggregateType: 'PERSON',
            aggregateId: personId,
            aggregateVersion: 5,
            payload: objectContaining({
              source: objectContaining({
                aggregateType: 'person',
                aggregateId: personId,
                aggregateVersion: 5,
              }),
              relationship: {
                type: relationshipType,
                subjectId: personId,
                beforeId: null,
                afterId: relatedId,
              },
              accessEffect: 'grant',
            }),
          }),
        }),
      );
    },
  );

  it('persists a department-manager change with before and after values', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const departmentId = '22222222-2222-4222-8222-222222222222';
    const beforeId = '33333333-3333-4333-8333-333333333333';
    const afterId = '44444444-4444-4444-8444-444444444444';
    const tx = createDepartmentTransaction(
      { id: departmentId, managerId: beforeId, relationshipVersion: 7 },
      [afterId],
    );
    const service = createService(async (callback) => callback(tx));

    await service.changeDepartmentManager(actorId, departmentId, afterId);

    expect(getMock(tx.department, 'update')).toHaveBeenCalledWith({
      where: { id: departmentId },
      data: { managerId: afterId, relationshipVersion: 8 },
    });
    expect(getMock(tx.relationshipJournalEntry, 'create')).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          relationship: 'DEPARTMENT_MANAGER',
          actorId,
          subjectId: departmentId,
          beforeId,
          afterId,
        }),
      }),
    );
    expect(getMock(tx.outboxEvent, 'create')).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          aggregateType: 'DEPARTMENT',
          aggregateId: departmentId,
          aggregateVersion: 8,
          payload: objectContaining({
            source: objectContaining({
              aggregateType: 'department',
              aggregateId: departmentId,
              aggregateVersion: 8,
            }),
            relationship: {
              type: 'department_manager',
              subjectId: departmentId,
              beforeId,
              afterId,
            },
            accessEffect: 'both',
          }),
        }),
      }),
    );
  });

  it('persists a department membership change', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const personId = '22222222-2222-4222-8222-222222222222';
    const departmentId = '33333333-3333-4333-8333-333333333333';
    const tx = createPersonTransaction(
      { id: personId, departmentId: null, relationshipVersion: 2 },
      [],
      [departmentId],
    );
    const service = createService(async (callback) => callback(tx));

    await service.changeDepartment(actorId, personId, departmentId);

    expect(getMock(tx.person, 'update')).toHaveBeenCalledWith({
      where: { id: personId },
      data: { departmentId, relationshipVersion: 3 },
    });
    expect(getMock(tx.relationshipJournalEntry, 'create')).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          relationship: 'DEPARTMENT_MEMBERSHIP',
          subjectId: personId,
          beforeId: null,
          afterId: departmentId,
        }),
      }),
    );
  });

  it('revokes department membership without requiring department management', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const personId = '22222222-2222-4222-8222-222222222222';
    const beforeId = '33333333-3333-4333-8333-333333333333';
    const tx = createPersonTransaction({
      id: personId,
      departmentId: beforeId,
      relationshipVersion: 5,
    });
    const service = createService(async (callback) => callback(tx));

    await service.changeDepartment(actorId, personId, null);

    expect(getMock(tx.department, 'findUnique')).not.toHaveBeenCalled();
    expect(getMock(tx.person, 'update')).toHaveBeenCalledWith({
      where: { id: personId },
      data: { departmentId: null, relationshipVersion: 6 },
    });
    expect(getMock(tx.relationshipJournalEntry, 'create')).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          relationship: 'DEPARTMENT_MEMBERSHIP',
          subjectId: personId,
          beforeId,
          afterId: null,
        }),
      }),
    );
    expect(getMock(tx.outboxEvent, 'create')).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({
          aggregateType: 'PERSON',
          aggregateId: personId,
          aggregateVersion: 6,
          payload: objectContaining({
            relationship: objectContaining({
              type: 'department_membership',
              beforeId,
              afterId: null,
            }),
            accessEffect: 'revoke',
          }),
        }),
      }),
    );
  });

  it('does not write journal or outbox for an unchanged null department membership', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const personId = '22222222-2222-4222-8222-222222222222';
    const tx = createPersonTransaction({
      id: personId,
      departmentId: null,
      relationshipVersion: 5,
    });
    const service = createService(async (callback) => callback(tx));

    await service.changeDepartment(actorId, personId, null);

    expect(getMock(tx.person, 'update')).not.toHaveBeenCalled();
    expect(
      getMock(tx.relationshipJournalEntry, 'create'),
    ).not.toHaveBeenCalled();
    expect(getMock(tx.outboxEvent, 'create')).not.toHaveBeenCalled();
  });

  it.each([
    ['manager', 'changeManager'],
    ['People Partner', 'changePeoplePartner'],
  ] as const)('rejects self-assignment as %s', async (_label, method) => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const tx = createPersonTransaction(
      { id: actorId, managerId: null, peoplePartnerId: null },
      [actorId],
    );
    const service = createService(async (callback) => callback(tx));

    await expect(
      service[method](actorId, actorId, actorId),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(getMock(tx.person, 'update')).not.toHaveBeenCalled();
  });

  it('rejects assigning the actor to a department they do not manage', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const departmentId = '22222222-2222-4222-8222-222222222222';
    const tx = createPersonTransaction(
      { id: actorId, departmentId: null, relationshipVersion: 0 },
      [],
      [departmentId],
    );
    tx.department.findUnique = jest
      .fn()
      .mockResolvedValue({ id: departmentId, managerId: null });
    const service = createService(async (callback) => callback(tx));

    await expect(
      service.changeDepartment(actorId, actorId, departmentId),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(getMock(tx.person, 'update')).not.toHaveBeenCalled();
  });

  it('rejects assigning the actor as department manager when not already entitled', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const departmentId = '22222222-2222-4222-8222-222222222222';
    const tx = createDepartmentTransaction(
      { id: departmentId, managerId: null },
      [actorId],
    );
    const service = createService(async (callback) => callback(tx));

    await expect(
      service.changeDepartmentManager(actorId, departmentId, actorId),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(getMock(tx.department, 'update')).not.toHaveBeenCalled();
  });

  it('allows an idempotent department-manager change without journal or outbox writes', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const departmentId = '22222222-2222-4222-8222-222222222222';
    const tx = createDepartmentTransaction(
      { id: departmentId, managerId: actorId, relationshipVersion: 3 },
      [actorId],
    );
    const service = createService(async (callback) => callback(tx));

    await service.changeDepartmentManager(actorId, departmentId, actorId);

    expect(getMock(tx.department, 'update')).not.toHaveBeenCalled();
    expect(
      getMock(tx.relationshipJournalEntry, 'create'),
    ).not.toHaveBeenCalled();
    expect(getMock(tx.outboxEvent, 'create')).not.toHaveBeenCalled();
  });

  it('rejects missing person and related targets without writes', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const personId = '22222222-2222-4222-8222-222222222222';
    const relatedId = '33333333-3333-4333-8333-333333333333';
    const tx = createPersonTransaction({ id: personId, managerId: null }, []);
    const service = createService(async (callback) => callback(tx));

    await expect(
      service.changeManager(actorId, personId, relatedId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(getMock(tx.person, 'update')).not.toHaveBeenCalled();

    const missingPersonTx = createPersonTransaction(
      null as unknown as Record<string, unknown>,
    );
    const missingPersonService = createService(async (callback) =>
      callback(missingPersonTx),
    );
    await expect(
      missingPersonService.changeManager(actorId, personId, relatedId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a missing department target without writes', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const personId = '22222222-2222-4222-8222-222222222222';
    const departmentId = '33333333-3333-4333-8333-333333333333';
    const tx = createPersonTransaction(
      { id: personId, departmentId: null },
      [],
      [],
    );
    const service = createService(async (callback) => callback(tx));

    await expect(
      service.changeDepartment(actorId, personId, departmentId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(getMock(tx.person, 'update')).not.toHaveBeenCalled();
  });

  it('does not write journal or outbox for an idempotent person relationship change', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const personId = '22222222-2222-4222-8222-222222222222';
    const managerId = '33333333-3333-4333-8333-333333333333';
    const tx = createPersonTransaction(
      { id: personId, managerId, relationshipVersion: 4 },
      [managerId],
    );
    const service = createService(async (callback) => callback(tx));

    await service.changeManager(actorId, personId, managerId);

    expect(getMock(tx.person, 'update')).not.toHaveBeenCalled();
    expect(
      getMock(tx.relationshipJournalEntry, 'create'),
    ).not.toHaveBeenCalled();
    expect(getMock(tx.outboxEvent, 'create')).not.toHaveBeenCalled();
  });

  it('propagates journal failure so the transaction can roll back', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const personId = '22222222-2222-4222-8222-222222222222';
    const managerId = '33333333-3333-4333-8333-333333333333';
    const tx = createPersonTransaction(
      { id: personId, managerId: null, relationshipVersion: 0 },
      [managerId],
    );
    tx.relationshipJournalEntry.create = jest
      .fn()
      .mockRejectedValue(new Error('journal failed'));
    const transaction = jest.fn(
      async (
        callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
      ) => callback(tx),
    );
    const service = createService(transaction);

    await expect(
      service.changeManager(actorId, personId, managerId),
    ).rejects.toThrow('journal failed');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(getMock(tx.person, 'update')).toHaveBeenCalled();
    expect(getMock(tx.outboxEvent, 'create')).not.toHaveBeenCalled();
  });

  it('propagates outbox failure so the transaction can roll back', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const personId = '22222222-2222-4222-8222-222222222222';
    const managerId = '33333333-3333-4333-8333-333333333333';
    const tx = createPersonTransaction(
      { id: personId, managerId: null, relationshipVersion: 0 },
      [managerId],
    );
    tx.outboxEvent.create = jest
      .fn()
      .mockRejectedValue(new Error('outbox failed'));
    const transaction = jest.fn(
      async (
        callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
      ) => callback(tx),
    );
    const service = createService(transaction);

    await expect(
      service.changeManager(actorId, personId, managerId),
    ).rejects.toThrow('outbox failed');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(getMock(tx.person, 'update')).toHaveBeenCalled();
    expect(getMock(tx.relationshipJournalEntry, 'create')).toHaveBeenCalled();
  });

  it('propagates duplicate aggregate-version rejection from the outbox constraint', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const personId = '22222222-2222-4222-8222-222222222222';
    const managerId = '33333333-3333-4333-8333-333333333333';
    const duplicateError = Object.assign(
      new Error('duplicate outbox aggregate version'),
      {
        code: 'P2002',
      },
    );
    const tx = createPersonTransaction(
      { id: personId, managerId: null, relationshipVersion: 0 },
      [managerId],
    );
    tx.outboxEvent.create = jest.fn().mockRejectedValue(duplicateError);
    const transaction = jest.fn(
      async (
        callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
      ) => callback(tx),
    );
    const service = createService(transaction);

    await expect(
      service.changeManager(actorId, personId, managerId),
    ).rejects.toMatchObject({
      code: 'P2002',
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('records uncertain freshness and returns the projection failure', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111';
    const personId = '22222222-2222-4222-8222-222222222222';
    const managerId = '33333333-3333-4333-8333-333333333333';
    const projection: ProjectionUpdatePort = {
      update: jest
        .fn()
        .mockRejectedValue(
          new ServiceUnavailableException('projection unavailable'),
        ),
    };
    const freshness = { upsert: jest.fn().mockResolvedValue(undefined) };
    const tx = createPersonTransaction(
      { id: personId, managerId: null, relationshipVersion: 0 },
      [managerId],
    );
    const prisma = {
      $transaction: jest.fn(
        async (
          callback: (transaction: Prisma.TransactionClient) => Promise<unknown>,
        ) => callback(tx),
      ),
      relationshipProjectionFreshness: freshness,
    } as unknown as PrismaService;
    const service = new OrganisationalRelationshipsService(
      prisma,
      { canChange: jest.fn().mockResolvedValue(true) },
      projection,
    );

    await expect(
      service.changeManager(actorId, personId, managerId),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(freshness.upsert).toHaveBeenCalledWith(
      objectContaining({
        where: { subjectId: personId },
        create: objectContaining({
          subjectId: personId,
          status: 'UNCERTAIN',
        }),
        update: objectContaining({
          status: 'UNCERTAIN',
        }),
      }),
    );
  });

  it('rejects a caller without the relationship-change permission before opening a transaction', async () => {
    const deniedPermission: RelationshipPermissionPort = {
      canChange: jest.fn().mockResolvedValue(false),
    };
    const transaction = jest.fn();
    const prisma = {
      $transaction: transaction,
    } as unknown as PrismaService;
    const service = new OrganisationalRelationshipsService(
      prisma,
      deniedPermission,
      { update: jest.fn().mockResolvedValue(undefined) },
    );

    await expect(
      service.changeDepartment(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(transaction).not.toHaveBeenCalled();
  });
});
