import { Wallet } from '@/modules/wallets/domain/entities/wallet.entity';

describe('Wallet (aggregate root)', () => {
  it('createForUser gera id UUID e amarra o userId', () => {
    const w = Wallet.createForUser('user-1');
    expect(w.userId).toBe('user-1');
    expect(w.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(w.createdAt).toBeInstanceOf(Date);
    expect(w.updatedAt).toBeInstanceOf(Date);
  });

  it('reconstitute preserva os campos vindos do banco', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    const updated = new Date('2026-02-01T00:00:00Z');
    const w = Wallet.reconstitute({
      id: 'w-1',
      userId: 'user-1',
      createdAt: created,
      updatedAt: updated,
    });
    expect(w.id).toBe('w-1');
    expect(w.createdAt).toBe(created);
    expect(w.updatedAt).toBe(updated);
  });
});
