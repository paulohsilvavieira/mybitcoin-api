import { Inject, Injectable } from '@nestjs/common';

import { Pool, QueryResult, QueryResultRow } from 'pg';

import { Transaction } from './transaction';
import { POOL_TOKEN } from './database.token';

@Injectable()
export class DatabaseService {
  constructor(@Inject(POOL_TOKEN) private readonly pool: Pool) {}

  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(sql, params);
  }

  async startTransaction(): Promise<Transaction> {
    const client = await this.pool.connect();
    await client.query('BEGIN');
    return new Transaction(client);
  }

  async runInTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const tx = await this.startTransaction();
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
