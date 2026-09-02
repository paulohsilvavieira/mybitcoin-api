import { PgKycStatusReadRepository } from '@/modules/kyc/infrastructure/persistence/pg-kyc-status-read.repository';
import { KycStatusReadRepository } from '@/modules/kyc/domain/repositories/kyc-status-read.repository';

const mockDb = {
  query: jest.fn(),
};

describe('PgKycStatusReadRepository', () => {
  let repository: PgKycStatusReadRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PgKycStatusReadRepository(mockDb);
  });

  it('extends the domain KycStatusReadRepository', () => {
    expect(repository).toBeInstanceOf(KycStatusReadRepository);
  });

  describe('findStatusByUserId', () => {
    it('returns APPROVED from the row', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ status: 'APPROVED' }] });

      await expect(repository.findStatusByUserId('user-1')).resolves.toBe(
        'APPROVED',
      );
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('returns REJECTED from the row', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [{ status: 'REJECTED' }] });

      await expect(repository.findStatusByUserId('user-1')).resolves.toBe(
        'REJECTED',
      );
    });

    it('returns null when the user has no persisted profile', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        repository.findStatusByUserId('missing'),
      ).resolves.toBeNull();
    });
  });

  it('never declares a mutation method (save/delete/update)', () => {
    const readOnlyMethods = Object.getOwnPropertyNames(
      KycStatusReadRepository.prototype,
    );

    expect(readOnlyMethods).not.toEqual(
      expect.arrayContaining(['save', 'delete', 'update']),
    );
  });
});
