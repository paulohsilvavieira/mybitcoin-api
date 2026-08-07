import { Wallet } from '@/modules/financial/domain/entities';

export abstract class WalletReadRepository {
  abstract findAllByUserId(userId: string): Promise<Wallet[]>;
}
