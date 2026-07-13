import { Module } from '@nestjs/common';
import { IdentityController } from './presentation/identity.controller';
import { RegisterUser } from './application/register-user.usecase';
import { PgUserRepository } from './infrastructure/persistence/pg-user.repository';
import { UserRepository } from './domain/repositories/user.repository';
import { EmailService } from './domain/services/email.service';
import { QueryExecutor } from '../../infrastructure/database/query-executor';
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
  ],
})
export class IdentityModule {}
