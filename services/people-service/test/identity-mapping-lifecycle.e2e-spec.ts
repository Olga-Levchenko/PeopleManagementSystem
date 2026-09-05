import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ConfigService } from '@nestjs/config';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { IdentityFingerprintService } from '../src/modules/identity-mappings/identity-fingerprint.service';
import { IdentityMappingService } from '../src/modules/identity-mappings/identity-mapping.service';
import { IdentityValidationService } from '../src/modules/identity-mappings/identity-validation.service';
import type {
  IIdentityLinkProvisioningAuthorizer,
  IdentityLinkProvisioningActor,
} from '../src/modules/identity-mappings/identity-provisioning.ports';
import type {
  LinkIdentityRequest,
  RelinkIdentityRequest,
  RevokeIdentityRequest,
} from '../src/modules/identity-mappings/identity-mapping.types';
import { PrismaService } from '../src/prisma/prisma.service';

const execFileAsync = promisify(execFile);
const SERVICE_ROOT = process.cwd();
const ISSUER = 'https://id.example.test/realms/people-management';
const CURRENT_KEY = Buffer.from('fabricated-current-lifecycle-key').toString(
  'base64',
);
const OLD_KEY = Buffer.from('fabricated-old-lifecycle-key').toString('base64');

describe('Identity mapping lifecycle', () => {
  jest.setTimeout(180_000);

  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;
  let service: IdentityMappingService;
  let authorizer: jest.Mocked<IIdentityLinkProvisioningAuthorizer>;
  let databaseUrl: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('people_identity_lifecycle_test')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();
    databaseUrl = container.getConnectionUri();

    await execFileAsync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        cwd: SERVICE_ROOT,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        shell: false,
      },
    );

    prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: databaseUrl }),
    );
    await prisma.$connect();
    authorizer = {
      authorize: jest.fn().mockResolvedValue({
        actorType: 'test-service',
        actorIdentifier: 'fabricated-actor',
      } satisfies IdentityLinkProvisioningActor),
    };
    service = createService(databaseUrl, authorizer);
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  }, 120_000);

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP SCHEMA public CASCADE; CREATE SCHEMA public;',
    );
    await execFileAsync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        cwd: SERVICE_ROOT,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        shell: false,
      },
    );
    authorizer.authorize.mockResolvedValue({
      actorType: 'test-service',
      actorIdentifier: 'fabricated-actor',
    });
    service = createService(
      container.getConnectionUri(),
      authorizer,
      `v2=${CURRENT_KEY};v1=${OLD_KEY}`,
    );
  });

  function createService(
    databaseUrl: string,
    provisioningAuthorizer: IIdentityLinkProvisioningAuthorizer,
    keyConfiguration = `v1=${CURRENT_KEY}`,
  ) {
    return new IdentityMappingService(
      prisma,
      new IdentityValidationService(
        new ConfigService({
          NODE_ENV: 'test',
          OIDC_ALLOWED_ISSUERS: ISSUER,
        }),
      ),
      new IdentityFingerprintService(
        new ConfigService({
          DATABASE_URL: databaseUrl,
          IDENTITY_FINGERPRINT_KEYS: keyConfiguration,
        }),
      ),
      provisioningAuthorizer,
    );
  }

  async function createPerson() {
    return prisma.person.create({
      data: { fullName: 'Lifecycle Test Person' },
    });
  }

  function linkRequest(
    personId: string,
    subject: string,
    idempotencyKey = randomUUID(),
  ): LinkIdentityRequest {
    return {
      personId,
      issuer: `${ISSUER}/`,
      subject,
      idempotencyKey,
    };
  }

  it('denies provisioning and writes nothing', async () => {
    const person = await createPerson();
    authorizer.authorize.mockResolvedValue(null);

    await expect(
      service.LinkIdentityAsync(linkRequest(person.id, 'denied-subject')),
    ).rejects.toThrow('authorization was denied');

    expect(await prisma.personExternalIdentityLink.count()).toBe(0);
    expect(await prisma.identityLinkOperation.count()).toBe(0);
    expect(await prisma.identityLinkAudit.count()).toBe(0);
  });

  it('fails mutations closed without fingerprint configuration and writes nothing', async () => {
    const person = await createPerson();
    service = createService(container.getConnectionUri(), authorizer, '');

    await expect(
      service.LinkIdentityAsync(linkRequest(person.id, 'missing-key-subject')),
    ).rejects.toThrow('fingerprinting is unavailable');

    expect(await prisma.personExternalIdentityLink.count()).toBe(0);
    expect(await prisma.identityLinkOperation.count()).toBe(0);
    expect(await prisma.identityLinkAudit.count()).toBe(0);
  });

  it('links an exact subject and writes a private audit record', async () => {
    const person = await createPerson();
    const subject = ' Subject/Exact+Value ';
    const result = await service.LinkIdentityAsync(
      linkRequest(person.id, subject),
      'correlation-link',
    );
    const link = await prisma.personExternalIdentityLink.findUniqueOrThrow({
      where: { id: result.linkId },
    });
    const audit = await prisma.identityLinkAudit.findFirstOrThrow();

    expect(link.canonicalIssuer).toBe(ISSUER);
    expect(link.opaqueSubject).toBe(subject);
    expect(audit.action).toBe('LINK');
    expect(audit.beforeState).toEqual({});
    expect(JSON.stringify(audit.afterState)).not.toContain(subject);
    expect(JSON.stringify(audit.afterState)).not.toContain('JWT');
    expect(audit.correlationId).toBe('correlation-link');
  });

  it('rejects a missing Person without creating an operation', async () => {
    await expect(
      service.LinkIdentityAsync(
        linkRequest('00000000-0000-4000-8000-000000000000', 'missing-person'),
      ),
    ).rejects.toThrow('Person not found');

    expect(await prisma.identityLinkOperation.count()).toBe(0);
  });

  it('rejects oversized idempotency keys and revoke reasons without truncation', async () => {
    const person = await createPerson();

    await expect(
      service.LinkIdentityAsync(
        linkRequest(person.id, 'oversized-key-subject', 'k'.repeat(201)),
      ),
    ).rejects.toThrow('at most 200 characters');
    expect(await prisma.personExternalIdentityLink.count()).toBe(0);

    const linked = await service.LinkIdentityAsync(
      linkRequest(person.id, 'oversized-reason-subject'),
    );
    await expect(
      service.RevokeIdentityAsync({
        linkId: linked.linkId,
        reason: 'r'.repeat(1001),
        idempotencyKey: 'oversized-reason-key',
      }),
    ).rejects.toThrow('at most 1000 characters');
    expect(
      await prisma.personExternalIdentityLink.findUniqueOrThrow({
        where: { id: linked.linkId },
      }),
    ).toMatchObject({ status: 'ACTIVE' });
  });

  it('rejects both active uniqueness conflicts', async () => {
    const firstPerson = await createPerson();
    const secondPerson = await createPerson();
    await service.LinkIdentityAsync(
      linkRequest(firstPerson.id, 'unique-subject'),
    );

    await expect(
      service.LinkIdentityAsync(linkRequest(secondPerson.id, 'unique-subject')),
    ).rejects.toThrow('uniqueness conflict');
    await expect(
      service.LinkIdentityAsync(
        linkRequest(firstPerson.id, 'different-subject'),
      ),
    ).rejects.toThrow('uniqueness conflict');
  });

  it('revokes a link, retains it, and treats repeat revoke as a no-op', async () => {
    const person = await createPerson();
    const linked = await service.LinkIdentityAsync(
      linkRequest(person.id, 'revoke-subject'),
    );
    const request: RevokeIdentityRequest = {
      linkId: linked.linkId,
      reason: 'fabricated test reason',
      idempotencyKey: 'revoke-key',
    };

    const revoked = await service.RevokeIdentityAsync(request);
    const repeated = await service.RevokeIdentityAsync({
      ...request,
      idempotencyKey: 'revoke-repeat-key',
    });
    const stored = await prisma.personExternalIdentityLink.findUniqueOrThrow({
      where: { id: linked.linkId },
    });

    expect(revoked).toEqual({ linkId: linked.linkId, status: 'REVOKED' });
    expect(repeated).toEqual(revoked);
    expect(stored.status).toBe('REVOKED');
    expect(await prisma.personExternalIdentityLink.count()).toBe(1);
  });

  it('relinks atomically and records old/new protected identity details', async () => {
    const person = await createPerson();
    const old = await service.LinkIdentityAsync(
      linkRequest(person.id, 'old-subject'),
    );
    const request: RelinkIdentityRequest = {
      existingLinkId: old.linkId,
      newIssuer: ISSUER,
      newSubject: 'new-subject',
      idempotencyKey: 'relink-key',
    };

    const result = await service.RelinkIdentityAsync(request);
    const links = await prisma.personExternalIdentityLink.findMany({
      orderBy: { createdAtUtc: 'asc' },
    });
    const auditResult: unknown =
      await prisma.identityLinkAudit.findFirstOrThrow({
        where: { action: 'RELINK' },
      });
    const audit = auditResult as {
      linkId: string | null;
      beforeState: unknown;
      afterState: unknown;
    };

    expect(result.oldLinkId).toBe(old.linkId);
    expect(result.status).toBe('ACTIVE');
    expect(typeof result.linkId).toBe('string');
    expect(links.map((link) => link.status)).toEqual(['REVOKED', 'ACTIVE']);
    expect(audit.linkId).toBe(result.linkId);
    expect(audit.beforeState).toMatchObject({ linkId: old.linkId });
    expect(audit.afterState).toMatchObject({
      oldLinkId: old.linkId,
      newLinkId: result.linkId,
    });
    expect(JSON.stringify(audit.afterState)).not.toContain('old-subject');
    expect(JSON.stringify(audit.afterState)).not.toContain('new-subject');
  });

  it('rolls back a conflicting relink and keeps the old link active', async () => {
    const person = await createPerson();
    const otherPerson = await createPerson();
    const old = await service.LinkIdentityAsync(
      linkRequest(person.id, 'old-relink-subject'),
    );
    await service.LinkIdentityAsync(
      linkRequest(otherPerson.id, 'existing-new-subject'),
    );

    await expect(
      service.RelinkIdentityAsync({
        existingLinkId: old.linkId,
        newIssuer: ISSUER,
        newSubject: 'existing-new-subject',
        idempotencyKey: 'failed-relink-key',
      }),
    ).rejects.toThrow('uniqueness conflict');

    const oldLink = await prisma.personExternalIdentityLink.findUniqueOrThrow({
      where: { id: old.linkId },
    });
    expect(oldLink.status).toBe('ACTIVE');
    expect(
      await prisma.identityLinkOperation.count({
        where: { idempotencyKey: 'failed-relink-key' },
      }),
    ).toBe(0);
  });

  it('replays equivalent requests durably and conflicts on different requests', async () => {
    const person = await createPerson();
    const request = linkRequest(person.id, 'replay-subject', 'replay-key');
    const first = await service.LinkIdentityAsync(request);
    const replay = await service.LinkIdentityAsync({
      ...request,
      issuer: `${ISSUER}/`,
    });

    expect(replay).toEqual(first);
    await expect(
      service.LinkIdentityAsync({
        ...request,
        subject: 'different-replay-subject',
      }),
    ).rejects.toThrow('different request');
    expect(
      await prisma.identityLinkOperation.count({
        where: { idempotencyKey: 'replay-key' },
      }),
    ).toBe(1);
  });

  it('replays after a new service context using a retained previous key', async () => {
    const person = await createPerson();
    const oldService = createService(
      container.getConnectionUri(),
      authorizer,
      `v1=${OLD_KEY}`,
    );
    const request = linkRequest(person.id, 'restart-subject', 'restart-key');
    const first = await oldService.LinkIdentityAsync(request);
    const restartedService = createService(
      container.getConnectionUri(),
      authorizer,
      `v2=${CURRENT_KEY};v1=${OLD_KEY}`,
    );

    await expect(restartedService.LinkIdentityAsync(request)).resolves.toEqual(
      first,
    );
    expect(await prisma.identityLinkOperation.count()).toBe(1);
  });

  it('resolves concurrent same-key requests to one durable result', async () => {
    const person = await createPerson();
    const request = linkRequest(person.id, 'concurrent-subject', 'race-key');
    const first = createService(
      container.getConnectionUri(),
      authorizer,
      `v2=${CURRENT_KEY};v1=${OLD_KEY}`,
    );
    const second = createService(
      container.getConnectionUri(),
      authorizer,
      `v2=${CURRENT_KEY};v1=${OLD_KEY}`,
    );

    const results = await Promise.all([
      first.LinkIdentityAsync(request),
      second.LinkIdentityAsync(request),
    ]);

    expect(results[0]).toEqual(results[1]);
    expect(await prisma.personExternalIdentityLink.count()).toBe(1);
    expect(await prisma.identityLinkOperation.count()).toBe(1);
  });

  it('serializes concurrent revokes and preserves the first revoke state', async () => {
    const person = await createPerson();
    const linked = await service.LinkIdentityAsync(
      linkRequest(person.id, 'concurrent-revoke-subject'),
    );
    const first = createService(databaseUrl, authorizer);
    const second = createService(databaseUrl, authorizer);

    const results = await Promise.all([
      first.RevokeIdentityAsync({
        linkId: linked.linkId,
        reason: 'first revoke reason',
        idempotencyKey: 'concurrent-revoke-first',
      }),
      second.RevokeIdentityAsync({
        linkId: linked.linkId,
        reason: 'second revoke reason',
        idempotencyKey: 'concurrent-revoke-second',
      }),
    ]);

    const stored = await prisma.personExternalIdentityLink.findUniqueOrThrow({
      where: { id: linked.linkId },
    });
    const revokeAudits = await prisma.identityLinkAudit.findMany({
      where: { action: 'REVOKE' },
    });

    expect(results).toEqual([
      { linkId: linked.linkId, status: 'REVOKED' },
      { linkId: linked.linkId, status: 'REVOKED' },
    ]);
    expect(['first revoke reason', 'second revoke reason']).toContain(
      stored.revocationReason,
    );
    expect(revokeAudits).toHaveLength(1);
    expect(
      await prisma.identityLinkOperation.count({
        where: { operationType: 'REVOKE' },
      }),
    ).toBe(1);
  });

  it('allows only one concurrent relink to replace the original link', async () => {
    const person = await createPerson();
    const old = await service.LinkIdentityAsync(
      linkRequest(person.id, 'concurrent-relink-old-subject'),
    );
    const first = createService(databaseUrl, authorizer);
    const second = createService(databaseUrl, authorizer);

    const outcomes = await Promise.allSettled([
      first.RelinkIdentityAsync({
        existingLinkId: old.linkId,
        newIssuer: ISSUER,
        newSubject: 'concurrent-relink-first',
        idempotencyKey: 'concurrent-relink-first-key',
      }),
      second.RelinkIdentityAsync({
        existingLinkId: old.linkId,
        newIssuer: ISSUER,
        newSubject: 'concurrent-relink-second',
        idempotencyKey: 'concurrent-relink-second-key',
      }),
    ]);

    const links = await prisma.personExternalIdentityLink.findMany({
      where: { personId: person.id },
      orderBy: { createdAtUtc: 'asc' },
    });
    const relinkAudits = await prisma.identityLinkAudit.findMany({
      where: { action: 'RELINK' },
    });

    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      outcomes.filter((outcome) => outcome.status === 'rejected'),
    ).toHaveLength(1);
    expect(links.filter((link) => link.status === 'ACTIVE')).toHaveLength(1);
    expect(links.filter((link) => link.status === 'REVOKED')).toHaveLength(1);
    expect(relinkAudits).toHaveLength(1);
    expect(
      await prisma.identityLinkOperation.count({
        where: { operationType: 'RELINK' },
      }),
    ).toBe(1);
  });

  it('rolls back the mutation and operation when audit persistence fails', async () => {
    const person = await createPerson();
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_identity_audit_insert()
      RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'fabricated audit failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_identity_audit_insert_trigger
      BEFORE INSERT ON "identity_link_audits"
      FOR EACH ROW EXECUTE FUNCTION fail_identity_audit_insert();
    `);

    try {
      await expect(
        service.LinkIdentityAsync(
          linkRequest(person.id, 'audit-failure-subject'),
        ),
      ).rejects.toThrow('fabricated audit failure');
    } finally {
      await prisma.$executeRawUnsafe(`
        DROP TRIGGER fail_identity_audit_insert_trigger
        ON "identity_link_audits";
        DROP FUNCTION fail_identity_audit_insert();
      `);
    }

    expect(await prisma.personExternalIdentityLink.count()).toBe(0);
    expect(await prisma.identityLinkOperation.count()).toBe(0);
    expect(await prisma.identityLinkAudit.count()).toBe(0);
  });
});
