import { KycSnapshot } from '@/modules/kyc/domain/kyc-snapshot';

export type KycSubmissionResult = 'APPROVED' | 'REJECTED';

/**
 * Registro imutável de auditoria de uma tentativa de submissão de KYC (KYC-006).
 * Uma linha por tentativa — aprovada ou rejeitada. Nunca alterada após criada.
 */
export class KycSubmission {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly result: KycSubmissionResult,
    readonly rejectionReason: string | null,
    readonly snapshot: KycSnapshot,
    readonly submittedIp: string,
    readonly createdAt: Date,
  ) {}

  static approved(params: {
    userId: string;
    snapshot: KycSnapshot;
    submittedIp: string;
  }): KycSubmission {
    return new KycSubmission(
      crypto.randomUUID(),
      params.userId,
      'APPROVED',
      null,
      params.snapshot,
      params.submittedIp,
      new Date(),
    );
  }

  static rejected(params: {
    userId: string;
    reason: string;
    snapshot: KycSnapshot;
    submittedIp: string;
  }): KycSubmission {
    return new KycSubmission(
      crypto.randomUUID(),
      params.userId,
      'REJECTED',
      params.reason,
      params.snapshot,
      params.submittedIp,
      new Date(),
    );
  }

  static reconstitute(params: {
    id: string;
    userId: string;
    result: KycSubmissionResult;
    rejectionReason: string | null;
    snapshot: KycSnapshot;
    submittedIp: string;
    createdAt: Date;
  }): KycSubmission {
    return new KycSubmission(
      params.id,
      params.userId,
      params.result,
      params.rejectionReason,
      params.snapshot,
      params.submittedIp,
      params.createdAt,
    );
  }
}
