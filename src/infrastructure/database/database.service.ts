import { Inject, Injectable } from '@nestjs/common';

import { Pool, QueryResult, QueryResultRow } from 'pg';

import { PGTransactionControl } from '@/infrastructure/database/transaction';
import { POOL_TOKEN } from '@/infrastructure/database/database.token';
import { QueryExecutor } from '@/infrastructure/database/query-executor';

@Injectable()
export class DatabaseService implements QueryExecutor {
  constructor(@Inject(POOL_TOKEN) private readonly pool: Pool) {}

  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  async runInTransaction<T>(
    fn: (tx: PGTransactionControl) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    await client.query('BEGIN');
    const tx = new PGTransactionControl(client);
    try {
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.release();
    }
  }
}
