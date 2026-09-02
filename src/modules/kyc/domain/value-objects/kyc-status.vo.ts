export type KycStatusType = 'NOT_SUBMITTED' | 'APPROVED' | 'REJECTED';

/**
 * Estado do KYC de um usuário.
 * Transições válidas: NOT_SUBMITTED → APPROVED | REJECTED ; REJECTED → APPROVED | REJECTED.
 * APPROVED é terminal.
 */
export class KycStatus {
  private constructor(private readonly value: KycStatusType) {}

  static notSubmitted(): KycStatus {
    return new KycStatus('NOT_SUBMITTED');
  }

  static approved(): KycStatus {
    return new KycStatus('APPROVED');
  }

  static rejected(): KycStatus {
    return new KycStatus('REJECTED');
  }

  static from(value: KycStatusType): KycStatus {
    return new KycStatus(value);
  }

  isNotSubmitted(): boolean {
    return this.value === 'NOT_SUBMITTED';
  }

  isApproved(): boolean {
    return this.value === 'APPROVED';
  }

  isRejected(): boolean {
    return this.value === 'REJECTED';
  }

  toString(): KycStatusType {
    return this.value;
  }
}
