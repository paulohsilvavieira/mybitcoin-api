import { Wallet } from '@/modules/wallets/domain/entities/wallet.entity';

export abstract class WalletRepository {
  abstract findByUserId(userId: string): Promise<Wallet | null>;
  /** Provisionamento lazy: cria a carteira só se ainda não existir (ON CONFLICT DO NOTHING). */
  abstract insertIfNotExists(wallet: Wallet): Promise<void>;
}
