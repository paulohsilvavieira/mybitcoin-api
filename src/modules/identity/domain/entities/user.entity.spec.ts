import { User } from './user.entity';
import { Email } from '../value-objects/email.vo';
import { TermsNotAcceptedError } from '../errors/terms-not-accepted.error';

describe('User', () => {
  describe('create', () => {
    const validParams = {
      name: 'John Doe',
      email: Email.create('john@example.com'),
      passwordHash: '$2b$12$hashedpassword',
      termsAccepted: true,
      registrationIp: '127.0.0.1',
    };

    it('cria usuário com status PENDING_EMAIL_VERIFICATION', () => {
      const user = User.create(validParams);
      expect(user.status.isPendingEmailVerification()).toBe(true);
      expect(user.status.isActive()).toBe(false);
    });

    it('cria usuário com emailVerified false', () => {
      const user = User.create(validParams);
      expect(user.emailVerified).toBe(false);
    });

    it('cria usuário com id gerado', () => {
      const user = User.create(validParams);
      expect(user.id).toBeDefined();
      expect(user.id.toString()).toHaveLength(36); // UUID
    });

    it('cria usuário com timestamps', () => {
      const before = new Date();
      const user = User.create(validParams);
      const after = new Date();

      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
      expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(user.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('lança TermsNotAcceptedError quando termsAccepted é false', () => {
      expect(() =>
        User.create({ ...validParams, termsAccepted: false }),
      ).toThrow(TermsNotAcceptedError);
    });

    it('cria usuário com dados corretos', () => {
      const user = User.create(validParams);
      expect(user.name).toBe('John Doe');
      expect(user.email.toString()).toBe('john@example.com');
      expect(user.passwordHash).toBe('$2b$12$hashedpassword');
      expect(user.termsAccepted).toBe(true);
      expect(user.registrationIp).toBe('127.0.0.1');
    });
  });

  describe('verifyEmail', () => {
    it('muda status para ACTIVE', () => {
      const user = User.create({
        name: 'John Doe',
        email: Email.create('john@example.com'),
        passwordHash: '$2b$12$hashedpassword',
        termsAccepted: true,
        registrationIp: '127.0.0.1',
      });

      user.verifyEmail();

      expect(user.status.isActive()).toBe(true);
      expect(user.emailVerified).toBe(true);
    });
  });

  describe('reconstitute', () => {
    it('reconstitui usuário a partir de dados persistidos', () => {
      const user = User.reconstitute({
        id: { toString: () => 'test-id' } as any,
        name: 'Test User',
        email: Email.create('test@example.com'),
        passwordHash: '$2b$12$hashedpassword',
        status: {
          isPendingEmailVerification: () => true,
          isActive: () => false,
        } as any,
        emailVerified: false,
        termsAccepted: true,
        registrationIp: '192.168.1.1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      });

      expect(user.name).toBe('Test User');
      expect(user.registrationIp).toBe('192.168.1.1');
    });
  });
});
