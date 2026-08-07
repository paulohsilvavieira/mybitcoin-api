// Incremento atômico SQL-side — cria a linha com available_satoshi = amountSatoshi
// se (user_id, asset) ainda não existe; soma amountSatoshi ao valor já persistido
// se existe. O `id` não é tocado pelo DO UPDATE: só "vence" quando a linha é
// criada pela primeira vez; em conflito, o id existente da linha é preservado.
export function creditWalletAvailableQuery(params: {
  candidateId: string;
  userId: string;
  asset: string;
  amountSatoshi: string;
}): { query: string; values: unknown[] } {
  const query = `
    INSERT INTO wallets (id, user_id, asset, available_satoshi, locked_satoshi, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 0, NOW(), NOW())
    ON CONFLICT (user_id, asset) DO UPDATE
      SET available_satoshi = wallets.available_satoshi + EXCLUDED.available_satoshi,
          updated_at = NOW()
    RETURNING *
  `;
  return {
    query,
    values: [
      params.candidateId,
      params.userId,
      params.asset,
      params.amountSatoshi,
    ],
  };
}

export function findWalletByUserIdAndAssetQuery(
  userId: string,
  asset: string,
): { query: string; values: unknown[] } {
  const query = `
    SELECT id, user_id, asset, available_satoshi, locked_satoshi, created_at, updated_at
    FROM wallets
    WHERE user_id = $1 AND asset = $2
  `;
  return { query, values: [userId, asset] };
}

export function findWalletsByUserIdQuery(userId: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT id, user_id, asset, available_satoshi, locked_satoshi, created_at, updated_at
    FROM wallets
    WHERE user_id = $1
  `;
  return { query, values: [userId] };
}
