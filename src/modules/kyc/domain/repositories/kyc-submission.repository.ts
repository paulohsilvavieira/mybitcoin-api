import { KycSubmission } from '@/modules/kyc/domain/entities/kyc-submission.entity';

export abstract class KycSubmissionRepository {
  /** Persiste um registro de auditoria. Imutável — nunca UPDATE/DELETE. */
  abstract save(submission: KycSubmission): Promise<void>;
}
