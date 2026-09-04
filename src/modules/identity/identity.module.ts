import { Module } from '@nestjs/common';
import { IdentityController } from '@/modules/identity/presentation/identity.controller';
import { SessionsController } from '@/modules/identity/presentation/sessions.controller';
import { SessionAuthGuard } from '@/modules/identity/presentation/guards/session-auth.guard';
import { RegisterUser } from '@/modules/identity/application/register-user.usecase';
import { Login } from '@/modules/identity/application/login.usecase';
import { Logout } from '@/modules/identity/application/logout.usecase';
import { GetCurrentUser } from '@/modules/identity/application/get-current-user.usecase';
import { CreateSession } from '@/modules/identity/application/create-session.usecase';
import { ValidateSession } from '@/modules/identity/application/validate-session.usecase';
import { ListActiveSessions } from '@/modules/identity/application/list-active-sessions.usecase';
import { RevokeSession } from '@/modules/identity/application/revoke-session.usecase';
import { RevokeAllSessions } from '@/modules/identity/application/revoke-all-sessions.usecase';
import { VerifyEmail } from '@/modules/identity/application/verify-email.usecase';
import { ResendVerificationEmail } from '@/modules/identity/application/resend-verification-email.usecase';
import { PgUserRepository } from '@/modules/identity/infrastructure/persistence/pg-user.repository';
import { PgSessionRepository } from '@/modules/identity/infrastructure/persistence/pg-session.repository';
import { PgSessionReadRepository } from '@/modules/identity/infrastructure/persistence/pg-session-read.repository';
import { PgLoginAttemptRepository } from '@/modules/identity/infrastructure/persistence/pg-login-attempt.repository';
import {
  UserRepository,
  UserReadRepository,
  SessionRepository,
  SessionReadRepository,
  LoginAttemptRepository,
} from '@/modules/identity/domain/repositories';
import { PgUserReadRepository } from '@/modules/identity/infrastructure/persistence/pg-user-read.repository';
import { EmailService } from '@/modules/identity/domain/services/email.service';
import { ResendEmailService } from '@/modules/identity/infrastructure/services/resend-email.service';
import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import * as bcrypt from 'bcrypt';
import { Resend } from 'resend';

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
      provide: LoginAttemptRepository,
      useFactory: (db: QueryExecutor) => new PgLoginAttemptRepository(db),
      inject: [QueryExecutor],
    },
    {
      provide: EmailService,
      useFactory: () => {
        const apiKey = process.env.RESEND_API_KEY;
        const from = process.env.EMAIL_FROM;
        const frontendOrigin = process.env.FRONTEND_ORIGIN;
        if (!apiKey || !from || !frontendOrigin) {
          throw new Error(
            'RESEND_API_KEY, EMAIL_FROM e FRONTEND_ORIGIN são obrigatórias para o EmailService',
          );
        }
        return new ResendEmailService(new Resend(apiKey), from, frontendOrigin);
      },
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
      // Usa UserRepository (escrita), não a réplica: evita falso
      // InvalidCredentialsError por lag de replicação logo após o cadastro.
      provide: Login,
      useFactory: (
        userRepo: UserRepository,
        loginAttemptRepo: LoginAttemptRepository,
      ) =>
        new Login(userRepo, loginAttemptRepo, (plain: string, hash: string) =>
          bcrypt.compare(plain, hash),
        ),
      inject: [UserRepository, LoginAttemptRepository],
    },
    {
      provide: Logout,
      useFactory: (sessionRepo: SessionRepository) => new Logout(sessionRepo),
      inject: [SessionRepository],
    },
    {
      provide: GetCurrentUser,
      useFactory: (userReadRepo: UserReadRepository) =>
        new GetCurrentUser(userReadRepo),
      inject: [UserReadRepository],
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
    {
      provide: VerifyEmail,
      useFactory: (userRepo: UserRepository) => new VerifyEmail(userRepo),
      inject: [UserRepository],
    },
    {
      provide: ResendVerificationEmail,
      useFactory: (userRepo: UserRepository, emailService: EmailService) =>
        new ResendVerificationEmail(userRepo, emailService),
      inject: [UserRepository, EmailService],
    },
    SessionAuthGuard,
  ],
})
export class IdentityModule {}
