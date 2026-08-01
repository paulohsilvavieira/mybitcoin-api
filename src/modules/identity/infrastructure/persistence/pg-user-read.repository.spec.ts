import { PgUserReadRepository } from '@/modules/identity/infrastructure/persistence/pg-user-read.repository';
import { UserReadRepository } from '@/modules/identity/domain/repositories';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';

const mockDb = {
  query: jest.fn(),
};

const userRow = {
  id: 'user-1',
  name: 'John Doe',
  email: 'john@example.com',
  password_hash: 'hash',
  status: 'ACTIVE',
  email_verified: true,
  terms_accepted: true,
  registration_ip: '127.0.0.1',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('PgUserReadRepository', () => {
  let repository: PgUserReadRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PgUserReadRepository(mockDb);
  });

  describe('findById', () => {
    it('delegates to the injected ReadQueryExecutor', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [userRow] });

      const user = await repository.findById('user-1');

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(user?.id.toString()).toBe('user-1');
    });

    it('returns null when the user does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const user = await repository.findById('missing');

      expect(user).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('delegates to the injected ReadQueryExecutor', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [userRow] });

      const user = await repository.findByEmail(
        Email.create('john@example.com'),
      );

      expect(mockDb.query).toHaveBeenCalledTimes(1);
      expect(user?.email.toString()).toBe('john@example.com');
    });

    it('returns null when the email does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const user = await repository.findByEmail(
        Email.create('missing@example.com'),
      );

      expect(user).toBeNull();
    });
  });

  it('never declares a mutation method (save/delete/update)', () => {
    const readOnlyMethods = Object.getOwnPropertyNames(
      UserReadRepository.prototype,
    );

    expect(readOnlyMethods).not.toEqual(
      expect.arrayContaining(['save', 'delete', 'update']),
    );
  });
});
