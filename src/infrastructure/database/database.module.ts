import { Global, Module } from '@nestjs/common';
import { DatabaseConnectionProvider } from '@/infrastructure/database/database.provider';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { POOL_TOKEN } from '@/infrastructure/database/database.token';
import { UnitOfWork } from '@/shared/unit-of-work';
import { PostgresUnitOfWork } from '@/infrastructure/database/unit-of-work-postgres.service';

@Global()
@Module({
  providers: [
    DatabaseConnectionProvider,
    DatabaseService,
    {
      provide: UnitOfWork,
      useClass: PostgresUnitOfWork,
    },
  ],
  exports: [POOL_TOKEN, DatabaseService, UnitOfWork],
})
export class DatabaseModule {}
