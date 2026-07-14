import { Module } from '@nestjs/common';
import { IdentityController } from '@/modules/identity/presentation/identity.controller';
import { RegisterUser } from '@/modules/identity/application/register-user.usecase';
import { PgUserRepository } from '@/modules/identity/infrastructure/persistence/pg-user.repository';
import { UserRepository } from '@/modules/identity/domain/repositories/user.repository';
import { EmailService } from '@/modules/identity/domain/services/email.service';
import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { LoggerPort, LOGGER_PORT } from '@/shared/logger.port';
import { OtelLoggerAdapter } from '@/infrastructure/telemetry/otel-logger.adapter';
import * as bcrypt from 'bcrypt';

@Module({
  controllers: [IdentityController],
  providers: [
    {
      provide: UserRepository,
      useFactory: (db: QueryExecutor) => new PgUserRepository(db),
      inject: [QueryExecutor],
    },
    {
      provide: EmailService,
      useFactory: () => ({
        sendVerification: () => Promise.resolve(),
      }),
    },
    {
      provide: LoggerPort,
      useClass: OtelLoggerAdapter,
    },
    {
      provide: RegisterUser,
      useFactory: (
        userRepo: UserRepository,
        emailService: EmailService,
        logger: LoggerPort,
      ) => {
        return new RegisterUser(
          userRepo,
          emailService,
          (plain: string) => bcrypt.hash(plain, 12) as Promise<string>,
          logger,
        );
      },
      inject: [UserRepository, EmailService, LOGGER_PORT],
    },
  ],
})
export class IdentityModule {}
