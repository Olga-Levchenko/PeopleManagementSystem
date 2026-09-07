import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import { Pool } from 'pg';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  const sessionSecret = config.getOrThrow<string>('SESSION_SECRET');
  const databaseUrl = config.get<string>('DATABASE_URL');

  // express-session must be registered before any route handler or guard runs so that
  // `req.session` is populated by the time `JwtAuthGuard.canActivate` is called.
  //
  // When DATABASE_URL is set, use connect-pg-simple for a persistent session store. The pg Pool
  // is created lazily -- Postgres unreachability surfaces on the first session write, not at
  // startup, which preserves the zero-infra local-dev path when DATABASE_URL is absent.
  //
  // When DATABASE_URL is absent, fall back to MemoryStore with a warning. MemoryStore is
  // acceptable for local dev only: it leaks memory on long-running processes and resets all
  // sessions on BFF restart. Any multi-process or production deployment must set DATABASE_URL.
  let pgPool: Pool | undefined;
  let sessionStore: session.Store | undefined;
  if (databaseUrl) {
    pgPool = new Pool({ connectionString: databaseUrl });
    const PgSession = connectPgSimple(session);
    sessionStore = new PgSession({
      pool: pgPool,
      createTableIfMissing: true,
    });
  } else {
    console.warn(
      '[BFF] DATABASE_URL is not set — using MemoryStore for sessions. ' +
        'Sessions will be lost on BFF restart. Set DATABASE_URL for production.',
    );
  }

  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // Only send the cookie over HTTPS in production. In development the BFF runs over plain
        // HTTP (localhost), so `secure: false` is intentional -- not a security bypass.
        secure: nodeEnv === 'production',
      },
    }),
  );

  app.enableCors({
    origin: config.getOrThrow<string>('CORS_ORIGIN'),
    // Credentials (cookies) must be allowed for the session cookie to be sent on cross-origin
    // requests from the React frontend (localhost:4200 → localhost:3001).
    credentials: true,
  });

  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('API')
    .setDescription('Backend API documentation')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(config.getOrThrow<number>('PORT'));

  if (pgPool) {
    const cleanupPool = () => void pgPool.end();
    process.once('SIGTERM', cleanupPool);
    process.once('SIGINT', cleanupPool);
  }
}

void bootstrap();
