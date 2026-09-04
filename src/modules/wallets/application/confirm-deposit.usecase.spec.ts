import { ConfirmDepositUseCase } from '@/modules/wallets/application/confirm-deposit.usecase';
import { CreditUseCase } from '@/modules/wallets/application/credit.usecase';

describe('ConfirmDepositUseCase (interno, sem controller)', () => {
  it('credita via CreditUseCase com ref DEPOSIT + depositId', async () => {
    const execute = jest.fn().mockResolvedValue({ idempotent: false });
    const credit = { execute } as unknown as CreditUseCase;

    const sut = new ConfirmDepositUseCase(credit);

    await sut.execute({
      depositId: 'dep-42',
      userId: 'u1',
      asset: 'BTC',
      amountMinor: 50_000_000n,
    });

    expect(execute).toHaveBeenCalledWith({
      userId: 'u1',
      asset: 'BTC',
      amountMinor: 50_000_000n,
      reference: { referenceType: 'DEPOSIT', referenceId: 'dep-42' },
    });
  });
});
