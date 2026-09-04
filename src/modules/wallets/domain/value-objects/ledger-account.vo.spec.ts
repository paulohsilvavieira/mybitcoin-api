import { LedgerAccount } from '@/modules/wallets/domain/value-objects/ledger-account.vo';

describe('LedgerAccount (VO)', () => {
  it('formata contas de usuário', () => {
    expect(LedgerAccount.userAvailable('u1', 'BTC').toString()).toBe(
      'USER_AVAILABLE:u1:BTC',
    );
    expect(LedgerAccount.userLocked('u1', 'BTC').toString()).toBe(
      'USER_LOCKED:u1:BTC',
    );
  });

  it('formata contas operacionais', () => {
    expect(LedgerAccount.treasury('BTC').toString()).toBe(
      'EXCHANGE:TREASURY:BTC',
    );
    expect(LedgerAccount.fees('BRL').toString()).toBe('EXCHANGE:FEES:BRL');
    expect(LedgerAccount.settlement('BRL').toString()).toBe('SETTLEMENT:BRL');
  });

  it('classifica isUserAccount / kind / userId / asset', () => {
    const avail = LedgerAccount.fromString('USER_AVAILABLE:u1:BTC');
    expect(avail.isUserAccount()).toBe(true);
    expect(avail.kind()).toBe('AVAILABLE');
    expect(avail.userId()).toBe('u1');
    expect(avail.asset()).toBe('BTC');

    const locked = LedgerAccount.fromString('USER_LOCKED:u1:BRL');
    expect(locked.kind()).toBe('LOCKED');

    const treasury = LedgerAccount.fromString('EXCHANGE:TREASURY:BTC');
    expect(treasury.isUserAccount()).toBe(false);
    expect(treasury.kind()).toBe('OPERATIONAL');
    expect(treasury.userId()).toBeNull();
    expect(treasury.asset()).toBe('BTC');
  });
});
