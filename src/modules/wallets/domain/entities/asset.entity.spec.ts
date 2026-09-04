import { Asset } from '@/modules/wallets/domain/entities/asset.entity';

describe('Asset (catálogo)', () => {
  it('isActive() é true para status ACTIVE', () => {
    const btc = Asset.reconstitute({
      symbol: 'BTC',
      name: 'Bitcoin',
      scale: 8,
      status: 'ACTIVE',
    });
    expect(btc.isActive()).toBe(true);
    expect(btc.scale).toBe(8);
  });

  it('isActive() é false para status INACTIVE', () => {
    const inactive = Asset.reconstitute({
      symbol: 'XYZ',
      name: 'Desativado',
      scale: 2,
      status: 'INACTIVE',
    });
    expect(inactive.isActive()).toBe(false);
  });
});
