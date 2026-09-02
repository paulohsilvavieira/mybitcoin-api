import { PgKycSubmissionRepository } from '@/modules/kyc/infrastructure/persistence/pg-kyc-submission.repository';
import { KycSubmissionRepository } from '@/modules/kyc/domain/repositories/kyc-submission.repository';
import { KycSubmission } from '@/modules/kyc/domain/entities/kyc-submission.entity';
import { KycSnapshot } from '@/modules/kyc/domain/kyc-snapshot';

const mockDb = {
  query: jest.fn(),
};

const snapshot: KycSnapshot = {
  fullName: 'Ada Lovelace',
  cpfHash: 'hash-abc',
  cpfEncrypted: 'enc-abc',
  cpfLastDigits: '35',
  birthDate: '1990-05-20',
  nationality: 'BR',
};

describe('PgKycSubmissionRepository', () => {
  let repository: PgKycSubmissionRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PgKycSubmissionRepository(mockDb);
  });

  it('extends the domain KycSubmissionRepository', () => {
    expect(repository).toBeInstanceOf(KycSubmissionRepository);
  });

  it('issues one INSERT with the mapped submission values', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    const submission = KycSubmission.approved({
      userId: 'user-1',
      snapshot,
      submittedIp: '10.0.0.1',
    });

    await repository.save(submission);

    expect(mockDb.query).toHaveBeenCalledTimes(1);
    const [sql, values] = mockDb.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO kyc_submissions/);
    expect(values).toEqual([
      submission.id,
      'user-1',
      'APPROVED',
      null,
      'Ada Lovelace',
      'hash-abc',
      'enc-abc',
      '35',
      '1990-05-20',
      'BR',
      '10.0.0.1',
      submission.createdAt,
    ]);
  });
});
