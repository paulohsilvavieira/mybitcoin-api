export function findTransactionByIdQuery(id: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT id, account_id, type, amount_satoshi, status, created_at
    FROM transactions
    WHERE id = $1
  `;
  return { query, values: [id] };
}

export function saveTransactionQuery(params: {
  id: string;
  accountId: string;
  type: string;
  amountSatoshi: string;
  status: string;
  createdAt: Date;
}): { query: string; values: unknown[] } {
  const query = `
    INSERT INTO transactions (id, account_id, type, amount_satoshi, status, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET status = $5
  `;
  return {
    query,
    values: [
      params.id,
      params.accountId,
      params.type,
      params.amountSatoshi,
      params.status,
      params.createdAt,
    ],
  };
}
