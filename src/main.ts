import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '@/app.module';
import { initializeOpenTelemetry } from '@/infrastructure/telemetry/opentelemetry.config';
import { TelemetryLoggerConfig } from '@/infrastructure/telemetry/telemetry.logger.config';
import { DomainErrorFilter } from '@/infrastructure/http/domain-error.filter';
import { SESSION_COOKIE_NAME } from '@/modules/identity/presentation/session-cookies';
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
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('MyBitcoin API')
    .setDescription('API da plataforma MyBitcoin')
    .setVersion('0.0.1')
    .addCookieAuth(SESSION_COOKIE_NAME, {
      type: 'apiKey',
      in: 'cookie',
      description:
        'Cookie de sessão definido no login (__Host-session). Requisições mutantes (POST/PUT/PATCH/DELETE) também exigem o header X-CSRF-Token com o valor do cookie __Host-csrf.',
    })
    .addTag('Health', 'Verificação de disponibilidade da API')
    .addTag('Auth', 'Cadastro e autenticação de usuários')
    .addTag('Sessions', 'Gerenciamento de sessões ativas')
    .addTag('Wallet', 'Saldos e histórico do ledger financeiro do usuário')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
