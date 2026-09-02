import { BirthDate } from '@/modules/kyc/domain/value-objects/birth-date.vo';
import { InvalidBirthDateError } from '@/modules/kyc/domain/errors/invalid-birth-date.error';
import { UnderageError } from '@/modules/kyc/domain/errors/underage.error';

const reference = new Date('2026-08-29T00:00:00.000Z');

describe('BirthDate', () => {
  describe('create', () => {
    it('aceita uma data de nascimento válida', () => {
      const birthDate = BirthDate.create('1990-05-20', reference);
      expect(birthDate.iso).toBe('1990-05-20');
    });

    it('lança InvalidBirthDateError para data no futuro', () => {
      expect(() => BirthDate.create('2030-01-01', reference)).toThrow(
        InvalidBirthDateError,
      );
    });

    it('lança InvalidBirthDateError para idade acima de 120 anos', () => {
      expect(() => BirthDate.create('1900-01-01', reference)).toThrow(
        InvalidBirthDateError,
      );
    });

    it('lança UnderageError para idade de 17 anos', () => {
      expect(() => BirthDate.create('2009-01-01', reference)).toThrow(
        UnderageError,
      );
    });

    it('aceita idade de exatamente 18 anos', () => {
      const birthDate = BirthDate.create('2008-08-29', reference);
      expect(birthDate.ageInYears(reference)).toBe(18);
    });

    it('lança InvalidBirthDateError para string malformada', () => {
      expect(() => BirthDate.create('20-05-1990', reference)).toThrow(
        InvalidBirthDateError,
      );
    });
  });

  describe('iso', () => {
    it('retorna a data no formato YYYY-MM-DD', () => {
      expect(BirthDate.create('1985-12-01', reference).iso).toBe('1985-12-01');
    });
  });

  describe('ageInYears', () => {
    it('calcula a idade em anos completos na data de referência', () => {
      const birthDate = BirthDate.create('1990-05-20', reference);
      expect(birthDate.ageInYears(reference)).toBe(36);
    });
  });
});
