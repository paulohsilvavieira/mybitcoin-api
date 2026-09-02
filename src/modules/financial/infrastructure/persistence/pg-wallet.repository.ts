import { WalletRepository } from '@/modules/financial/domain/repositories';
import { Wallet } from '@/modules/financial/domain/entities';
import { QueryExecutor } from '@/infrastructure/database/query-executor';
import {
  creditWalletAvailableQuery,
  findWalletByUserIdAndAssetQuery,
} from '@/modules/financial/infrastructure/persistence/wallet.sql';

interface WalletRow {
  id: string;
  user_id: string;
  asset: string;
  available_satoshi: string;
  locked_satoshi: string;
  created_at: Date;
  updated_at: Date;
}

export class PgWalletRepository extends WalletRepository {
  constructor(private readonly db: QueryExecutor) {
    super();
  }

  async creditAvailable(params: {
    userId: string;
    asset: string;
    amountSatoshi: bigint;
  }): Promise<Wallet> {
    // Só é usado se a linha ainda não existir (caminho INSERT); em conflito,
    // o id existente da linha é preservado — ver wallet.sql.ts.
    const candidateId = crypto.randomUUID();
    const { query, values } = creditWalletAvailableQuery({
      candidateId,
      userId: params.userId,
      asset: params.asset,
      amountSatoshi: params.amountSatoshi.toString(),
    });
    const result = await this.db.query<WalletRow>(query, values);

    return this.toDomain(result.rows[0]);
  }

  async findByUserIdAndAsset(
    userId: string,
    asset: string,
  ): Promise<Wallet | null> {
    const { query, values } = findWalletByUserIdAndAssetQuery(userId, asset);
    const result = await this.db.query<WalletRow>(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    return this.toDomain(result.rows[0]);
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
