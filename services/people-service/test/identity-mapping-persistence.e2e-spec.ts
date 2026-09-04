import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { ConfigService } from '@nestjs/config';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { PrismaService } from '../src/prisma/prisma.service';

const execFileAsync = promisify(execFile);
const SERVICE_ROOT = path.resolve(__dirname, '..');
const MIGRATION_PATH = path.join(
  SERVICE_ROOT,
  'prisma',
  'migrations',
  '20260904152000_add_identity_mapping_persistence',
  'migration.sql',
);

const ISSUER = 'https://id.example.test/realms/people-management';

describe('Identity mapping persistence migration', () => {
  jest.setTimeout(180_000);

  let container: StartedPostgreSqlContainer;
  let prisma: PrismaService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('people_identity_mapping_test')
      .withUsername('postgres')
      .withPassword('postgres')
      .start();

    const databaseUrl = container.getConnectionUri();
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
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await container?.stop();
  }, 120_000);

  beforeEach(async () => {
    await prisma.identityLinkAudit.deleteMany();
    await prisma.identityLinkOperation.deleteMany();
    await prisma.personExternalIdentityLink.deleteMany();
    await prisma.person.deleteMany();
  });

  async function createPerson() {
    return prisma.person.create({ data: { fullName: 'Schema Test Person' } });
  }

  it('cleanly installs the migration and upgrades the current schema', async () => {
    const migration = await prisma.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null }>
    >`SELECT "migration_name", "finished_at"
      FROM "_prisma_migrations"
      WHERE "migration_name" = '20260904152000_add_identity_mapping_persistence'`;
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'people',
          'person_external_identity_links',
          'identity_link_operations',
          'identity_link_audits'
        )
      ORDER BY table_name`;

    expect(migration).toHaveLength(1);
    expect(migration[0].finished_at).toEqual(expect.any(Date));
    expect(tables.map(({ table_name }) => table_name)).toEqual([
      'identity_link_audits',
      'identity_link_operations',
      'people',
      'person_external_identity_links',
    ]);
  });

  it('creates both ACTIVE partial unique indexes and allows revoked history', async () => {
    const firstPerson = await createPerson();
    const secondPerson = await createPerson();
    const firstLink = await prisma.personExternalIdentityLink.create({
      data: {
        personId: firstPerson.id,
        canonicalIssuer: ISSUER,
        opaqueSubject: 'subject-one',
      },
    });

    await expect(
      prisma.personExternalIdentityLink.create({
        data: {
          personId: secondPerson.id,
          canonicalIssuer: ISSUER,
          opaqueSubject: 'subject-one',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await expect(
      prisma.personExternalIdentityLink.create({
        data: {
          personId: firstPerson.id,
          canonicalIssuer: ISSUER,
          opaqueSubject: 'subject-two',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await prisma.personExternalIdentityLink.update({
      where: { id: firstLink.id },
      data: {
        status: 'REVOKED',
        revokedAtUtc: new Date(),
        revocationReason: 'test-revocation',
      },
    });

    const replacement = await prisma.personExternalIdentityLink.create({
      data: {
        personId: secondPerson.id,
        canonicalIssuer: ISSUER,
        opaqueSubject: 'subject-one',
      },
    });
    await prisma.personExternalIdentityLink.update({
      where: { id: replacement.id },
      data: { status: 'REVOKED', revokedAtUtc: new Date() },
    });

    const revokedHistory = await prisma.personExternalIdentityLink.count({
      where: {
        canonicalIssuer: ISSUER,
        opaqueSubject: 'subject-one',
        status: 'REVOKED',
      },
    });
    const indexes = await prisma.$queryRaw<
      Array<{ indexname: string; indexdef: string }>
    >`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'person_external_identity_links'
        AND indexname IN (
          'person_external_identity_links_active_issuer_subject_key',
          'person_external_identity_links_active_person_issuer_key'
        )
      ORDER BY indexname`;

    expect(revokedHistory).toBe(2);
    expect(indexes).toHaveLength(2);
    expect(indexes[0].indexdef).toContain(
      'WHERE (status = \'ACTIVE\'::"IdentityLinkStatus")',
    );
    expect(indexes[1].indexdef).toContain(
      'WHERE (status = \'ACTIVE\'::"IdentityLinkStatus")',
    );
    expect(indexes[0].indexdef + indexes[1].indexdef).toContain(
      '"canonicalIssuer", "opaqueSubject"',
    );
    expect(indexes[0].indexdef + indexes[1].indexdef).toContain(
      '"personId", "canonicalIssuer"',
    );
  });

  it('enforces foreign keys and required persistence fields', async () => {
    const person = await createPerson();
    const link = await prisma.personExternalIdentityLink.create({
      data: {
        personId: person.id,
        canonicalIssuer: ISSUER,
        opaqueSubject: 'subject-required-fields',
      },
    });

    await expect(
      prisma.personExternalIdentityLink.create({
        data: {
          personId: '00000000-0000-4000-8000-000000000000',
          canonicalIssuer: ISSUER,
          opaqueSubject: 'subject-invalid-person',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    await expect(
      prisma.$executeRaw`
        INSERT INTO "person_external_identity_links"
          ("id", "personId", "updatedAtUtc")
        VALUES
          (gen_random_uuid(), ${person.id}, CURRENT_TIMESTAMP)
      `,
    ).rejects.toThrow(/null value|not-null/i);

    await expect(
      prisma.$executeRaw`
        INSERT INTO "identity_link_audits"
          ("auditId", "action", "personId", "canonicalIssuer", "subjectFingerprint",
           "fingerprintKeyVersion", "actorType", "actorIdentifier", "correlationId",
           "idempotencyKey", "beforeState", "afterState")
        VALUES
          (gen_random_uuid(), 'LINK', ${person.id}, ${ISSUER}, 'fingerprint',
           'test-v1', 'test', 'actor', 'correlation', 'idempotency', '{}'::jsonb, '{}'::jsonb)
      `,
    ).resolves.toBe(1);

    expect(link.status).toBe('ACTIVE');
  });

  it('refuses duplicate active data before creating partial indexes', async () => {
    const person = await createPerson();
    const link = await prisma.personExternalIdentityLink.create({
      data: {
        personId: person.id,
        canonicalIssuer: ISSUER,
        opaqueSubject: 'duplicate-preflight-subject',
      },
    });
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'DROP INDEX "person_external_identity_links_active_issuer_subject_key"',
        );
        await tx.$executeRawUnsafe(
          'DROP INDEX "person_external_identity_links_active_person_issuer_key"',
        );
        await tx.$executeRaw`
          INSERT INTO "person_external_identity_links"
            ("id", "personId", "canonicalIssuer", "opaqueSubject", "updatedAtUtc")
          VALUES
            (${randomUUID()}::uuid, ${person.id}, ${ISSUER}, ${link.opaqueSubject}, CURRENT_TIMESTAMP)
        `;
        await tx.$executeRaw`
          DO $$
          BEGIN
            IF EXISTS (
              SELECT 1
              FROM "person_external_identity_links"
              WHERE "status" = 'ACTIVE'
              GROUP BY "canonicalIssuer", "opaqueSubject"
              HAVING COUNT(*) > 1
            ) THEN
              RAISE EXCEPTION USING
                MESSAGE = 'Cannot create active identity uniqueness index: duplicate (canonicalIssuer, opaqueSubject) data exists';
            END IF;
          END $$;
        `;
      }),
    ).rejects.toThrow(/duplicate \(canonicalIssuer, opaqueSubject\)/i);

    const migration = await readFile(MIGRATION_PATH, 'utf8');
    expect(migration).toContain(
      'Cannot create active identity uniqueness index: duplicate (canonicalIssuer, opaqueSubject) data exists',
    );
    expect(migration).toContain(
      'Cannot create active identity uniqueness index: duplicate (personId, canonicalIssuer) data exists',
    );
    expect(migration.indexOf('DO $$')).toBeLessThan(
      migration.indexOf(
        'person_external_identity_links_active_issuer_subject_key',
      ),
    );
    expect(migration).toContain('no automatic resolution was performed');
  });

  it('enforces durable operation uniqueness by operation type and idempotency key', async () => {
    const first = await prisma.identityLinkOperation.create({
      data: {
        operationType: 'LINK',
        idempotencyKey: 'operation-key',
        requestFingerprint: 'request-fingerprint',
        fingerprintKeyVersion: 'test-v1',
        resultStatus: 'SUCCEEDED',
      },
    });

    await expect(
      prisma.identityLinkOperation.create({
        data: {
          operationType: 'LINK',
          idempotencyKey: 'operation-key',
          requestFingerprint: 'different-request',
          fingerprintKeyVersion: 'test-v1',
          resultStatus: 'SUCCEEDED',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const differentOperation = await prisma.identityLinkOperation.create({
      data: {
        operationType: 'REVOKE',
        idempotencyKey: 'operation-key',
        requestFingerprint: 'different-request',
        fingerprintKeyVersion: 'test-v1',
        resultStatus: 'SUCCEEDED',
      },
    });

    expect(first.operationId).not.toBe(differentOperation.operationId);
  });
});
