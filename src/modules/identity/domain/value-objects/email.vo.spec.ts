import { Email } from '@/modules/identity/domain/value-objects/email.vo';
import { InvalidEmailError } from '@/modules/identity/domain/errors/invalid-email.error';

describe('Email', () => {
  describe('create', () => {
    it('cria email válido em lowercase', () => {
      const email = Email.create('JOHN@EXAMPLE.COM');
      expect(email.toString()).toBe('john@example.com');
    });

    it('remove espaços em branco', () => {
      const email = Email.create('  john@example.com  ');
      expect(email.toString()).toBe('john@example.com');
    });

    it('lança InvalidEmailError para email sem @', () => {
      expect(() => Email.create('johnexample.com')).toThrow(InvalidEmailError);
    });

    it('lança InvalidEmailError para email sem domínio', () => {
      expect(() => Email.create('john@')).toThrow(InvalidEmailError);
    });

    it('lança InvalidEmailError para email vazio', () => {
      expect(() => Email.create('')).toThrow(InvalidEmailError);
    });

    it('lança InvalidEmailError para email com espaços no meio', () => {
      expect(() => Email.create('john doe@example.com')).toThrow(
        InvalidEmailError,
      );
    });
  });

  describe('equals', () => {
    it('retorna true para emails iguais', () => {
      const email1 = Email.create('john@example.com');
      const email2 = Email.create('john@example.com');
      expect(email1.equals(email2)).toBe(true);
    });

    it('retorna false para emails diferentes', () => {
      const email1 = Email.create('john@example.com');
      const email2 = Email.create('jane@example.com');
      expect(email1.equals(email2)).toBe(false);
    });

    it('compara case-insensitive (normalizado)', () => {
      const email1 = Email.create('john@example.com');
      const email2 = Email.create('JOHN@EXAMPLE.COM');
      expect(email1.equals(email2)).toBe(true);
    });
  });

  describe('toString', () => {
    it('retorna email em lowercase', () => {
      const email = Email.create('John@Example.COM');
      expect(email.toString()).toBe('john@example.com');
    });
  });
});
