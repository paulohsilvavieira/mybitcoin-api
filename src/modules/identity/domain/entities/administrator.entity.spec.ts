import { Administrator } from '@/modules/identity/domain/entities/administrator.entity';

describe('Administrator', () => {
  it('reconstitute popula todos os campos', () => {
    const createdAt = new Date('2026-08-29T00:00:00Z');
    const admin = Administrator.reconstitute({
      id: 'admin-1',
      userId: 'user-1',
      role: 'SUPER_ADMIN',
      createdAt,
    });

    expect(admin.id).toBe('admin-1');
    expect(admin.userId).toBe('user-1');
    expect(admin.role).toBe('SUPER_ADMIN');
    expect(admin.createdAt).toBe(createdAt);
  });
});
