import { Module } from '@nestjs/common';
import { IdentityController } from '@/modules/identity/presentation/identity.controller';
import { RegisterUser } from '@/modules/identity/application/register-user.usecase';
import { PgUserRepository } from '@/modules/identity/infrastructure/persistence/pg-user.repository';
import { UserRepository } from '@/modules/identity/domain/repositories/user.repository';
import { EmailService } from '@/modules/identity/domain/services/email.service';
import { QueryExecutor } from '@/infrastructure/database/query-executor';
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
