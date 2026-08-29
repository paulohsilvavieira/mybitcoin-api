import {
  PasswordResetToken,
  PASSWORD_RESET_TTL_MS,
} from '@/modules/identity/domain/entities/password-reset-token.entity';

describe('PasswordResetToken', () => {
  const issueParams = {
    userId: '3f7b8c2e-1a4d-4e9a-9c3f-5d6e7a8b9c0d',
    tokenHash: 'a'.repeat(64),
    requestedIp: '127.0.0.1',
  };

  describe('issue', () => {
    it('gera id UUID e não consumido', () => {
      const token = PasswordResetToken.issue(issueParams);

      expect(token.id).toHaveLength(36);
      expect(token.consumedAt).toBeNull();
      expect(token.userId).toBe(issueParams.userId);
      expect(token.tokenHash).toBe(issueParams.tokenHash);
    });

    it('REC-003: expira 30 minutos após a criação', () => {
      const token = PasswordResetToken.issue(issueParams);

      const delta = token.expiresAt.getTime() - token.createdAt.getTime();
      expect(delta).toBe(PASSWORD_RESET_TTL_MS);
      expect(PASSWORD_RESET_TTL_MS).toBe(30 * 60 * 1000);
    });
  });

  describe('isRedeemable', () => {
    it('true dentro da janela e não consumido', () => {
      const token = PasswordResetToken.issue(issueParams);
      expect(token.isRedeemable()).toBe(true);
    });

    it('false após a expiração', () => {
      const token = PasswordResetToken.issue(issueParams);
      const afterExpiry = new Date(Date.now() + PASSWORD_RESET_TTL_MS + 1000);
      expect(token.isRedeemable(afterExpiry)).toBe(false);
    });

    it('fronteira: true exatamente em expiresAt (usa `now > expiresAt`)', () => {
      const token = PasswordResetToken.issue(issueParams);
      expect(token.isRedeemable(new Date(token.expiresAt.getTime()))).toBe(
        true,
      );
      expect(token.isRedeemable(new Date(token.expiresAt.getTime() + 1))).toBe(
        false,
      );
    });

    it('false quando já consumido, mesmo dentro da janela', () => {
      const token = PasswordResetToken.issue(issueParams);
      token.consume();
      expect(token.isRedeemable()).toBe(false);
    });
  });

  describe('consume', () => {
    it('REC-004: marca consumedAt uma única vez (idempotente)', () => {
      const token = PasswordResetToken.issue(issueParams);
      const first = new Date('2026-08-28T10:00:00Z');
      const second = new Date('2026-08-28T10:05:00Z');

      token.consume(first);
      token.consume(second);

      expect(token.consumedAt).toEqual(first);
    });
  });

  describe('reconstitute', () => {
    it('restaura o estado consumido vindo do banco', () => {
      const consumedAt = new Date('2026-08-28T10:00:00Z');
      const token = PasswordResetToken.reconstitute({
        id: 'id-1',
        userId: issueParams.userId,
        tokenHash: issueParams.tokenHash,
        requestedIp: issueParams.requestedIp,
        createdAt: new Date('2026-08-28T09:30:00Z'),
        expiresAt: new Date('2026-08-28T10:00:00Z'),
        consumedAt,
      });

      expect(token.consumedAt).toEqual(consumedAt);
      expect(token.isRedeemable(new Date('2026-08-28T09:45:00Z'))).toBe(false);
    });
  });
});
