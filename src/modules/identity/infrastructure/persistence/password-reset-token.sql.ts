export function insertPasswordResetTokenQuery(params: {
  id: string;
  userId: string;
  tokenHash: string;
  requestedIp: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
}): { query: string; values: unknown[] } {
  // GAP-4: ON CONFLICT no índice parcial UNIQUE (user_id) WHERE consumed_at IS
  // NULL. Em caso de corrida, o segundo INSERT é no-op (rowCount === 0) e o
  // repositório lança ActiveResetTokenExistsError.
  const query = `
    INSERT INTO password_reset_tokens (id, user_id, token_hash, requested_ip,
                                       created_at, expires_at, consumed_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id) WHERE consumed_at IS NULL DO NOTHING
  `;
  return {
    query,
    values: [
      params.id,
      params.userId,
      params.tokenHash,
      params.requestedIp,
      params.createdAt,
      params.expiresAt,
      params.consumedAt,
    ],
  };
}

export function consumePasswordResetTokenByIdQuery(
  id: string,
  consumedAt: Date,
): { query: string; values: unknown[] } {
  const query = `
    UPDATE password_reset_tokens
    SET consumed_at = $2
    WHERE id = $1
      AND consumed_at IS NULL
  `;
  return { query, values: [id, consumedAt] };
}

export function findPasswordResetTokenByHashQuery(tokenHash: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT id, user_id, token_hash, requested_ip, created_at, expires_at, consumed_at
    FROM password_reset_tokens
    WHERE token_hash = $1
  `;
  return { query, values: [tokenHash] };
}

/** REC-002 — invalida todos os tokens ativos do usuário antes de emitir um novo. */
export function consumeActivePasswordResetTokensForUserQuery(userId: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    UPDATE password_reset_tokens
    SET consumed_at = NOW()
    WHERE user_id = $1
      AND consumed_at IS NULL
  `;
  return { query, values: [userId] };
}
