export type AssetStatus = 'ACTIVE' | 'INACTIVE';

/** Catálogo de ativos suportados. `scale` = casas decimais (menor unidade). */
export class Asset {
  private constructor(
    readonly symbol: string,
    readonly name: string,
    readonly scale: number,
    readonly status: AssetStatus,
  ) {}

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  static reconstitute(params: {
    symbol: string;
    name: string;
    scale: number;
    status: AssetStatus;
  }): Asset {
    return new Asset(params.symbol, params.name, params.scale, params.status);
  }
}
