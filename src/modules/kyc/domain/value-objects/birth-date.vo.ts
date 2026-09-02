import { InvalidBirthDateError } from '@/modules/kyc/domain/errors/invalid-birth-date.error';
import { UnderageError } from '@/modules/kyc/domain/errors/underage.error';
import {
  MINIMUM_KYC_AGE,
  MAXIMUM_PLAUSIBLE_AGE,
} from '@/modules/kyc/domain/kyc-policy';

/**
 * Data de nascimento — data ISO (YYYY-MM-DD), não-futura, idade entre
 * MINIMUM_KYC_AGE e MAXIMUM_PLAUSIBLE_AGE.
 */
export class BirthDate {
  private constructor(private readonly date: Date) {}

  static create(input: string, reference: Date = new Date()): BirthDate {
    const parsed = new Date(`${input}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      throw new InvalidBirthDateError('data inválida (esperado YYYY-MM-DD)');
    }
    if (parsed.getTime() > reference.getTime()) {
      throw new InvalidBirthDateError('data no futuro');
    }

    const age = BirthDate.calculateAge(parsed, reference);
    if (age > MAXIMUM_PLAUSIBLE_AGE) {
      throw new InvalidBirthDateError('idade implausível');
    }
    if (age < MINIMUM_KYC_AGE) {
      throw new UnderageError(MINIMUM_KYC_AGE);
    }

    return new BirthDate(parsed);
  }

  get iso(): string {
    return this.date.toISOString().slice(0, 10);
  }

  ageInYears(reference: Date = new Date()): number {
    return BirthDate.calculateAge(this.date, reference);
  }

  private static calculateAge(birth: Date, reference: Date): number {
    let age = reference.getUTCFullYear() - birth.getUTCFullYear();
    const monthDelta = reference.getUTCMonth() - birth.getUTCMonth();
    if (
      monthDelta < 0 ||
      (monthDelta === 0 && reference.getUTCDate() < birth.getUTCDate())
    ) {
      age--;
    }
    return age;
  }
}
