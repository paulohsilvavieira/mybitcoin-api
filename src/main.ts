import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { initializeOpenTelemetry } from '@/infrastructure/telemetry/opentelemetry.config';
import { TelemetryLoggerConfig } from '@/infrastructure/telemetry/telemetry.logger.config';
import { DomainErrorFilter } from '@/infrastructure/http/domain-error.filter';
initializeOpenTelemetry();
async function bootstrap() {
  const logger = new TelemetryLoggerConfig();

  const app = await NestFactory.create(AppModule, {
    logger,
  });

  app.use(cookieParser());
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN,
    credentials: true,
  });
  app.useGlobalFilters(new DomainErrorFilter());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
