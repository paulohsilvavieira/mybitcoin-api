import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { KycSubmissionRepository } from '@/modules/kyc/domain/repositories/kyc-submission.repository';
import { KycSubmission } from '@/modules/kyc/domain/entities/kyc-submission.entity';
import { saveKycSubmissionQuery } from '@/modules/kyc/infrastructure/persistence/kyc-submission.sql';

export class PgKycSubmissionRepository extends KycSubmissionRepository {
  constructor(private readonly db: QueryExecutor) {
    super();
  }

  async save(submission: KycSubmission): Promise<void> {
    const { snapshot } = submission;
    const { query, values } = saveKycSubmissionQuery({
      id: submission.id,
      userId: submission.userId,
      result: submission.result,
      rejectionReason: submission.rejectionReason,
      fullName: snapshot.fullName,
      cpfHash: snapshot.cpfHash,
      cpfEncrypted: snapshot.cpfEncrypted,
      cpfLastDigits: snapshot.cpfLastDigits,
      birthDate: snapshot.birthDate,
      nationality: snapshot.nationality,
      submittedIp: submission.submittedIp,
      createdAt: submission.createdAt,
    });
    await this.db.query(query, values);
  }
}
