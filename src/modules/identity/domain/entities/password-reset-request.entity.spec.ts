import { PasswordResetRequest } from '@/modules/identity/domain/entities/password-reset-request.entity';

describe('PasswordResetRequest', () => {
  describe('record', () => {
    it('carrega e-mail normalizado, IP e userFound e carimba createdAt', () => {
      const before = Date.now();
      const request = PasswordResetRequest.record({
        email: 'ada@example.com',
        ipAddress: '203.0.113.10',
        userFound: true,
      });
      const after = Date.now();

      expect(request.email).toBe('ada@example.com');
      expect(request.ipAddress).toBe('203.0.113.10');
      expect(request.userFound).toBe(true);
      expect(request.createdAt).toBeInstanceOf(Date);
      expect(request.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(request.createdAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('LOG-003: registra solicitação para conta inexistente com userFound false', () => {
      const request = PasswordResetRequest.record({
        email: 'ghost@example.com',
        ipAddress: '198.51.100.7',
        userFound: false,
      });

      expect(request.userFound).toBe(false);
      expect(request.email).toBe('ghost@example.com');
    });
  });
});
