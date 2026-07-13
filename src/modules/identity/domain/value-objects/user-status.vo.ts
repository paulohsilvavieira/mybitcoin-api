export type UserStatusType =
  | 'PENDING_EMAIL_VERIFICATION'
  | 'ACTIVE'
  | 'SUSPENDED';

export class UserStatus {
  private constructor(private readonly value: UserStatusType) {}

  static pendingEmailVerification(): UserStatus {
    return new UserStatus('PENDING_EMAIL_VERIFICATION');
  }

  static active(): UserStatus {
    return new UserStatus('ACTIVE');
  }

  static suspended(): UserStatus {
    return new UserStatus('SUSPENDED');
  }

  static from(value: UserStatusType): UserStatus {
    return new UserStatus(value);
  }

  isPendingEmailVerification(): boolean {
    return this.value === 'PENDING_EMAIL_VERIFICATION';
  }

  isActive(): boolean {
    return this.value === 'ACTIVE';
  }

  isSuspended(): boolean {
    return this.value === 'SUSPENDED';
  }

  toString(): UserStatusType {
    return this.value;
  }
}
