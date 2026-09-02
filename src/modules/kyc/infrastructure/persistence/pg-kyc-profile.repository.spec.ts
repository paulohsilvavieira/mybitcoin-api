import { PgKycProfileRepository } from '@/modules/kyc/infrastructure/persistence/pg-kyc-profile.repository';
import { KycProfileRepository } from '@/modules/kyc/domain/repositories/kyc-profile.repository';
import { KycProfile } from '@/modules/kyc/domain/entities/kyc-profile.entity';
import { CpfAlreadyInUseError } from '@/modules/kyc/domain/errors/cpf-already-in-use.error';
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

const profileRow = {
  user_id: 'user-1',
  status: 'APPROVED',
  rejection_reason: null,
  full_name: 'Ada Lovelace',
  cpf_hash: 'hash-abc',
  cpf_encrypted: 'enc-abc',
  cpf_last_digits: '35',
  birth_date: '1990-05-20',
  nationality: 'BR',
  approved_at: new Date(),
  created_at: new Date(),
  updated_at: new Date(),
};

function approvedProfile(): KycProfile {
  const profile = KycProfile.notSubmitted('user-1');
  profile.approve(snapshot, new Date());
  return profile;
}

describe('PgKycProfileRepository', () => {
  let repository: PgKycProfileRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PgKycProfileRepository(mockDb);
  });

  it('extends the domain KycProfileRepository', () => {
    expect(repository).toBeInstanceOf(KycProfileRepository);
  });

  describe('findByUserId', () => {
    it('maps the row into a KycProfile', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [profileRow] });

      const profile = await repository.findByUserId('user-1');

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(profile).not.toBeNull();
      expect(profile?.userId).toBe('user-1');
      expect(profile?.status.toString()).toBe('APPROVED');
      expect(profile?.snapshot?.cpfLastDigits).toBe('35');
      expect(profile?.snapshot?.birthDate).toBe('1990-05-20');
    });

    it('returns null when there is no persisted profile', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const profile = await repository.findByUserId('missing');

      expect(profile).toBeNull();
    });
  });

  describe('existsApprovedByCpfHash', () => {
    it('returns true when a row is found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

      const exists = await repository.existsApprovedByCpfHash(
        'hash-abc',
        'user-2',
      );

      expect(exists).toBe(true);
    });

    it('returns false when no row is found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const exists = await repository.existsApprovedByCpfHash(
        'hash-abc',
        'user-2',
      );

      expect(exists).toBe(false);
    });
  });

  describe('upsert', () => {
    it('issues a single query for an APPROVED profile', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await repository.upsert(approvedProfile());

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      const [, values] = mockDb.query.mock.calls[0];
      expect(values[0]).toBe('user-1');
      expect(values[1]).toBe('APPROVED');
    });

    it('translates the approved-cpf unique violation into CpfAlreadyInUseError', async () => {
      mockDb.query.mockRejectedValueOnce({
        code: '23505',
        constraint: 'idx_kyc_profiles_cpf_hash_approved',
      });

      await expect(repository.upsert(approvedProfile())).rejects.toBeInstanceOf(
        CpfAlreadyInUseError,
      );
    });

    it('rethrows any other database error untouched', async () => {
      const other = Object.assign(new Error('boom'), { code: '23503' });
      mockDb.query.mockRejectedValueOnce(other);

      await expect(repository.upsert(approvedProfile())).rejects.toBe(other);
    });
  });
});
