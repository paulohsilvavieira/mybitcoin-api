import { Global, Module } from '@nestjs/common';
import { DatabaseProvider } from './database.provider';
import { DatabaseService } from './database.service';
import { POOL_TOKEN } from './pool.token';

@Global()
@Module({
  providers: [DatabaseProvider, DatabaseService],
  exports: [POOL_TOKEN, DatabaseService],
})
export class DatabaseModule {}
