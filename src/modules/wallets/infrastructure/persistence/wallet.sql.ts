export const FIND_WALLET_BY_USER_ID = `
  SELECT id, user_id, created_at, updated_at
  FROM wallets
  WHERE user_id = $1
`;

export const INSERT_WALLET_IF_NOT_EXISTS = `
  INSERT INTO wallets (id, user_id, created_at, updated_at)
  VALUES ($1, $2, $3, $4)
  ON CONFLICT (user_id) DO NOTHING
`;

export const LIST_BALANCES_BY_USER_ID = `
  SELECT b.wallet_id, b.asset, a.scale, b.available_minor, b.locked_minor
  FROM balances b
  JOIN wallets w ON w.id = b.wallet_id
  JOIN assets  a ON a.symbol = b.asset
  WHERE w.user_id = $1
  ORDER BY b.asset
`;
