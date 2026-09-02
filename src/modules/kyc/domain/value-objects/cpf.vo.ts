import { InvalidCpfError } from '@/modules/kyc/domain/errors/invalid-cpf.error';

/**
 * CPF do usuário — 11 dígitos, com dígitos verificadores válidos (módulo 11).
 * O valor interno é sempre só dígitos, sem máscara.
 */
export class Cpf {
  private constructor(private readonly value: string) {}

  static create(input: string): Cpf {
    const digits = Cpf.digitsOnly(input);

    if (digits.length !== 11) {
      throw new InvalidCpfError('deve conter 11 dígitos');
    }
    if (/^(\d)\1{10}$/.test(digits)) {
      throw new InvalidCpfError('sequência de dígitos repetidos não é válida');
    }
    if (!Cpf.hasValidCheckDigits(digits)) {
      throw new InvalidCpfError('dígitos verificadores inválidos');
    }

    return new Cpf(digits);
  }

  /** Extrai apenas os dígitos de uma entrada possivelmente mascarada. */
  static digitsOnly(input: string): string {
    return (input ?? '').replace(/\D/g, '');
  }

  get digits(): string {
    return this.value;
  }

  get lastTwoDigits(): string {
    return this.value.slice(-2);
  }

  private static hasValidCheckDigits(cpf: string): boolean {
    const checkDigit = (length: number): number => {
      let sum = 0;
      for (let i = 0; i < length; i++) {
        sum += Number(cpf[i]) * (length + 1 - i);
      }
      const remainder = (sum * 10) % 11;
      return remainder === 10 ? 0 : remainder;
    };

    return (
      checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10])
    );
  }
}
