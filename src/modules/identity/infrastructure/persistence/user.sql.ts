export function findUserByIdQuery(id: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT id, name, email, password_hash, status, email_verified, 
           terms_accepted, registration_ip, created_at, updated_at
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
           terms_accepted, registration_ip, created_at, updated_at
    FROM users
    WHERE email = $1
  `;
  return { query, values: [email] };
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
}): { query: string; values: unknown[] } {
  const query = `
    INSERT INTO users (id, name, email, password_hash, status, email_verified,
                       terms_accepted, registration_ip, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (id) DO UPDATE SET
      name = $2,
      status = $5,
      email_verified = $6,
      updated_at = $10
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
    ],
  };
}
