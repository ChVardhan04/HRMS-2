import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const port = Number(process.env.PORT) || 10000;

  console.log('========== HRMS BOOT ==========');
  console.log('PORT:', process.env.PORT);
  console.log('RESOLVED PORT:', port);
  console.log('HOST: 0.0.0.0');

  console.log('STEP 1: Creating Nest application...');

  const app = await NestFactory.create(AppModule, {
    cors: false,
  });

  console.log('STEP 2: Nest application created.');

  app.use(helmet());

  const corsOrigins = (
    process.env.CORS_ORIGIN ?? 'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const apiPrefix = process.env.API_PREFIX ?? 'api/v1';

  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  console.log('STEP 3: Configuration complete.');
  console.log('STEP 4: Starting HTTP server...');
  console.log(`Attempting to listen on 0.0.0.0:${port}`);

  await app.listen(port, '0.0.0.0');

  console.log('STEP 5: HTTP SERVER STARTED.');
  console.log(`HRMS backend listening on 0.0.0.0:${port}`);
  console.log(`API base path: /${apiPrefix}`);
  console.log('========== HRMS READY ==========');
}

bootstrap().catch((error) => {
  console.error('========== HRMS BOOT FAILED ==========');
  console.error(error);
  process.exit(1);
});
