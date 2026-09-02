import { FullName } from '@/modules/kyc/domain/value-objects/full-name.vo';
import { InvalidFullNameError } from '@/modules/kyc/domain/errors/invalid-full-name.error';

describe('FullName', () => {
  describe('create', () => {
    it('cria nome completo válido', () => {
      expect(FullName.create('Ada Lovelace').toString()).toBe('Ada Lovelace');
    });

    it('colapsa espaços em branco extras', () => {
      expect(FullName.create('  Ada   Lovelace  ').toString()).toBe(
        'Ada Lovelace',
      );
    });

    it('lança InvalidFullNameError para nome com uma única palavra', () => {
      expect(() => FullName.create('Ada')).toThrow(InvalidFullNameError);
    });

    it('lança InvalidFullNameError para nome vazio', () => {
      expect(() => FullName.create('')).toThrow(InvalidFullNameError);
    });

    it('lança InvalidFullNameError para nome com mais de 255 caracteres', () => {
      const longName = `${'a'.repeat(200)} ${'b'.repeat(200)}`;
      expect(() => FullName.create(longName)).toThrow(InvalidFullNameError);
    });
  });

  describe('toString', () => {
    it('retorna o valor normalizado', () => {
      expect(FullName.create('Grace  Hopper').toString()).toBe('Grace Hopper');
    });
  });
});
