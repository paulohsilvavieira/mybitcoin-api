import { NestFactory } from '@nestjs/core';
import { AppModule } from '@/app.module';
import { initializeOpenTelemetry } from '@/infrastructure/telemetry/opentelemetry.config';
import { TelemetryLoggerConfig } from '@/infrastructure/telemetry/telemetry.logger.config';
initializeOpenTelemetry();
async function bootstrap() {
  const logger = new TelemetryLoggerConfig();

  const app = await NestFactory.create(AppModule, {
    logger,
  });
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
