import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { ServiceTokenExchangeService } from './modules/auth/service-token-exchange.service';

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

  app.enableCors({
    origin: config.getOrThrow<string>('CORS_ORIGIN'),
  });

  app.enableShutdownHooks();
  const expressApp = app.getHttpAdapter().getInstance() as {
    get(
      path: string,
      handler: (request: Request, response: Response) => Promise<void>,
    ): void;
  };
  expressApp.get(
    '/.well-known/jwks.json',
    async (_request: Request, response: Response) => {
      const exchange = app.get(ServiceTokenExchangeService);
      try {
        response.json(await exchange.getPublicJwks());
      } catch {
        response.status(503).json({
          title: 'Service signing key is unavailable',
          status: 503,
        });
      }
    },
  );

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
