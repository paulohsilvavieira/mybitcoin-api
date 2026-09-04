export const INSERT_LEDGER_ENTRY = `
  INSERT INTO ledger_entries (
    id, transaction_id, account, asset, entry_type,
    amount_minor, balance_before_minor, balance_after_minor, created_at
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
`;

export const FIND_LEDGER_ENTRIES_BY_TRANSACTION_ID = `
  SELECT id, transaction_id, account, asset, entry_type,
         amount_minor, balance_before_minor, balance_after_minor, created_at
  FROM ledger_entries
  WHERE transaction_id = $1
  ORDER BY entry_type DESC
`;

export const SUM_LEDGER_ENTRIES_BY_ACCOUNT = `
  SELECT
    COALESCE(SUM(amount_minor) FILTER (WHERE entry_type = 'debit'), 0)  AS debit_minor,
    COALESCE(SUM(amount_minor) FILTER (WHERE entry_type = 'credit'), 0) AS credit_minor
  FROM ledger_entries
  WHERE account = $1
`;

/**
 * Histórico paginado das pernas das contas do usuário. O formato canônico de
 * conta (contrato — ADR 0006 Obs #2) é `USER_AVAILABLE:{userId}:{asset}` e
 * `USER_LOCKED:{userId}:{asset}`; a query filtra por prefixo, servido pelo
 * índice `idx_ledger_entries_account (account, created_at DESC, id DESC)`.
 */
export const FIND_USER_LEDGER_HISTORY = `
  SELECT le.id, le.transaction_id, le.account, le.asset, le.entry_type,
         le.amount_minor, le.balance_before_minor, le.balance_after_minor,
         le.created_at, a.scale
  FROM ledger_entries le
  JOIN assets a ON a.symbol = le.asset
  WHERE le.account LIKE 'USER_AVAILABLE:' || $1 || ':%'
     OR le.account LIKE 'USER_LOCKED:'    || $1 || ':%'
  ORDER BY le.created_at DESC, le.id DESC
  LIMIT $2 OFFSET $3
`;

export const COUNT_USER_LEDGER_HISTORY = `
  SELECT COUNT(*)::bigint AS total
  FROM ledger_entries le
  WHERE le.account LIKE 'USER_AVAILABLE:' || $1 || ':%'
     OR le.account LIKE 'USER_LOCKED:'    || $1 || ':%'
`;
