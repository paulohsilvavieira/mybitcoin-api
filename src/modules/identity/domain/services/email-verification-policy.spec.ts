import { EmailVerificationPolicy } from '@/modules/identity/domain/services/email-verification-policy';

describe('EmailVerificationPolicy', () => {
  describe('computeExpiry', () => {
    it('soma 1 hora ao instante informado', () => {
      const now = new Date('2026-08-29T10:00:00Z');

      const expiry = EmailVerificationPolicy.computeExpiry(now);

      expect(expiry).toEqual(new Date('2026-08-29T11:00:00Z'));
    });
  });

  describe('isCooldownActive', () => {
    it('retorna false quando lastSentAt é null', () => {
      const now = new Date('2026-08-29T10:00:00Z');

      expect(EmailVerificationPolicy.isCooldownActive(null, now)).toBe(false);
    });

    it('retorna true 59s depois do último envio (dentro do cooldown)', () => {
      const lastSentAt = new Date('2026-08-29T10:00:00Z');
      const now = new Date(lastSentAt.getTime() + 59 * 1000);

      expect(EmailVerificationPolicy.isCooldownActive(lastSentAt, now)).toBe(
        true,
      );
    });

    it('retorna false exatamente aos 60s (limite do cooldown)', () => {
      const lastSentAt = new Date('2026-08-29T10:00:00Z');
      const now = new Date(lastSentAt.getTime() + 60 * 1000);

      expect(EmailVerificationPolicy.isCooldownActive(lastSentAt, now)).toBe(
        false,
      );
    });

    it('retorna false 61s depois do último envio (fora do cooldown)', () => {
      const lastSentAt = new Date('2026-08-29T10:00:00Z');
      const now = new Date(lastSentAt.getTime() + 61 * 1000);

      expect(EmailVerificationPolicy.isCooldownActive(lastSentAt, now)).toBe(
        false,
      );
    });
  });
});
