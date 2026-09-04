import { Balance } from '@/modules/wallets/domain/entities/balance.entity';

export interface BalanceRow {
  wallet_id: string;
  asset: string;
  scale: number;
  available_minor: string;
  locked_minor: string;
}

export class BalanceMapper {
  static toDomain(row: BalanceRow): Balance {
    return Balance.reconstitute({
      walletId: row.wallet_id,
      asset: row.asset,
      scale: Number(row.scale),
      availableMinor: BigInt(row.available_minor),
      lockedMinor: BigInt(row.locked_minor),
    });
  }
}
