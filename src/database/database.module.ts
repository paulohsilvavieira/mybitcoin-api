import { Global, Module } from '@nestjs/common';
import { DatabaseProvider } from './database.provider';
import { POOL_TOKEN } from './pool.token';

@Global()
@Module({
  providers: [DatabaseProvider],
  exports: [POOL_TOKEN],
})
export class DatabaseModule {}
