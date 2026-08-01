import { Global, Module } from '@nestjs/common';
import {
  DatabaseReadConnectionProvider,
  DatabaseWriteConnectionProvider,
} from '@/infrastructure/database/database.provider';
import { DatabaseService } from '@/infrastructure/database/database.service';
import { ReadDatabaseService } from '@/infrastructure/database/read-database.service';
import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import {
  READ_POOL_TOKEN,
  WRITE_POOL_TOKEN,
} from '@/infrastructure/database/database.token';
import { UnitOfWork } from '@/shared/unit-of-work';
import { PostgresUnitOfWork } from '@/infrastructure/database/unit-of-work-postgres.service';

@Global()
@Module({
  providers: [
    DatabaseWriteConnectionProvider,
    DatabaseReadConnectionProvider,
    DatabaseService,
    ReadDatabaseService,
    {
      provide: ReadQueryExecutor,
      useExisting: ReadDatabaseService,
    },
    {
      provide: UnitOfWork,
      useClass: PostgresUnitOfWork,
    },
  ],
  exports: [
    WRITE_POOL_TOKEN,
    READ_POOL_TOKEN,
    DatabaseService,
    ReadDatabaseService,
    ReadQueryExecutor,
    UnitOfWork,
  ],
})
export class DatabaseModule {}
