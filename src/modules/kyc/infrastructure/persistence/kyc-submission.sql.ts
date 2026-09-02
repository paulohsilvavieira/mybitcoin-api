export function saveKycSubmissionQuery(params: {
  id: string;
  userId: string;
  result: string;
  rejectionReason: string | null;
  fullName: string;
  cpfHash: string;
  cpfEncrypted: string;
  cpfLastDigits: string;
  birthDate: string;
  nationality: string;
  submittedIp: string;
  createdAt: Date;
}): { query: string; values: unknown[] } {
  const query = `
    INSERT INTO kyc_submissions (
      id, user_id, result, rejection_reason, full_name, cpf_hash, cpf_encrypted,
      cpf_last_digits, birth_date, nationality, submitted_ip, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `;
  return {
    query,
    values: [
      params.id,
      params.userId,
      params.result,
      params.rejectionReason,
      params.fullName,
      params.cpfHash,
      params.cpfEncrypted,
      params.cpfLastDigits,
      params.birthDate,
      params.nationality,
      params.submittedIp,
      params.createdAt,
    ],
  };
}
