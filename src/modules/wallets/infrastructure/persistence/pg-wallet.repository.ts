import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { WalletRepository } from '@/modules/wallets/domain/repositories';
import { Wallet } from '@/modules/wallets/domain/entities/wallet.entity';
import {
  WalletMapper,
  WalletRow,
} from '@/modules/wallets/infrastructure/persistence/wallet.mapper';
import {
  FIND_WALLET_BY_USER_ID,
  INSERT_WALLET_IF_NOT_EXISTS,
} from '@/modules/wallets/infrastructure/persistence/wallet.sql';

export class PgWalletRepository extends WalletRepository {
  constructor(private readonly db: QueryExecutor) {
    super();
  }

  async findByUserId(userId: string): Promise<Wallet | null> {
    const result = await this.db.query<WalletRow>(FIND_WALLET_BY_USER_ID, [
      userId,
    ]);
    return result.rows.length ? WalletMapper.toDomain(result.rows[0]) : null;
  }

  async insertIfNotExists(wallet: Wallet): Promise<void> {
    await this.db.query(INSERT_WALLET_IF_NOT_EXISTS, [
      wallet.id,
      wallet.userId,
      wallet.createdAt,
      wallet.updatedAt,
    ]);
  }
}
