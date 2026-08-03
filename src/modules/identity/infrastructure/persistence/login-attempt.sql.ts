export function insertLoginAttemptQuery(params: {
  id: string;
  userId: string | null;
  email: string;
  ipAddress: string;
  successful: boolean;
  createdAt: Date;
}): { query: string; values: unknown[] } {
  const query = `
    INSERT INTO login_attempts (id, user_id, email, ip_address, successful, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
  `;
  return {
    query,
    values: [
      params.id,
      params.userId,
      params.email,
      params.ipAddress,
      params.successful,
      params.createdAt,
    ],
  };
}

/**
 * Falhas desde o último sucesso (ou desde sempre, se nunca houve sucesso) —
 * `COALESCE` com `-infinity` cobre o caso de nenhum login bem-sucedido ainda.
 * `MAX(created_at)` entre as falhas dá o instante que a LoginLockoutPolicy usa
 * para calcular `lockedUntil` (ver login-lockout-policy.ts).
 */
export function countFailedLoginAttemptsSinceLastSuccessQuery(email: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT COUNT(*)::int AS count, MAX(created_at) AS most_recent_failure_at
    FROM login_attempts
    WHERE email = $1
      AND successful = FALSE
      AND created_at > COALESCE(
        (SELECT MAX(created_at) FROM login_attempts WHERE email = $1 AND successful = TRUE),
        '-infinity'
      )
  `;
  return { query, values: [email] };
}
