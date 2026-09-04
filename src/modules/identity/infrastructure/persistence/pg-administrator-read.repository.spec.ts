import { PgAdministratorReadRepository } from '@/modules/identity/infrastructure/persistence/pg-administrator-read.repository';
import { AdministratorReadRepository } from '@/modules/identity/domain/repositories';

const mockDb = {
  query: jest.fn(),
};

const administratorRow = {
  id: 'admin-1',
  user_id: 'user-1',
  role: 'SUPER_ADMIN',
  created_at: new Date(),
};

describe('PgAdministratorReadRepository', () => {
  let repository: PgAdministratorReadRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PgAdministratorReadRepository(mockDb);
  });

  describe('findByUserId', () => {
    it('delegates to the injected ReadQueryExecutor', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [administratorRow] });

      const admin = await repository.findByUserId('user-1');

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(admin?.id).toBe('admin-1');
      expect(admin?.userId).toBe('user-1');
      expect(admin?.role).toBe('SUPER_ADMIN');
    });

    it('returns null when the administrator does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const admin = await repository.findByUserId('missing');

      expect(admin).toBeNull();
    });
  });

  it('never declares a mutation method (save/delete/update)', () => {
    const readOnlyMethods = Object.getOwnPropertyNames(
      AdministratorReadRepository.prototype,
    );

    expect(readOnlyMethods).not.toEqual(
      expect.arrayContaining(['save', 'delete', 'update']),
    );
  });
});
