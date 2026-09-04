import { User } from '@/modules/identity/domain/entities/user.entity';
import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import { UserStatus } from '@/modules/identity/domain/value-objects/user-status.vo';
import { TermsNotAcceptedError } from '@/modules/identity/domain/errors/terms-not-accepted.error';

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

    it('cria usuário com os campos de verificação de e-mail nulos', () => {
      const user = User.create(validParams);
      expect(user.emailVerificationTokenHash).toBeNull();
      expect(user.emailVerificationExpiresAt).toBeNull();
      expect(user.emailVerificationLastSentAt).toBeNull();
    });
  });

  describe('issueEmailVerificationToken', () => {
    it('seta os 3 campos de verificação de e-mail', () => {
      const user = User.create({
        name: 'John Doe',
        email: Email.create('john@example.com'),
        passwordHash: '$2b$12$hashedpassword',
        termsAccepted: true,
        registrationIp: '127.0.0.1',
      });
      const expiresAt = new Date('2026-08-29T10:00:00Z');
      const sentAt = new Date('2026-08-29T09:00:00Z');

      user.issueEmailVerificationToken('hash-abc', expiresAt, sentAt);

      expect(user.emailVerificationTokenHash).toBe('hash-abc');
      expect(user.emailVerificationExpiresAt).toBe(expiresAt);
      expect(user.emailVerificationLastSentAt).toBe(sentAt);
    });
  });

  describe('verifyEmail', () => {
    it('a partir de PENDING_EMAIL_VERIFICATION: muda status para ACTIVE e emailVerified para true', () => {
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

    it('a partir de PENDING_EMAIL_VERIFICATION: não limpa os campos de token (idempotência de reclique)', () => {
      const user = User.create({
        name: 'John Doe',
        email: Email.create('john@example.com'),
        passwordHash: '$2b$12$hashedpassword',
        termsAccepted: true,
        registrationIp: '127.0.0.1',
      });
      const expiresAt = new Date('2026-08-29T10:00:00Z');
      const sentAt = new Date('2026-08-29T09:00:00Z');
      user.issueEmailVerificationToken('hash-abc', expiresAt, sentAt);

      user.verifyEmail();

      expect(user.emailVerificationTokenHash).toBe('hash-abc');
      expect(user.emailVerificationExpiresAt).toBe(expiresAt);
      expect(user.emailVerificationLastSentAt).toBe(sentAt);
    });

    it('a partir de ACTIVE: é no-op (não lança, não muda nada)', () => {
      const user = User.reconstitute({
        id: { toString: () => 'test-id' } as any,
        name: 'Test User',
        email: Email.create('test@example.com'),
        passwordHash: '$2b$12$hashedpassword',
        status: UserStatus.active(),
        emailVerified: true,
        termsAccepted: true,
        registrationIp: '192.168.1.1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      });

      expect(() => user.verifyEmail()).not.toThrow();
      expect(user.status.isActive()).toBe(true);
      expect(user.emailVerified).toBe(true);
    });

    it('a partir de SUSPENDED: é no-op (não lança, não reativa a conta)', () => {
      const user = User.reconstitute({
        id: { toString: () => 'test-id' } as any,
        name: 'Test User',
        email: Email.create('test@example.com'),
        passwordHash: '$2b$12$hashedpassword',
        status: UserStatus.suspended(),
        emailVerified: true,
        termsAccepted: true,
        registrationIp: '192.168.1.1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      });

      expect(() => user.verifyEmail()).not.toThrow();
      expect(user.status.isSuspended()).toBe(true);
      expect(user.status.isActive()).toBe(false);
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

    it('reconstitui usuário com os campos de verificação de e-mail persistidos', () => {
      const expiresAt = new Date('2024-01-03');
      const sentAt = new Date('2024-01-02T12:00:00Z');
      const user = User.reconstitute({
        id: { toString: () => 'test-id' } as any,
        name: 'Test User',
        email: Email.create('test@example.com'),
        passwordHash: '$2b$12$hashedpassword',
        status: UserStatus.pendingEmailVerification(),
        emailVerified: false,
        termsAccepted: true,
        registrationIp: '192.168.1.1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        emailVerificationTokenHash: 'hash-xyz',
        emailVerificationExpiresAt: expiresAt,
        emailVerificationLastSentAt: sentAt,
      });

      expect(user.emailVerificationTokenHash).toBe('hash-xyz');
      expect(user.emailVerificationExpiresAt).toBe(expiresAt);
      expect(user.emailVerificationLastSentAt).toBe(sentAt);
    });

    it('reconstitui usuário sem os campos de verificação de e-mail (contas antigas) como null', () => {
      const user = User.reconstitute({
        id: { toString: () => 'test-id' } as any,
        name: 'Test User',
        email: Email.create('test@example.com'),
        passwordHash: '$2b$12$hashedpassword',
        status: UserStatus.active(),
        emailVerified: true,
        termsAccepted: true,
        registrationIp: '192.168.1.1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      });

      expect(user.emailVerificationTokenHash).toBeNull();
      expect(user.emailVerificationExpiresAt).toBeNull();
      expect(user.emailVerificationLastSentAt).toBeNull();
    });
  });
});
