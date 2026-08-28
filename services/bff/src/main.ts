import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  // TODO(AD-5): wire the Authorization Service guard here before any real endpoint ships.
  // This bootstrap performs no authentication/authorization check yet — per the architecture
  // spine, the BFF is the browser boundary and must validate Keycloak-issued identity and defer
  // policy decisions to the Authorization Service, not bypass it.
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

  await app.listen(config.getOrThrow<number>('PORT'));
}

void bootstrap();
