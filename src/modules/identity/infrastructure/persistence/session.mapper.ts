import { Session } from '@/modules/identity/domain/entities/session.entity';
import { SessionId } from '@/modules/identity/domain/value-objects/session-id.vo';

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  device_info: string;
  ip_address: string;
  created_at: Date;
  last_activity_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

export class SessionMapper {
  static toDomain(row: SessionRow): Session {
    return Session.reconstitute({
      id: SessionId.from(row.id),
      userId: row.user_id,
      tokenHash: row.token_hash,
      deviceInfo: row.device_info,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
      lastActivityAt: row.last_activity_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    });
  }

  static toRow(session: Session): {
    id: string;
    userId: string;
    tokenHash: string;
    deviceInfo: string;
    ipAddress: string;
    createdAt: Date;
    lastActivityAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
  } {
    return {
      id: session.id.toString(),
      userId: session.userId,
      tokenHash: session.tokenHash,
      deviceInfo: session.deviceInfo,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
    };
  }
}
