export function saveLedgerEntryQuery(params: {
  id: string;
  transactionId: string;
  account: string;
  type: string;
  amountSatoshi: string;
  createdAt: Date;
}): { query: string; values: unknown[] } {
  const query = `
    INSERT INTO ledger_entries (id, transaction_id, account, type, amount_satoshi, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
  `;
  return {
    query,
    values: [
      params.id,
      params.transactionId,
      params.account,
      params.type,
      params.amountSatoshi,
      params.createdAt,
    ],
  };
}

export function findLedgerEntriesByTransactionIdQuery(transactionId: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT id, transaction_id, account, type, amount_satoshi, created_at
    FROM ledger_entries
    WHERE transaction_id = $1
  `;
  return { query, values: [transactionId] };
}
