import { InvalidFullNameError } from '@/modules/kyc/domain/errors/invalid-full-name.error';

/** Nome completo — ao menos nome e sobrenome, até 255 caracteres. */
export class FullName {
  private constructor(private readonly value: string) {}

  static create(input: string): FullName {
    const normalized = (input ?? '').trim().replace(/\s+/g, ' ');

    if (normalized.length < 3 || normalized.length > 255) {
      throw new InvalidFullNameError(
        'comprimento inválido (3 a 255 caracteres)',
      );
    }
    if (normalized.split(' ').length < 2) {
      throw new InvalidFullNameError('informe nome e sobrenome');
    }

    return new FullName(normalized);
  }

  toString(): string {
    return this.value;
  }
}
