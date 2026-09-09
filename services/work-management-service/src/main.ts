import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Application, RequestHandler } from 'express';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('API')
    .setDescription('Backend API documentation')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const tokenExchange = app.get(ServiceTokenExchangeService);
  const httpServer = app.getHttpAdapter().getInstance() as Application;
  const jwksHandler: RequestHandler = async (_request, response) => {
    try {
      response.json(await tokenExchange.getPublicJwks());
    } catch {
      response
        .status(503)
        .json({ error: 'Service signing key is unavailable' });
    }
  };
  httpServer.get('/.well-known/jwks.json', jwksHandler);

  await app.listen(config.getOrThrow<number>('PORT'));
}

void bootstrap();
