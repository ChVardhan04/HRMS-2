import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const port = Number(process.env.PORT) || 3000;

  console.log('========================================');
  console.log('HRMS SERVER STARTUP');
  console.log(`PORT environment variable: ${process.env.PORT}`);
  console.log(`Resolved port: ${port}`);
  console.log('Host: 0.0.0.0');
  console.log('========================================');

  const app = await NestFactory.create(AppModule, {
    cors: false,
  });

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

  await app.listen(port, '0.0.0.0');

  console.log('========================================');
  console.log(`HRMS backend is listening on 0.0.0.0:${port}`);
  console.log(`API base path: /${apiPrefix}`);
  console.log('========================================');
}

bootstrap();
