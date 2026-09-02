export function findKycProfileByUserIdQuery(userId: string): {
  query: string;
  values: unknown[];
} {
  const query = `
    SELECT user_id, status, rejection_reason, full_name, cpf_hash, cpf_encrypted,
           cpf_last_digits, to_char(birth_date, 'YYYY-MM-DD') AS birth_date,
           nationality, approved_at, created_at, updated_at
    FROM kyc_profiles
    WHERE user_id = $1
  `;
  return { query, values: [userId] };
}

export function existsApprovedByCpfHashQuery(
  cpfHash: string,
  exceptUserId: string,
): { query: string; values: unknown[] } {
  const query = `
    SELECT 1
    FROM kyc_profiles
    WHERE cpf_hash = $1 AND status = 'APPROVED' AND user_id <> $2
    LIMIT 1
  `;
  return { query, values: [cpfHash, exceptUserId] };
}

export function upsertKycProfileQuery(params: {
  userId: string;
  status: string;
  rejectionReason: string | null;
  fullName: string;
  cpfHash: string;
  cpfEncrypted: string;
  cpfLastDigits: string;
  birthDate: string;
  nationality: string;
  approvedAt: Date | null;
  updatedAt: Date;
}): { query: string; values: unknown[] } {
  const query = `
    INSERT INTO kyc_profiles (
      user_id, status, rejection_reason, full_name, cpf_hash, cpf_encrypted,
      cpf_last_digits, birth_date, nationality, approved_at, updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (user_id) DO UPDATE SET
      status           = EXCLUDED.status,
      rejection_reason = EXCLUDED.rejection_reason,
      full_name        = EXCLUDED.full_name,
      cpf_hash         = EXCLUDED.cpf_hash,
      cpf_encrypted    = EXCLUDED.cpf_encrypted,
      cpf_last_digits  = EXCLUDED.cpf_last_digits,
      birth_date       = EXCLUDED.birth_date,
      nationality      = EXCLUDED.nationality,
      approved_at      = EXCLUDED.approved_at,
      updated_at       = EXCLUDED.updated_at
  `;
  return {
    query,
    values: [
      params.userId,
      params.status,
      params.rejectionReason,
      params.fullName,
      params.cpfHash,
      params.cpfEncrypted,
      params.cpfLastDigits,
      params.birthDate,
      params.nationality,
      params.approvedAt,
      params.updatedAt,
    ],
  };
}
