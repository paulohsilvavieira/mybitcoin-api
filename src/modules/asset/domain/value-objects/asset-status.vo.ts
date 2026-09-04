export type AssetStatusType = 'ACTIVE' | 'INACTIVE';

export class AssetStatus {
  private constructor(private readonly value: AssetStatusType) {}

  static active(): AssetStatus {
    return new AssetStatus('ACTIVE');
  }

  static inactive(): AssetStatus {
    return new AssetStatus('INACTIVE');
  }

  static from(value: AssetStatusType): AssetStatus {
    return new AssetStatus(value);
  }

  isActive(): boolean {
    return this.value === 'ACTIVE';
  }

  isInactive(): boolean {
    return this.value === 'INACTIVE';
  }

  toString(): AssetStatusType {
    return this.value;
  }
}
