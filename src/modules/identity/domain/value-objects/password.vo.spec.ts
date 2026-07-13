import { Password } from './password.vo';
import { WeakPasswordError } from '../errors/weak-password.error';

describe('Password', () => {
  describe('create', () => {
    it('cria senha válida que atende política', () => {
      const password = Password.create('MyP@ssw0rd');
      expect(password).toBeDefined();
    });

    it('lança WeakPasswordError para senha com menos de 8 caracteres', () => {
      expect(() => Password.create('Ab1!')).toThrow(WeakPasswordError);
    });

    it('lança WeakPasswordError para senha sem letra maiúscula', () => {
      expect(() => Password.create('myp@ssw0rd')).toThrow(WeakPasswordError);
    });

    it('lança WeakPasswordError para senha sem letra minúscula', () => {
      expect(() => Password.create('MYP@SSW0RD')).toThrow(WeakPasswordError);
    });

    it('lança WeakPasswordError para senha sem número', () => {
      expect(() => Password.create('MyP@ssword')).toThrow(WeakPasswordError);
    });

    it('lança WeakPasswordError para senha sem caractere especial', () => {
      expect(() => Password.create('MyPAssw0rd')).toThrow(WeakPasswordError);
    });
  });

  describe('fromHash', () => {
    it('cria instância a partir de hash existente', () => {
      const hashedValue = '$2b$12$abcdefghijklmnopqrstuu';
      const password = Password.fromHash(hashedValue);
      expect(password.toHash()).toBe(hashedValue);
    });
  });

  describe('toHash', () => {
    it('retorna o valor hash armazenado', () => {
      const hashedValue = '$2b$12$abcdefghijklmnopqrstuu';
      const password = Password.fromHash(hashedValue);
      expect(password.toHash()).toBe(hashedValue);
    });
  });
});
