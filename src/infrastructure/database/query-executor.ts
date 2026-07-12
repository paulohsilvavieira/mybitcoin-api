import { QueryResult, QueryResultRow } from 'pg';

export abstract class QueryExecutor {
  abstract query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}
