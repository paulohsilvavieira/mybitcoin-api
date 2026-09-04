import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import { WalletReadRepository } from '@/modules/wallets/domain/repositories';
import { Wallet } from '@/modules/wallets/domain/entities/wallet.entity';
import { Balance } from '@/modules/wallets/domain/entities/balance.entity';
import {
  WalletMapper,
  WalletRow,
} from '@/modules/wallets/infrastructure/persistence/wallet.mapper';
import {
  BalanceMapper,
  BalanceRow,
} from '@/modules/wallets/infrastructure/persistence/balance.mapper';
import {
  FIND_WALLET_BY_USER_ID,
  LIST_BALANCES_BY_USER_ID,
} from '@/modules/wallets/infrastructure/persistence/wallet.sql';

export class PgWalletReadRepository extends WalletReadRepository {
  constructor(private readonly db: ReadQueryExecutor) {
    super();
  }

  async findByUserId(userId: string): Promise<Wallet | null> {
    const result = await this.db.query<WalletRow>(FIND_WALLET_BY_USER_ID, [
      userId,
    ]);
    return result.rows.length ? WalletMapper.toDomain(result.rows[0]) : null;
  }

  async listBalancesByUserId(userId: string): Promise<Balance[]> {
    const result = await this.db.query<BalanceRow>(LIST_BALANCES_BY_USER_ID, [
      userId,
    ]);
    return result.rows.map((row) => BalanceMapper.toDomain(row));
  }
}
