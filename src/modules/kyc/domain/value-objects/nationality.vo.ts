import { InvalidNationalityError } from '@/modules/kyc/domain/errors/invalid-nationality.error';
import { isValidCountryCode } from '@/modules/kyc/domain/value-objects/iso-3166-1-alpha-2';

/** Nacionalidade — código de país ISO 3166-1 alpha-2 (2 letras maiúsculas). */
export class Nationality {
  private constructor(private readonly value: string) {}

  static create(input: string): Nationality {
    const code = (input ?? '').trim().toUpperCase();
    if (!isValidCountryCode(code)) {
      throw new InvalidNationalityError(input);
    }
    return new Nationality(code);
  }

  toString(): string {
    return this.value;
  }
}
