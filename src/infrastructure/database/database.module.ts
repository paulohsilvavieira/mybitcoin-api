import { Global, Module } from '@nestjs/common';
import { DatabaseConnectionProvider } from './database.provider';
import { DatabaseService } from './database.service';
import { POOL_TOKEN } from './database.token';
import { UnitOfWork } from '../../shared/unit-of-work';
import { PostgresUnitOfWork } from './unit-of-work.postgres';

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
