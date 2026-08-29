import { RegisterUser } from '@/modules/identity/application/register-user.usecase';
import { EmailAlreadyExistsError } from '@/modules/identity/domain/errors/email-already-exists.error';
import { TermsNotAcceptedError } from '@/modules/identity/domain/errors/terms-not-accepted.error';
import { User } from '@/modules/identity/domain/entities/user.entity';
import { RegisterUserInput } from '@/modules/identity/application/dtos/register-user.usecase.input';

describe('RegisterUser', () => {
  const mockUserRepo = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
  };

  const mockEmailService = {
    sendVerification: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  };

  const mockHashPassword = jest.fn().mockResolvedValue('$2b$12$hashedpassword');

  let sut: RegisterUser;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmailService.sendVerification.mockResolvedValue(undefined);
    mockHashPassword.mockResolvedValue('$2b$12$hashedpassword');
    sut = new RegisterUser(mockUserRepo, mockEmailService, mockHashPassword);
  });

  const validInput: RegisterUserInput = {
    name: 'John Doe',
    email: 'john@example.com',
    password: 'MyP@ssw0rd',
    termsAccepted: true,
    registrationIp: '127.0.0.1',
  };

  describe('execute', () => {
    it('cria usuário e retorna userId e email', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);

      const result = await sut.execute(validInput);

      expect(result.userId).toBeDefined();
      expect(result.email).toBe('john@example.com');
    });

    it('chama save no repositório com usuário criado', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);

      await sut.execute(validInput);

      expect(mockUserRepo.save).toHaveBeenCalledTimes(1);
      expect(mockUserRepo.save).toHaveBeenCalledWith(expect.any(User));
    });

    it('chama hashPassword com a senha em plain text', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);

      await sut.execute(validInput);

      expect(mockHashPassword).toHaveBeenCalledWith('MyP@ssw0rd');
    });

    it('envia email de verificação após criar usuário', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);

      await sut.execute(validInput);

      expect(mockEmailService.sendVerification).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'john@example.com',
          name: 'John Doe',
          token: expect.any(String),
        }),
      );
    });

    it('lança EmailAlreadyExistsError quando email já existe', async () => {
      const existingUser = User.create({
        name: 'Existing User',
        email: { toString: () => 'john@example.com' } as any,
        passwordHash: '$2b$12$hashedpassword',
        termsAccepted: true,
        registrationIp: '127.0.0.1',
      });
      mockUserRepo.findByEmail.mockResolvedValue(existingUser);

      await expect(sut.execute(validInput)).rejects.toBeInstanceOf(
        EmailAlreadyExistsError,
      );
    });

    it('lança TermsNotAcceptedError quando termsAccepted é false', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);

      await expect(
        sut.execute({ ...validInput, termsAccepted: false }),
      ).rejects.toBeInstanceOf(TermsNotAcceptedError);
    });

    it('não salva usuário quando email já existe', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(
        User.create({
          name: 'Existing',
          email: { toString: () => 'john@example.com' } as any,
          passwordHash: '$2b$12$hash',
          termsAccepted: true,
          registrationIp: '127.0.0.1',
        }),
      );

      await expect(sut.execute(validInput)).rejects.toThrow();
      expect(mockUserRepo.save).not.toHaveBeenCalled();
    });

    it('normaliza email para lowercase antes de buscar', async () => {
      mockUserRepo.findByEmail.mockResolvedValue(null);

      await sut.execute({ ...validInput, email: 'JOHN@EXAMPLE.COM' });

      const calledWith = mockUserRepo.findByEmail.mock.calls[0][0];
      expect(calledWith.toString()).toBe('john@example.com');
    });
  });
});
