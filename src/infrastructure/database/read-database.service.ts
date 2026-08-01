import { Inject, Injectable } from '@nestjs/common';

import { Pool, QueryResult, QueryResultRow } from 'pg';

import { READ_POOL_TOKEN } from '@/infrastructure/database/database.token';
import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';

@Injectable()
export class ReadDatabaseService implements ReadQueryExecutor {
  constructor(@Inject(READ_POOL_TOKEN) private readonly pool: Pool) {}

  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }
}
