import { Asset } from '@/modules/wallets/domain/entities/asset.entity';

export abstract class AssetRepository {
  abstract findBySymbol(symbol: string): Promise<Asset | null>;
  abstract listActive(): Promise<Asset[]>;
}
