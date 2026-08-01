import { PgTransactionReadRepository } from '@/modules/financial/infrastructure/persistence/pg-transaction-read.repository';
import { TransactionReadRepository } from '@/modules/financial/domain/repositories';

const mockDb = {
  query: jest.fn(),
};

describe('PgTransactionReadRepository', () => {
  let repository: PgTransactionReadRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PgTransactionReadRepository(mockDb);
  });

  describe('findById', () => {
    it('delegates to the injected ReadQueryExecutor', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'tx-1',
            account_id: 'acc-1',
            type: 'deposit',
            amount_satoshi: '100000',
            status: 'confirmed',
            created_at: new Date(),
          },
        ],
      });

      const transaction = await repository.findById('tx-1');

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(transaction).not.toBeNull();
      expect(transaction?.accountId).toBe('acc-1');
      expect(transaction?.amountSatoshi).toBe(100000n);
    });

    it('returns null when the transaction does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const transaction = await repository.findById('missing');

      expect(transaction).toBeNull();
    });
  });

  it('never declares a mutation method (save/delete/update)', () => {
    const readOnlyMethods = Object.getOwnPropertyNames(
      TransactionReadRepository.prototype,
    );

    expect(readOnlyMethods).not.toEqual(
      expect.arrayContaining(['save', 'delete', 'update']),
    );
  });
});
