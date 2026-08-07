import { WalletReadRepository } from '@/modules/financial/domain/repositories';
import { Wallet } from '@/modules/financial/domain/entities';
import { ReadQueryExecutor } from '@/infrastructure/database/read-query-executor';
import { findWalletsByUserIdQuery } from '@/modules/financial/infrastructure/persistence/wallet.sql';

interface WalletRow {
  id: string;
  user_id: string;
  asset: string;
  available_satoshi: string;
  locked_satoshi: string;
  created_at: Date;
  updated_at: Date;
}

export class PgWalletReadRepository extends WalletReadRepository {
  constructor(private readonly db: ReadQueryExecutor) {
    super();
  }

  async findAllByUserId(userId: string): Promise<Wallet[]> {
    const { query, values } = findWalletsByUserIdQuery(userId);
    const result = await this.db.query<WalletRow>(query, values);

    return result.rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: WalletRow): Wallet {
    return Wallet.restore({
      id: row.id,
      userId: row.user_id,
      asset: row.asset,
      availableSatoshi: BigInt(row.available_satoshi),
      lockedSatoshi: BigInt(row.locked_satoshi),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
