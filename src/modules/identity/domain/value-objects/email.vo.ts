import { InvalidEmailError } from '@/modules/identity/domain/errors/invalid-email.error';

export class Email {
  private constructor(private readonly value: string) {}

  static create(email: string): Email {
    const normalized = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized)) {
      throw new InvalidEmailError(email);
    }
    return new Email(normalized);
  }

  toString(): string {
    return this.value;
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }
}
