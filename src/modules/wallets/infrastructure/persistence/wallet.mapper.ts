import { Wallet } from '@/modules/wallets/domain/entities/wallet.entity';

export interface WalletRow {
  id: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
}

export class WalletMapper {
  static toDomain(row: WalletRow): Wallet {
    return Wallet.reconstitute({
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
