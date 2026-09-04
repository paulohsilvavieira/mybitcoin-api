export const FIND_TRANSACTION_BY_ID = `
  SELECT id, operation, reference_type, reference_id, created_at
  FROM transactions
  WHERE id = $1
`;

export const FIND_TRANSACTION_BY_REFERENCE = `
  SELECT id, operation, reference_type, reference_id, created_at
  FROM transactions
  WHERE reference_type = $1 AND reference_id = $2 AND operation = $3
`;

export const INSERT_TRANSACTION = `
  INSERT INTO transactions (id, operation, reference_type, reference_id, created_at)
  VALUES ($1, $2, $3, $4, $5)
`;
