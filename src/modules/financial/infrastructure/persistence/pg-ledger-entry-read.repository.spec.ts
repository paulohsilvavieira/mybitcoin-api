import { PgLedgerEntryReadRepository } from '@/modules/financial/infrastructure/persistence/pg-ledger-entry-read.repository';
import { LedgerEntryReadRepository } from '@/modules/financial/domain/repositories';

const mockDb = {
  query: jest.fn(),
};

describe('PgLedgerEntryReadRepository', () => {
  let repository: PgLedgerEntryReadRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PgLedgerEntryReadRepository(mockDb);
  });

  describe('findByTransactionId', () => {
    it('delegates to the injected ReadQueryExecutor and maps every row', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'entry-1',
            transaction_id: 'tx-1',
            account: 'EXCHANGE:TREASURY:DEPOSIT',
            type: 'debit',
            amount_satoshi: '100000',
            created_at: new Date(),
          },
          {
            id: 'entry-2',
            transaction_id: 'tx-1',
            account: 'USER:acc-1:DEPOSIT',
            type: 'credit',
            amount_satoshi: '100000',
            created_at: new Date(),
          },
        ],
      });

      const entries = await repository.findByTransactionId('tx-1');

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(entries).toHaveLength(2);
      expect(entries[0].type).toBe('debit');
      expect(entries[1].amountSatoshi).toBe(100000n);
    });

    it('returns an empty array when there are no entries', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const entries = await repository.findByTransactionId('missing');

      expect(entries).toEqual([]);
    });
  });

  it('never declares a mutation method (save/delete/update)', () => {
    const readOnlyMethods = Object.getOwnPropertyNames(
      LedgerEntryReadRepository.prototype,
    );

    expect(readOnlyMethods).not.toEqual(
      expect.arrayContaining(['save', 'delete', 'update']),
    );
  });
});
