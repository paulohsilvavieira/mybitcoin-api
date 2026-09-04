export function findUserByIdQuery(id: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT id, name, email, password_hash, status, email_verified,
           terms_accepted, registration_ip, created_at, updated_at,
           email_verification_token_hash, email_verification_expires_at,
           email_verification_last_sent_at
    FROM users
    WHERE id = $1
  `;
  return { query, values: [id] };
}

export function findUserByEmailQuery(email: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT id, name, email, password_hash, status, email_verified,
           terms_accepted, registration_ip, created_at, updated_at,
           email_verification_token_hash, email_verification_expires_at,
           email_verification_last_sent_at
    FROM users
    WHERE email = $1
  `;
  return { query, values: [email] };
}

export function findUserByEmailVerificationTokenHashQuery(tokenHash: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT id, name, email, password_hash, status, email_verified,
           terms_accepted, registration_ip, created_at, updated_at,
           email_verification_token_hash, email_verification_expires_at,
           email_verification_last_sent_at
    FROM users
    WHERE email_verification_token_hash = $1
  `;
  return { query, values: [tokenHash] };
}

export function saveUserQuery(params: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  status: string;
  emailVerified: boolean;
  termsAccepted: boolean;
  registrationIp: string;
  createdAt: Date;
  updatedAt: Date;
  emailVerificationTokenHash: string | null;
  emailVerificationExpiresAt: Date | null;
  emailVerificationLastSentAt: Date | null;
}): { query: string; values: unknown[] } {
  const query = `
    INSERT INTO users (id, name, email, password_hash, status, email_verified,
                       terms_accepted, registration_ip, created_at, updated_at,
                       email_verification_token_hash, email_verification_expires_at,
                       email_verification_last_sent_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (id) DO UPDATE SET
      name = $2,
      status = $5,
      email_verified = $6,
      updated_at = $10,
      email_verification_token_hash = $11,
      email_verification_expires_at = $12,
      email_verification_last_sent_at = $13
  `;
  return {
    query,
    values: [
      params.id,
      params.name,
      params.email,
      params.passwordHash,
      params.status,
      params.emailVerified,
      params.termsAccepted,
      params.registrationIp,
      params.createdAt,
      params.updatedAt,
      params.emailVerificationTokenHash,
      params.emailVerificationExpiresAt,
      params.emailVerificationLastSentAt,
    ],
  };
}

export function issueEmailVerificationTokenIfDueQuery(params: {
  email: string;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
  cooldownThreshold: Date;
}): { query: string; values: unknown[] } {
  const query = `
    UPDATE users
    SET email_verification_token_hash = $1,
        email_verification_expires_at = $2,
        email_verification_last_sent_at = $3,
        updated_at = $3
    WHERE email = $4
      AND status = 'PENDING_EMAIL_VERIFICATION'
      AND (email_verification_last_sent_at IS NULL
           OR email_verification_last_sent_at <= $5)
    RETURNING id, name, email, password_hash, status, email_verified,
              terms_accepted, registration_ip, created_at, updated_at,
              email_verification_token_hash, email_verification_expires_at,
              email_verification_last_sent_at
  `;
  return {
    query,
    values: [
      params.tokenHash,
      params.expiresAt,
      params.now,
      params.email,
      params.cooldownThreshold,
    ],
  };
}
