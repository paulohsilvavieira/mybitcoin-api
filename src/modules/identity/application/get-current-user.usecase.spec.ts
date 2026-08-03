import { GetCurrentUser } from '@/modules/identity/application/get-current-user.usecase';
import { User } from '@/modules/identity/domain/entities/user.entity';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import { UserId } from '@/modules/identity/domain/value-objects/user-id.vo';
import { UserStatus } from '@/modules/identity/domain/value-objects/user-status.vo';
import { UserNotFoundError } from '@/modules/identity/domain/errors/user-not-found.error';

describe('GetCurrentUser', () => {
  const mockUserReadRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
  };

  let sut: GetCurrentUser;

  beforeEach(() => {
    jest.clearAllMocks();
    sut = new GetCurrentUser(mockUserReadRepo);
  });

  it('retorna os dados do usuário autenticado', async () => {
    const id = UserId.create();
    mockUserReadRepo.findById.mockResolvedValue(
      User.reconstitute({
        id,
        name: 'Ada Lovelace',
        email: Email.create('ada.lovelace@example.com'),
        passwordHash: 'hashed-password',
        status: UserStatus.active(),
        emailVerified: true,
        termsAccepted: true,
        registrationIp: '127.0.0.1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const output = await sut.execute({ userId: id.toString() });

    expect(output).toEqual({
      id: id.toString(),
      name: 'Ada Lovelace',
      email: 'ada.lovelace@example.com',
      status: 'ACTIVE',
    });
  });

  it('não expõe o hash da senha na saída', async () => {
    mockUserReadRepo.findById.mockResolvedValue(
      User.reconstitute({
        id: UserId.create(),
        name: 'Ada Lovelace',
        email: Email.create('ada.lovelace@example.com'),
        passwordHash: 'hashed-password',
        status: UserStatus.active(),
        emailVerified: true,
        termsAccepted: true,
        registrationIp: '127.0.0.1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const output = await sut.execute({ userId: 'any-id' });

    expect(Object.keys(output).sort()).toEqual([
      'email',
      'id',
      'name',
      'status',
    ]);
  });

  it('lança UserNotFoundError quando o userId da sessão não resolve para um usuário', async () => {
    mockUserReadRepo.findById.mockResolvedValue(null);

    const error = await sut
      .execute({ userId: 'orphan-session-user' })
      .catch((thrown: UserNotFoundError) => thrown);

    expect(error).toBeInstanceOf(UserNotFoundError);
    expect(error.code).toBe('USER_NOT_FOUND');
    expect(error.userId).toBe('orphan-session-user');
  });
});
