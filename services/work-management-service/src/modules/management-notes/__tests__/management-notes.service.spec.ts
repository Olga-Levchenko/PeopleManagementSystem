import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  NO_ACCESS_RESOLUTION,
  type AccessRoleResolution,
  type AccessRoleResolutionPort,
} from '../access-control-client';
import { ManagementNotesService } from '../management-notes.service';

const VIEWER_ID = '11111111-1111-4111-8111-111111111111';
const SUBJECT_ID = '22222222-2222-4222-8222-222222222222';
const NOTE_ID = '33333333-3333-4333-8333-333333333333';

const NOW = new Date('2026-09-05T00:00:00.000Z');

const NOTE_ROW = {
  id: NOTE_ID,
  subjectPersonId: SUBJECT_ID,
  authorPersonId: VIEWER_ID,
  content: 'Some management note content',
  visibleForEmployee: false,
  visibleForPm: false,
  createdAt: NOW,
  updatedAt: NOW,
};

/**
 * Typed wrapper around `expect.objectContaining`, matching the pattern already established in
 * `people-service`'s `outbox-publisher.service.spec.ts` -- `expect.objectContaining` itself returns
 * a matcher typed `any`, which trips `@typescript-eslint/no-unsafe-assignment` wherever it's
 * nested inside another object literal passed to `toHaveBeenCalledWith`.
 */
function objectContaining<T extends object>(value: T): T {
  const matcher: unknown = expect.objectContaining(value);
  return matcher as T;
}

function resolution(
  overrides: Partial<AccessRoleResolution>,
): AccessRoleResolution {
  return { ...NO_ACCESS_RESOLUTION, ...overrides };
}

