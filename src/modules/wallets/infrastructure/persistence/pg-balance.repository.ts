import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { BalanceRepository } from '@/modules/wallets/domain/repositories';
import { Balance } from '@/modules/wallets/domain/entities/balance.entity';
import {
  BalanceMapper,
  BalanceRow,
} from '@/modules/wallets/infrastructure/persistence/balance.mapper';
import {
  FIND_BALANCE_FOR_UPDATE,
  INSERT_BALANCE_IF_NOT_EXISTS,
  UPDATE_BALANCE,
} from '@/modules/wallets/infrastructure/persistence/balance.sql';

export class PgBalanceRepository extends BalanceRepository {
  constructor(private readonly db: QueryExecutor) {
    super();
  }

  async findForUpdate(
    walletId: string,
    asset: string,
  ): Promise<Balance | null> {
    const result = await this.db.query<BalanceRow>(FIND_BALANCE_FOR_UPDATE, [
      walletId,
      asset,
    ]);
    return result.rows.length ? BalanceMapper.toDomain(result.rows[0]) : null;
  }

  async insertZeroIfNotExists(walletId: string, asset: string): Promise<void> {
    await this.db.query(INSERT_BALANCE_IF_NOT_EXISTS, [walletId, asset]);
  }

  async save(balance: Balance): Promise<void> {
    await this.db.query(UPDATE_BALANCE, [
      balance.walletId,
      balance.asset,
      balance.availableMinor.toString(),
      balance.lockedMinor.toString(),
    ]);
  }
}
