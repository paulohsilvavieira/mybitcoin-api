import { KycStatus } from '@/modules/kyc/domain/value-objects/kyc-status.vo';
import { KycSnapshot } from '@/modules/kyc/domain/kyc-snapshot';
import { KycAlreadyApprovedError } from '@/modules/kyc/domain/errors/kyc-already-approved.error';

/**
 * Aggregate root do KYC de um usuário. Um por usuário.
 *
 * `NOT_SUBMITTED` é o estado lógico quando ainda não há linha persistida —
 * representado por `KycProfile.notSubmitted(userId)`.
 */
export class KycProfile {
  private constructor(
    readonly userId: string,
    private _status: KycStatus,
    private _snapshot: KycSnapshot | null,
    private _rejectionReason: string | null,
    private _approvedAt: Date | null,
    readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static notSubmitted(userId: string): KycProfile {
    const now = new Date();
    return new KycProfile(
      userId,
      KycStatus.notSubmitted(),
      null,
      null,
      null,
      now,
      now,
    );
  }

  static reconstitute(params: {
    userId: string;
    status: KycStatus;
    snapshot: KycSnapshot | null;
    rejectionReason: string | null;
    approvedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): KycProfile {
    return new KycProfile(
      params.userId,
      params.status,
      params.snapshot,
      params.rejectionReason,
      params.approvedAt,
      params.createdAt,
      params.updatedAt,
    );
  }

  get status(): KycStatus {
    return this._status;
  }

  get snapshot(): KycSnapshot | null {
    return this._snapshot;
  }

  get rejectionReason(): string | null {
    return this._rejectionReason;
  }

  get approvedAt(): Date | null {
    return this._approvedAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  /** Invariante: KYC aprovado é terminal. */
  assertCanSubmit(): void {
    if (this._status.isApproved()) {
      throw new KycAlreadyApprovedError(this.userId);
    }
  }

  approve(snapshot: KycSnapshot, at: Date = new Date()): void {
    this.assertCanSubmit();
    this._status = KycStatus.approved();
    this._snapshot = snapshot;
    this._rejectionReason = null;
    this._approvedAt = at;
    this._updatedAt = new Date();
  }

  reject(snapshot: KycSnapshot, reason: string): void {
    this.assertCanSubmit();
    this._status = KycStatus.rejected();
    this._snapshot = snapshot;
    this._rejectionReason = reason;
    this._approvedAt = null;
    this._updatedAt = new Date();
  }
}
