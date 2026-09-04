import { QueryExecutor } from '@/infrastructure/database/query-executor';
import { AssetRepository } from '@/modules/wallets/domain/repositories';
import { Asset } from '@/modules/wallets/domain/entities/asset.entity';
import {
  AssetMapper,
  AssetRow,
} from '@/modules/wallets/infrastructure/persistence/asset.mapper';
import {
  FIND_ASSET_BY_SYMBOL,
  LIST_ACTIVE_ASSETS,
} from '@/modules/wallets/infrastructure/persistence/asset.sql';

export class PgAssetRepository extends AssetRepository {
  constructor(private readonly db: QueryExecutor) {
    super();
  }

  async findBySymbol(symbol: string): Promise<Asset | null> {
    const result = await this.db.query<AssetRow>(FIND_ASSET_BY_SYMBOL, [
      symbol,
    ]);
    return result.rows.length ? AssetMapper.toDomain(result.rows[0]) : null;
  }

  async listActive(): Promise<Asset[]> {
    const result = await this.db.query<AssetRow>(LIST_ACTIVE_ASSETS);
    return result.rows.map((row) => AssetMapper.toDomain(row));
  }
}
