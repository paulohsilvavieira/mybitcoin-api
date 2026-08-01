export function insertSessionQuery(params: {
  id: string;
  userId: string;
  tokenHash: string;
  deviceInfo: string;
  ipAddress: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}): { query: string; values: unknown[] } {
  const query = `
    INSERT INTO sessions (id, user_id, token_hash, device_info, ip_address,
                          created_at, last_activity_at, expires_at, revoked_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `;
  return {
    query,
    values: [
      params.id,
      params.userId,
      params.tokenHash,
      params.deviceInfo,
      params.ipAddress,
      params.createdAt,
      params.lastActivityAt,
      params.expiresAt,
      params.revokedAt,
    ],
  };
}

export function findSessionByIdQuery(id: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT id, user_id, token_hash, device_info, ip_address,
           created_at, last_activity_at, expires_at, revoked_at
    FROM sessions
    WHERE id = $1
  `;
  return { query, values: [id] };
}

export function findSessionByTokenHashQuery(tokenHash: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT id, user_id, token_hash, device_info, ip_address,
           created_at, last_activity_at, expires_at, revoked_at
    FROM sessions
    WHERE token_hash = $1
  `;
  return { query, values: [tokenHash] };
}

export function findNonExpiredSessionsByUserIdQuery(userId: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT id, user_id, token_hash, device_info, ip_address,
           created_at, last_activity_at, expires_at, revoked_at
    FROM sessions
    WHERE user_id = $1
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;
  return { query, values: [userId] };
}

export function revokeSessionQuery(sessionId: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    UPDATE sessions
    SET revoked_at = NOW()
    WHERE id = $1
      AND revoked_at IS NULL
  `;
  return { query, values: [sessionId] };
}

export function revokeAllSessionsQuery(userId: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    UPDATE sessions
    SET revoked_at = NOW()
    WHERE user_id = $1
      AND revoked_at IS NULL
  `;
  return { query, values: [userId] };
}

export function touchSessionQuery(
  sessionId: string,
  lastActivityAt: Date,
): { query: string; values: unknown[] } {
  const query = `
    UPDATE sessions
    SET last_activity_at = $2
    WHERE id = $1
  `;
  return { query, values: [sessionId, lastActivityAt] };
}
