import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import express from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { runtimeConfig } from './common/runtime-config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const expressApp = app.getHttpAdapter().getInstance() as express.Express;
  expressApp.disable('x-powered-by');
  if (runtimeConfig.trustProxy) expressApp.set('trust proxy', 1);
  app.use(express.json({ limit: `${runtimeConfig.maxConfigBytes + 64 * 1024}b` }));
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(runtimeConfig.port, runtimeConfig.host);
  Logger.log(`API listening at http://${runtimeConfig.host}:${runtimeConfig.port}/api`, 'Bootstrap');
}

void bootstrap();
