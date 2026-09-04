import { Asset } from '@/modules/wallets/domain/entities/asset.entity';

export abstract class AssetReadRepository {
  abstract findBySymbol(symbol: string): Promise<Asset | null>;
  abstract listActive(): Promise<Asset[]>;
}
