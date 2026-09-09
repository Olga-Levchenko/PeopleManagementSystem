import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckResult } from '@nestjs/terminus';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Self-contained, like `jwt-guard.e2e-spec.ts`/`profile.e2e-spec.ts`: boots its own ephemeral
 * Testcontainers Postgres rather than requiring `infra/docker-compose.yml`'s shared instance
 * already running, so this suite (and `run_e2e: true` in `people-service-ci.yml`) no longer
 * depends on CI provisioning a real, already-running Postgres -- see `deferred-work.md`'s
 * now-resolved entry on this exact gap. `/health` is `@Public()`, so no auth override is needed
 * here (unlike `profile.e2e-spec.ts`).
 */
const SERVICE_ROOT = path.resolve(__dirname, '..');

describe('AppModule (e2e)', () => {
  jest.setTimeout(180_000);

  let container: StartedPostgreSqlContainer;
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('people_service_e2e')
      .start();

    const databaseUrl = container.getConnectionUri();

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: SERVICE_ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
      shell: true,
    });

    const configOverrides: Record<string, string> = {
      PORT: '3002',
      CORS_ORIGIN: 'http://localhost:4200',
      DATABASE_URL: databaseUrl,
      RABBITMQ_URL: 'amqp://stub:stub@localhost:5672',
      RABBITMQ_EXCHANGE: 'people.relationships',
      OUTBOX_PUBLISHER_RETRY_LIMIT: '5',
      OUTBOX_STALE_LOCK_MINUTES: '10',
      // Huge on purpose: OutboxPublisherService's background loop fires on this interval
      // regardless of any request under test; a short one floods this suite's run with
      // "Scheduled outbox publication failed" (RabbitMQ isn't real) log noise.
      OUTBOX_PUBLISHER_INTERVAL_MS: '999999999',
      KEYCLOAK_BASE_URL: 'http://localhost:8080',
      KEYCLOAK_REALM: 'people-management',
      ACCESS_CONTROL_SERVICE_BASE_URL: 'http://stub-access-control:3007',
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        getOrThrow: (key: string) => {
          const value = configOverrides[key];
          if (value === undefined) {
            throw new Error(
              `Test ConfigService override: unexpected key '${key}' requested`,
            );
          }
          return value;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
    await container?.stop();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as HealthCheckResult;
        expect(body.status).toBe('ok');
        expect(body.info?.database?.status).toBe('up');
      });
  });
});
