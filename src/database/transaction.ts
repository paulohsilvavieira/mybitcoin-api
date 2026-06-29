import { PoolClient, QueryResult, QueryResultRow } from 'pg';

export class Transaction {
  constructor(private readonly client: PoolClient) {}

  query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    return this.client.query<T>(sql, params);
  }

  async commit(): Promise<void> {
    await this.client.query('COMMIT');
  }
  async rollback(): Promise<void> {
    await this.client.query('ROLLBACK');
  }

  release(): void {
    this.client.release();
  }
}
