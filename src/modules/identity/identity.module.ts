import { Module } from '@nestjs/common';
import { IdentityController } from '@/modules/identity/presentation/identity.controller';
import { SessionsController } from '@/modules/identity/presentation/sessions.controller';
import { SessionAuthGuard } from '@/modules/identity/presentation/guards/session-auth.guard';
import { RegisterUser } from '@/modules/identity/application/register-user.usecase';
import { CreateSession } from '@/modules/identity/application/create-session.usecase';
import { ValidateSession } from '@/modules/identity/application/validate-session.usecase';
import { ListActiveSessions } from '@/modules/identity/application/list-active-sessions.usecase';
import { RevokeSession } from '@/modules/identity/application/revoke-session.usecase';
import { RevokeAllSessions } from '@/modules/identity/application/revoke-all-sessions.usecase';
import { PgUserRepository } from '@/modules/identity/infrastructure/persistence/pg-user.repository';
import { PgSessionRepository } from '@/modules/identity/infrastructure/persistence/pg-session.repository';
import { PgSessionReadRepository } from '@/modules/identity/infrastructure/persistence/pg-session-read.repository';
import {
  UserRepository,
  UserReadRepository,
  SessionRepository,
  SessionReadRepository,
} from '@/modules/identity/domain/repositories';
import { PgUserReadRepository } from '@/modules/identity/infrastructure/persistence/pg-user-read.repository';
import { EmailService } from '@/modules/identity/domain/services/email.service';
import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import * as bcrypt from 'bcrypt';

@Module({
  controllers: [IdentityController, SessionsController],
  providers: [
    {
      provide: UserRepository,
      useFactory: (db: QueryExecutor) => new PgUserRepository(db),
      inject: [QueryExecutor],
    },
    {
      provide: SessionRepository,
      useFactory: (db: QueryExecutor) => new PgSessionRepository(db),
      inject: [QueryExecutor],
    },
    {
      provide: UserReadRepository,
      useFactory: (readDb: ReadQueryExecutor) =>
        new PgUserReadRepository(readDb),
      inject: [ReadQueryExecutor],
    },
    {
      provide: SessionReadRepository,
      useFactory: (readDb: ReadQueryExecutor) =>
        new PgSessionReadRepository(readDb),
      inject: [ReadQueryExecutor],
    },
    {
      provide: EmailService,
      useFactory: () => ({
        sendVerification: () => Promise.resolve(),
      }),
    },

    {
      provide: RegisterUser,
      useFactory: (userRepo: UserRepository, emailService: EmailService) => {
        return new RegisterUser(
          userRepo,
          emailService,
          (plain: string) => bcrypt.hash(plain, 12) as Promise<string>,
        );
      },
      inject: [UserRepository, EmailService],
    },
    {
      provide: CreateSession,
      useFactory: (sessionRepo: SessionRepository) =>
        new CreateSession(sessionRepo),
      inject: [SessionRepository],
    },
    {
      provide: ValidateSession,
      useFactory: (sessionRepo: SessionRepository) =>
        new ValidateSession(sessionRepo),
      inject: [SessionRepository],
    },
    {
      provide: ListActiveSessions,
      useFactory: (sessionReadRepo: SessionReadRepository) =>
        new ListActiveSessions(sessionReadRepo),
      inject: [SessionReadRepository],
    },
    {
      provide: RevokeSession,
      useFactory: (sessionRepo: SessionRepository) =>
        new RevokeSession(sessionRepo),
      inject: [SessionRepository],
    },
    {
      provide: RevokeAllSessions,
      useFactory: (sessionRepo: SessionRepository) =>
        new RevokeAllSessions(sessionRepo),
      inject: [SessionRepository],
    },
    SessionAuthGuard,
  ],
})
export class IdentityModule {}
