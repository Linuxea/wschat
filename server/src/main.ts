import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const port = config.get<number>('BACKEND_PORT', 3001);
  const origin = config.get<string>('BACKEND_ORIGIN', 'http://localhost:3000');

  app.useLogger(['log', 'error', 'warn', 'debug', 'verbose']);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: origin.split(',').map((o) => o.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  await app.listen(port);
  Logger.log(`🚀 wschat API on http://localhost:${port}/api`, 'Bootstrap');
}
bootstrap();
