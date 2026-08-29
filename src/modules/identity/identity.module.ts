import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { randomBytes, createHash } from 'node:crypto';
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
import { RequestPasswordReset } from '@/modules/identity/application/request-password-reset.usecase';
import { ConfirmPasswordReset } from '@/modules/identity/application/confirm-password-reset.usecase';
import { PgUserRepository } from '@/modules/identity/infrastructure/persistence/pg-user.repository';
import { PgSessionRepository } from '@/modules/identity/infrastructure/persistence/pg-session.repository';
import { PgSessionReadRepository } from '@/modules/identity/infrastructure/persistence/pg-session-read.repository';
import { PgLoginAttemptRepository } from '@/modules/identity/infrastructure/persistence/pg-login-attempt.repository';
import { PgPasswordResetTokenRepository } from '@/modules/identity/infrastructure/persistence/pg-password-reset-token.repository';
import { PgPasswordResetRequestRepository } from '@/modules/identity/infrastructure/persistence/pg-password-reset-request.repository';
import { PgIdentityUnitOfWork } from '@/modules/identity/infrastructure/persistence/pg-identity-unit-of-work';
import {
  UserRepository,
  UserReadRepository,
  SessionRepository,
  SessionReadRepository,
  LoginAttemptRepository,
  PasswordResetTokenRepository,
  PasswordResetRequestRepository,
} from '@/modules/identity/domain/repositories';
import { IdentityUnitOfWork } from '@/modules/identity/domain/identity-unit-of-work';
import { PgUserReadRepository } from '@/modules/identity/infrastructure/persistence/pg-user-read.repository';
import { EmailService } from '@/modules/identity/domain/services/email.service';
import { NoopEmailService } from '@/modules/identity/infrastructure/email/noop-email.service';
import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import * as bcrypt from 'bcrypt';
import { PASSWORD_RESET_THROTTLE } from '@/modules/identity/presentation/identity.controller';

/** Bytes de entropia do token opaco de reset (igual ao token de sessão). */
const RESET_TOKEN_BYTES = 32;
/** REC — só o hash sha256 do token é persistido; o token em claro só vai no e-mail. */
const hashResetToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
const generateResetToken = (): string =>
  randomBytes(RESET_TOKEN_BYTES).toString('hex');

@Module({
  imports: [ThrottlerModule.forRoot([PASSWORD_RESET_THROTTLE])],
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
      useFactory: (config: ConfigService) =>
        new NoopEmailService(
          config.get<string>('PASSWORD_RESET_URL') ??
            'http://localhost:5173/reset-password',
        ),
      inject: [ConfigService],
    },
    {
      provide: PasswordResetTokenRepository,
      useFactory: (db: QueryExecutor) => new PgPasswordResetTokenRepository(db),
      inject: [QueryExecutor],
    },
    {
      provide: PasswordResetRequestRepository,
      useFactory: (db: QueryExecutor) =>
        new PgPasswordResetRequestRepository(db),
      inject: [QueryExecutor],
    },
    {
      provide: IdentityUnitOfWork,
      useClass: PgIdentityUnitOfWork,
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
      provide: RequestPasswordReset,
      useFactory: (
        userRepo: UserRepository,
        requestRepo: PasswordResetRequestRepository,
        uow: IdentityUnitOfWork,
        emailService: EmailService,
      ) =>
        new RequestPasswordReset(
          userRepo,
          requestRepo,
          uow,
          emailService,
          generateResetToken,
          hashResetToken,
        ),
      inject: [
        UserRepository,
        PasswordResetRequestRepository,
        IdentityUnitOfWork,
        EmailService,
      ],
    },
    {
      provide: ConfirmPasswordReset,
      useFactory: (
        tokenRepo: PasswordResetTokenRepository,
        userRepo: UserRepository,
        uow: IdentityUnitOfWork,
      ) =>
        new ConfirmPasswordReset(
          tokenRepo,
          userRepo,
          uow,
          hashResetToken,
          (plain: string) => bcrypt.hash(plain, 12) as Promise<string>,
        ),
      inject: [
        PasswordResetTokenRepository,
        UserRepository,
        IdentityUnitOfWork,
      ],
    },
    SessionAuthGuard,
  ],
})
export class IdentityModule {}
