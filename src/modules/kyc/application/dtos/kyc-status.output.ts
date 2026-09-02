import { KycStatusType } from '@/modules/kyc/domain/value-objects/kyc-status.vo';

export interface KycStatusOutput {
  status: KycStatusType;
  /** Presentes apenas quando há submissão (status ≠ NOT_SUBMITTED). */
  fullName?: string;
  /** CPF mascarado: `***.***.**-XX`. */
  maskedCpf?: string;
  birthDate?: string;
  nationality?: string;
  /** Código do motivo quando status = REJECTED. */
  rejectionReason?: string;
  /** ISO — presente quando status = APPROVED. */
  approvedAt?: string;
}
