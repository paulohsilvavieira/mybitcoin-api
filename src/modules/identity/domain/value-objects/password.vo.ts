import { WeakPasswordError } from '../errors/weak-password.error';

export class Password {
  private constructor(private readonly hashedValue: string) {}

  static create(plainPassword: string): Password {
    Password.validatePolicy(plainPassword);
    return new Password(plainPassword);
  }

  static fromHash(hashedValue: string): Password {
    return new Password(hashedValue);
  }

  private static validatePolicy(password: string): void {
    if (password.length < 8) {
      throw new WeakPasswordError('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      throw new WeakPasswordError(
        'Password must contain at least one uppercase letter',
      );
    }
    if (!/[a-z]/.test(password)) {
      throw new WeakPasswordError(
        'Password must contain at least one lowercase letter',
      );
    }
    if (!/[0-9]/.test(password)) {
      throw new WeakPasswordError('Password must contain at least one number');
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      throw new WeakPasswordError(
        'Password must contain at least one special character',
      );
    }
  }

  toHash(): string {
    return this.hashedValue;
  }
}
