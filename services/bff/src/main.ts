import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import session from 'express-session';
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

  // express-session must be registered before any route handler or guard runs so that
  // `req.session` is populated by the time `JwtAuthGuard.canActivate` is called.
  //
  // IMPORTANT: MemoryStore (the default) is acceptable for local dev only. It leaks memory on
  // long-running processes and loses all sessions on restart. Any multi-process or production
  // deployment MUST replace this with `connect-redis` or `connect-pg-simple`. See CLAUDE.md.
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
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
}

void bootstrap();
