export function insertPasswordResetRequestQuery(params: {
  email: string;
  ipAddress: string;
  userFound: boolean;
  createdAt: Date;
}): { query: string; values: unknown[] } {
  // id é gerado pelo default gen_random_uuid() da coluna.
  const query = `
    INSERT INTO password_reset_requests (email, ip_address, user_found, created_at)
    VALUES ($1, $2, $3, $4)
  `;
  return {
    query,
    values: [
      params.email,
      params.ipAddress,
      params.userFound,
      params.createdAt,
    ],
  };
}

/**
 * Quantas solicitações foram registradas para este e-mail normalizado desde
 * `since`. Rate-limit por e-mail (3 / 15 min), derivado por query.
 */
export function countPasswordResetRequestsSinceQuery(
  email: string,
  since: Date,
): { query: string; values: unknown[] } {
  const query = `
    SELECT COUNT(*)::int AS count
    FROM password_reset_requests
    WHERE email = $1
      AND created_at >= $2
  `;
  return { query, values: [email, since] };
}
