import { Wallet } from '@/modules/financial/domain/entities';
import { WalletReadRepository } from '@/modules/financial/domain/repositories';

export class GetBalancesUseCase {
  constructor(private readonly walletReadRepo: WalletReadRepository) {}

  async execute(input: { userId: string }): Promise<Wallet[]> {
    return this.walletReadRepo.findAllByUserId(input.userId);
  }
}
