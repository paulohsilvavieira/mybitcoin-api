import {
  Asset,
  AssetStatus,
} from '@/modules/wallets/domain/entities/asset.entity';

export interface AssetRow {
  symbol: string;
  name: string;
  scale: number;
  status: string;
}

export class AssetMapper {
  static toDomain(row: AssetRow): Asset {
    return Asset.reconstitute({
      symbol: row.symbol,
      name: row.name,
      scale: Number(row.scale),
      status: row.status as AssetStatus,
    });
  }
}
