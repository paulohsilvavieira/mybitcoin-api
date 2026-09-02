import { Nationality } from '@/modules/kyc/domain/value-objects/nationality.vo';
import { InvalidNationalityError } from '@/modules/kyc/domain/errors/invalid-nationality.error';

describe('Nationality', () => {
  describe('create', () => {
    it('aceita um código de país ISO 3166-1 alpha-2 válido', () => {
      expect(Nationality.create('BR').toString()).toBe('BR');
    });

    it('normaliza o código para maiúsculas', () => {
      expect(Nationality.create('br').toString()).toBe('BR');
    });

    it('lança InvalidNationalityError para código inexistente', () => {
      expect(() => Nationality.create('XX')).toThrow(InvalidNationalityError);
    });

    it('lança InvalidNationalityError para string vazia', () => {
      expect(() => Nationality.create('')).toThrow(InvalidNationalityError);
    });
  });

  describe('toString', () => {
    it('retorna o código normalizado', () => {
      expect(Nationality.create('us').toString()).toBe('US');
    });
  });
});
