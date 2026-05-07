import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initializeOpenTelemetry } from './telemetry/opentelemetry.config';
import { TelemetryLoggerConfig } from './telemetry/telemetry.logger.config';
initializeOpenTelemetry();
async function bootstrap() {
  const logger = new TelemetryLoggerConfig();

  const app = await NestFactory.create(AppModule, {
    logger,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
