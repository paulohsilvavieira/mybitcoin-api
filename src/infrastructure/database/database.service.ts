import { Inject, Injectable } from '@nestjs/common';

import { Pool, QueryResult, QueryResultRow } from 'pg';

import { WRITE_POOL_TOKEN } from '@/infrastructure/database/database.token';
import { QueryExecutor } from '@/infrastructure/database/query-executor';

@Injectable()
export class DatabaseService implements QueryExecutor {
  constructor(@Inject(WRITE_POOL_TOKEN) private readonly pool: Pool) {}

  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  async runInTransaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    await client.query('BEGIN');
    const tx: QueryExecutor = {
      query: (sql, params) => client.query(sql, params),
    };
    try {
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
