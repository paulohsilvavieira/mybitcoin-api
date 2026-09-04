export const FIND_BALANCE_FOR_UPDATE = `
  SELECT b.wallet_id, b.asset, a.scale, b.available_minor, b.locked_minor
  FROM balances b
  JOIN assets a ON a.symbol = b.asset
  WHERE b.wallet_id = $1 AND b.asset = $2
  FOR UPDATE OF b
`;

export const INSERT_BALANCE_IF_NOT_EXISTS = `
  INSERT INTO balances (wallet_id, asset, available_minor, locked_minor)
  VALUES ($1, $2, 0, 0)
  ON CONFLICT (wallet_id, asset) DO NOTHING
`;

export const UPDATE_BALANCE = `
  UPDATE balances
  SET available_minor = $3, locked_minor = $4, updated_at = NOW()
  WHERE wallet_id = $1 AND asset = $2
`;
