import { GetBalancesUseCase } from '@/modules/financial/application/get-balances.usecase';
import { Wallet } from '@/modules/financial/domain/entities';

describe('GetBalancesUseCase', () => {
  const mockWalletReadRepo = {
    findAllByUserId: jest.fn(),
  };

  let useCase: GetBalancesUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new GetBalancesUseCase(mockWalletReadRepo);
  });

  it('returns the wallets for a user with wallets', async () => {
    const wallet = Wallet.restore({
      id: 'wallet-1',
      userId: 'user-123',
      asset: 'BTC',
      availableSatoshi: 100_000n,
      lockedSatoshi: 5_000n,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockWalletReadRepo.findAllByUserId.mockResolvedValue([wallet]);

    const result = await useCase.execute({ userId: 'user-123' });

    expect(mockWalletReadRepo.findAllByUserId).toHaveBeenCalledWith('user-123');
    expect(result).toEqual([wallet]);
    expect(result[0].totalSatoshi).toBe(105_000n);
  });

  it('returns an empty list when the user has no wallets', async () => {
    mockWalletReadRepo.findAllByUserId.mockResolvedValue([]);

    const result = await useCase.execute({ userId: 'user-123' });

    expect(result).toEqual([]);
  });
});
