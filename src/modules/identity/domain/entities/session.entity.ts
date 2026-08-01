import { SessionId } from '@/modules/identity/domain/value-objects/session-id.vo';

const ABSOLUTE_TTL_MS = 24 * 60 * 60 * 1000;
const IDLE_TTL_MS = 30 * 60 * 1000;

export class Session {
  private constructor(
    readonly id: SessionId,
    readonly userId: string,
    readonly tokenHash: string,
    readonly deviceInfo: string,
    readonly ipAddress: string,
    readonly createdAt: Date,
    private _lastActivityAt: Date,
    readonly expiresAt: Date,
    private _revokedAt: Date | null,
  ) {}

  get lastActivityAt(): Date {
    return this._lastActivityAt;
  }

  get revokedAt(): Date | null {
    return this._revokedAt;
  }

  isActive(now: Date = new Date()): boolean {
    if (this._revokedAt !== null) return false;
    if (now > this.expiresAt) return false;
    if (now.getTime() - this._lastActivityAt.getTime() > IDLE_TTL_MS)
      return false;
    return true;
  }

  revoke(now: Date = new Date()): void {
    if (this._revokedAt !== null) return;
    this._revokedAt = now;
  }

  touch(now: Date = new Date()): void {
    this._lastActivityAt = now;
  }

  static create(params: {
    userId: string;
    tokenHash: string;
    deviceInfo: string;
    ipAddress: string;
  }): Session {
    const now = new Date();
    return new Session(
      SessionId.create(),
      params.userId,
      params.tokenHash,
      params.deviceInfo,
      params.ipAddress,
      now,
      now,
      new Date(now.getTime() + ABSOLUTE_TTL_MS),
      null,
    );
  }

  static reconstitute(params: {
    id: SessionId;
    userId: string;
    tokenHash: string;
    deviceInfo: string;
    ipAddress: string;
    createdAt: Date;
    lastActivityAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
  }): Session {
    return new Session(
      params.id,
      params.userId,
      params.tokenHash,
      params.deviceInfo,
      params.ipAddress,
      params.createdAt,
      params.lastActivityAt,
      params.expiresAt,
      params.revokedAt,
    );
  }
}
