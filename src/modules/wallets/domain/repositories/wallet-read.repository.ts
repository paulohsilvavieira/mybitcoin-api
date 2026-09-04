import { Wallet } from '@/modules/wallets/domain/entities/wallet.entity';
import { Balance } from '@/modules/wallets/domain/entities/balance.entity';

export abstract class WalletReadRepository {
  abstract findByUserId(userId: string): Promise<Wallet | null>;
  /** Saldos do usuário (join com `assets` para trazer `scale`). Vazio se não houver carteira. */
  abstract listBalancesByUserId(userId: string): Promise<Balance[]>;
}
