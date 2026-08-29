import { PasswordResetToken } from '@/modules/identity/domain/entities/password-reset-token.entity';

export interface PasswordResetTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  requested_ip: string;
  created_at: Date;
  expires_at: Date;
  consumed_at: Date | null;
}

export class PasswordResetTokenMapper {
  static toDomain(row: PasswordResetTokenRow): PasswordResetToken {
    return PasswordResetToken.reconstitute({
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      requestedIp: row.requested_ip,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
    });
  }

  static toRow(token: PasswordResetToken): {
    id: string;
    userId: string;
    tokenHash: string;
    requestedIp: string;
    createdAt: Date;
    expiresAt: Date;
    consumedAt: Date | null;
  } {
    return {
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      requestedIp: token.requestedIp,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      consumedAt: token.consumedAt,
    };
  }
}
