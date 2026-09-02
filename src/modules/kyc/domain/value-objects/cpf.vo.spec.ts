import { Cpf } from '@/modules/kyc/domain/value-objects/cpf.vo';
import { InvalidCpfError } from '@/modules/kyc/domain/errors/invalid-cpf.error';

describe('Cpf', () => {
  describe('create', () => {
    it('cria CPF válido a partir de dígitos', () => {
      const cpf = Cpf.create('11144477735');
      expect(cpf.digits).toBe('11144477735');
    });

    it('aceita outro CPF válido', () => {
      const cpf = Cpf.create('52998224725');
      expect(cpf.digits).toBe('52998224725');
    });

    it('aceita CPF mascarado e armazena apenas dígitos', () => {
      const cpf = Cpf.create('111.444.777-35');
      expect(cpf.digits).toBe('11144477735');
    });

    it('lança InvalidCpfError para comprimento incorreto', () => {
      expect(() => Cpf.create('123456')).toThrow(InvalidCpfError);
    });

    it('lança InvalidCpfError para todos os dígitos iguais', () => {
      expect(() => Cpf.create('00000000000')).toThrow(InvalidCpfError);
    });

    it('lança InvalidCpfError para dígitos verificadores inválidos', () => {
      expect(() => Cpf.create('11144477700')).toThrow(InvalidCpfError);
    });
  });

  describe('digits', () => {
    it('retorna os 11 dígitos sem máscara', () => {
      expect(Cpf.create('529.982.247-25').digits).toBe('52998224725');
    });
  });

  describe('lastTwoDigits', () => {
    it('retorna os dois últimos dígitos', () => {
      expect(Cpf.create('11144477735').lastTwoDigits).toBe('35');
    });
  });

  describe('digitsOnly', () => {
    it('extrai apenas os dígitos de uma entrada mascarada', () => {
      expect(Cpf.digitsOnly('111.444.777-35')).toBe('11144477735');
    });

    it('retorna string vazia para entrada nula', () => {
      expect(Cpf.digitsOnly(null as unknown as string)).toBe('');
    });
  });
});