function buildService(resolve: AccessRoleResolutionPort['resolve']) {
  const prisma = {
    managementNote: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const accessRoleResolution: AccessRoleResolutionPort = { resolve };
  const service = new ManagementNotesService(
    prisma as unknown as PrismaService,
    accessRoleResolution,
  );
  return { service, prisma };
}

describe('ManagementNotesService', () => {
  // -- AC1: create, no flags -- row persisted with DB defaults, not an app-level default. --

  it('AC1: create with no flags omits both flags from the Prisma write, leaving the DB default in effect', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ reportingLine: true }));
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.create.mockResolvedValue(NOTE_ROW);

    await service.createNote(VIEWER_ID, {
      subjectPersonId: SUBJECT_ID,
      content: 'Some management note content',
    });

    expect(prisma.managementNote.create).toHaveBeenCalledWith({
      data: {
        subjectPersonId: SUBJECT_ID,
        authorPersonId: VIEWER_ID,
        content: 'Some management note content',
      },
    });
  });

  it('authorPersonId on create is always the JWT-derived viewer id, never taken from the DTO', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ reportingLine: true }));
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.create.mockResolvedValue(NOTE_ROW);

    await service.createNote(VIEWER_ID, {
      subjectPersonId: SUBJECT_ID,
      content: 'x',
    });

    expect(prisma.managementNote.create).toHaveBeenCalledWith(
      objectContaining({
        data: objectContaining({ authorPersonId: VIEWER_ID }),
      }),
    );
  });

  // -- AC2: unflagged note absent from employee/PM views. --

  it('AC2: employee (self) view filters to visibleForEmployee:true, so an unflagged note never appears', async () => {
    const resolve = jest.fn();
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.findMany.mockResolvedValue([]);

    const result = await service.listNotes(SUBJECT_ID, SUBJECT_ID);

    expect(result).toEqual([]);
    expect(prisma.managementNote.findMany).toHaveBeenCalledWith({
      where: { subjectPersonId: SUBJECT_ID, visibleForEmployee: true },
      orderBy: { createdAt: 'desc' },
    });
    // Self is checked before ever calling the resolver.
    expect(resolve).not.toHaveBeenCalled();
  });

  it('AC2: PM-only view filters to visibleForPm:true, so an unflagged note never appears', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ projectRoles: ['ProjectManager'] }));
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.findMany.mockResolvedValue([]);

    const result = await service.listNotes(VIEWER_ID, SUBJECT_ID);

    expect(result).toEqual([]);
    expect(prisma.managementNote.findMany).toHaveBeenCalledWith({
      where: { subjectPersonId: SUBJECT_ID, visibleForPm: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  // -- Cross-audience isolation: each flag scopes visibility to only its own audience, not to
  // "any flag set at all". The AC2 cases above only cover both-flags-false; these prove a note
  // flagged for ONE audience is still invisible to the OTHER audience, by simulating Prisma's own
  // `where`-clause filtering against seeded rows rather than just asserting the query shape. --

  function fakeFindManyFilteringBy(notes: Array<typeof NOTE_ROW>) {
    return jest.fn(
      ({
        where,
      }: {
        where: Partial<
          Pick<
            typeof NOTE_ROW,
            'subjectPersonId' | 'visibleForEmployee' | 'visibleForPm'
          >
        >;
      }) =>
        Promise.resolve(
          notes.filter((note) =>
            (Object.keys(where) as Array<keyof typeof where>).every(
              (key) => note[key] === where[key],
            ),
          ),
        ),
    );
  }

  it('cross-audience isolation: a note flagged visibleForEmployee-only is invisible to a PM-only viewer', async () => {
    const employeeOnlyNote = {
      ...NOTE_ROW,
      visibleForEmployee: true,
      visibleForPm: false,
    };
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ projectRoles: ['ProjectManager'] }));
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.findMany = fakeFindManyFilteringBy([
      employeeOnlyNote,
    ]);

    const result = await service.listNotes(VIEWER_ID, SUBJECT_ID);

    expect(result).toEqual([]);
  });

  it('cross-audience isolation: a note flagged visibleForPm-only is invisible to the employee (self) view', async () => {
    const pmOnlyNote = {
      ...NOTE_ROW,
      visibleForEmployee: false,
      visibleForPm: true,
    };
    const resolve = jest.fn();
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.findMany = fakeFindManyFilteringBy([pmOnlyNote]);

    const result = await service.listNotes(SUBJECT_ID, SUBJECT_ID);

    expect(result).toEqual([]);
  });

  // -- AC3: UM/DM/PP full RW regardless of flags. --

  it.each([
    ['reportingLine', resolution({ reportingLine: true })],
    ['peoplePartnerLine', resolution({ peoplePartnerLine: true })],
    ['fullProfileAccessLine', resolution({ fullProfileAccessLine: true })],
    ['DM projectRole', resolution({ projectRoles: ['DeliveryManager'] })],
  ] as const)(
    'AC3: %s grants full RW -- list returns every note regardless of flags',
    async (_label, resolvedRole) => {
      const resolve = jest.fn().mockResolvedValue(resolvedRole);
      const { service, prisma } = buildService(resolve);
      prisma.managementNote.findMany.mockResolvedValue([NOTE_ROW]);

      const result = await service.listNotes(VIEWER_ID, SUBJECT_ID);

      expect(result).toEqual([NOTE_ROW]);
      expect(prisma.managementNote.findMany).toHaveBeenCalledWith({
        where: { subjectPersonId: SUBJECT_ID },
        orderBy: { createdAt: 'desc' },
      });
    },
  );

  it('AC3: full RW can create a note', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ reportingLine: true }));
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.create.mockResolvedValue(NOTE_ROW);

    const result = await service.createNote(VIEWER_ID, {
      subjectPersonId: SUBJECT_ID,
      content: 'x',
    });

    expect(result).toEqual(NOTE_ROW);
  });

  it('AC3: full RW can update a note regardless of current flag state', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ peoplePartnerLine: true }));
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.findUnique.mockResolvedValue(NOTE_ROW);
    prisma.managementNote.update.mockResolvedValue({
      ...NOTE_ROW,
      content: 'updated',
    });

    const result = await service.updateNote(VIEWER_ID, NOTE_ID, {
      content: 'updated',
    });

    expect(result.content).toBe('updated');
  });

  // -- AC4: PM narrowed -- read-only, visibleForPm-only; create/update forbidden. --

  it('AC4: PM-only viewer gets only visibleForPm notes on list', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ projectRoles: ['ProjectManager'] }));
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.findMany.mockResolvedValue([
      { ...NOTE_ROW, visibleForPm: true },
    ]);

    await service.listNotes(VIEWER_ID, SUBJECT_ID);

    expect(prisma.managementNote.findMany).toHaveBeenCalledWith({
      where: { subjectPersonId: SUBJECT_ID, visibleForPm: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('AC4: PM-only viewer create -> 403', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ projectRoles: ['ProjectManager'] }));
    const { service, prisma } = buildService(resolve);

    await expect(
      service.createNote(VIEWER_ID, {
        subjectPersonId: SUBJECT_ID,
        content: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.managementNote.create).not.toHaveBeenCalled();
  });

  it('AC4: PM-only viewer update -> 403', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ projectRoles: ['ProjectManager'] }));
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.findUnique.mockResolvedValue(NOTE_ROW);

    await expect(
      service.updateNote(VIEWER_ID, NOTE_ID, { content: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.managementNote.update).not.toHaveBeenCalled();
  });

  // -- AC5: multi-path -- any one full-RW-qualifying path wins even when a narrower path
  // (ProjectManager) also applies simultaneously. --

  it('AC5: viewer holding both DeliveryManager and ProjectManager project roles gets full RW (DM path wins)', async () => {
    const resolve = jest.fn().mockResolvedValue(
      resolution({
        projectRoles: ['ProjectManager', 'DeliveryManager'],
      }),
    );
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.findMany.mockResolvedValue([NOTE_ROW]);

    await service.listNotes(VIEWER_ID, SUBJECT_ID);

    expect(prisma.managementNote.findMany).toHaveBeenCalledWith({
      where: { subjectPersonId: SUBJECT_ID },
      orderBy: { createdAt: 'desc' },
    });
  });

  // -- AC6: flag flip -- only the targeted field changes, nothing else. --

  it('AC6: flipping visibleForEmployee changes no other field', async () => {
    const resolve = jest
      .fn()
      .mockResolvedValue(resolution({ reportingLine: true }));
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.findUnique.mockResolvedValue(NOTE_ROW);
    prisma.managementNote.update.mockResolvedValue({
      ...NOTE_ROW,
      visibleForEmployee: true,
    });

    await service.updateNote(VIEWER_ID, NOTE_ID, { visibleForEmployee: true });

    expect(prisma.managementNote.update).toHaveBeenCalledWith({
      where: { id: NOTE_ID },
      data: { visibleForEmployee: true },
    });
  });

  // -- Colleague / no relationship -- 403 on every route. --

  it('colleague (no qualifying line) gets 403 on list', async () => {
    const resolve = jest.fn().mockResolvedValue(NO_ACCESS_RESOLUTION);
    const { service } = buildService(resolve);

    await expect(
      service.listNotes(VIEWER_ID, SUBJECT_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('colleague (no qualifying line) gets 403 on create', async () => {
    const resolve = jest.fn().mockResolvedValue(NO_ACCESS_RESOLUTION);
    const { service, prisma } = buildService(resolve);

    await expect(
      service.createNote(VIEWER_ID, {
        subjectPersonId: SUBJECT_ID,
        content: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.managementNote.create).not.toHaveBeenCalled();
  });

  it('colleague (no qualifying line) gets 403 on update, never revealing note content', async () => {
    const resolve = jest.fn().mockResolvedValue(NO_ACCESS_RESOLUTION);
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.findUnique.mockResolvedValue(NOTE_ROW);

    await expect(
      service.updateNote(VIEWER_ID, NOTE_ID, { content: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.managementNote.update).not.toHaveBeenCalled();
  });

  // -- Self is read-only -- a self viewer must never reach the full-RW branch on a write. The
  // AC2 self case above only proves the read-side filter; these prove the write side of the same
  // invariant, so a future change collapsing 'self' into 'full' would fail a test on both sides. --

  it('self viewer gets 403 on create, never reaching the resolver', async () => {
    const resolve = jest.fn();
    const { service, prisma } = buildService(resolve);

    await expect(
      service.createNote(SUBJECT_ID, {
        subjectPersonId: SUBJECT_ID,
        content: 'x',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.managementNote.create).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('self viewer gets 403 on update, never reaching the resolver', async () => {
    const resolve = jest.fn();
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.findUnique.mockResolvedValue(NOTE_ROW);

    await expect(
      service.updateNote(SUBJECT_ID, NOTE_ID, { content: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.managementNote.update).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('update against a nonexistent note 404s (no subject to resolve access against)', async () => {
    const resolve = jest.fn();
    const { service, prisma } = buildService(resolve);
    prisma.managementNote.findUnique.mockResolvedValue(null);

    await expect(
      service.updateNote(VIEWER_ID, NOTE_ID, { content: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(resolve).not.toHaveBeenCalled();
  });
});
