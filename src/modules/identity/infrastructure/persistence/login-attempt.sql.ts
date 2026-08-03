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
 * Falhas desde o último sucesso (ou desde sempre, se nunca houve sucesso).
 * A fronteira usa `seq` (BIGSERIAL, ordem estritamente monotônica atribuída
 * pelo Postgres no INSERT), não `created_at` — `created_at` vem de `new
 * Date()` em JS (resolução de milissegundo) e duas tentativas em sequência
 * rápida podem empatar, fazendo a comparação por timestamp descartar uma
 * falha por engano. `MAX(created_at)` entre as falhas continua sendo o
 * instante real que a LoginLockoutPolicy usa para calcular `lockedUntil`
 * (ver login-lockout-policy.ts) — só a fronteira "desde quando contar" usa
 * `seq`, o valor de tempo em si continua sendo o relógio de parede.
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
      AND seq > COALESCE(
        (SELECT MAX(seq) FROM login_attempts WHERE email = $1 AND successful = TRUE),
        0
      )
  `;
  return { query, values: [email] };
}
