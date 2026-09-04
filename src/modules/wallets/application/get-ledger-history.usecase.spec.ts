import { GetLedgerHistoryUseCase } from '@/modules/wallets/application/get-ledger-history.usecase';
import { LedgerEntryReadRepository } from '@/modules/wallets/domain/repositories';

describe('GetLedgerHistoryUseCase', () => {
  const findUserHistory = jest.fn().mockResolvedValue({ items: [], total: 0 });
  const repo = {
    findUserHistory,
    findByTransactionId: jest.fn(),
  } as unknown as LedgerEntryReadRepository;

  beforeEach(() => findUserHistory.mockClear());

  it('converte page/pageSize em limit/offset', async () => {
    const sut = new GetLedgerHistoryUseCase(repo);
    await sut.execute({ userId: 'u1', page: 3, pageSize: 20 });
    expect(findUserHistory).toHaveBeenCalledWith('u1', {
      limit: 20,
      offset: 40,
    });
  });

  it('faz clamp de pageSize a no máximo 100 e mínimo de page 1', async () => {
    const sut = new GetLedgerHistoryUseCase(repo);
    const result = await sut.execute({ userId: 'u1', page: 0, pageSize: 999 });
    expect(findUserHistory).toHaveBeenCalledWith('u1', {
      limit: 100,
      offset: 0,
    });
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(100);
  });
});
