export const FIND_ASSET_BY_SYMBOL = `
  SELECT symbol, name, scale, status
  FROM assets
  WHERE symbol = $1
`;

export const LIST_ACTIVE_ASSETS = `
  SELECT symbol, name, scale, status
  FROM assets
  WHERE status = 'ACTIVE'
  ORDER BY symbol
`;
