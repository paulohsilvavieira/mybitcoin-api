import { WalletReadRepository } from '@/modules/wallets/domain/repositories';

export interface WalletBalanceView {
  asset: string;
  scale: number;
  availableMinor: bigint;
  lockedMinor: bigint;
  totalMinor: bigint;
}

/**
 * Leitura na réplica (ADR 0003). Se o usuário ainda não tem carteira/saldos,
 * retorna lista vazia — o provisionamento lazy acontece na primeira primitiva de
 * escrita (evita write-on-read na réplica).
 */
export class GetWalletBalancesUseCase {
  constructor(private readonly walletReadRepo: WalletReadRepository) {}

  async execute(input: { userId: string }): Promise<WalletBalanceView[]> {
    const balances = await this.walletReadRepo.listBalancesByUserId(
      input.userId,
    );
    return balances.map((balance) => ({
      asset: balance.asset,
      scale: balance.scale,
      availableMinor: balance.availableMinor,
      lockedMinor: balance.lockedMinor,
      totalMinor: balance.totalMinor,
    }));
  }
}
