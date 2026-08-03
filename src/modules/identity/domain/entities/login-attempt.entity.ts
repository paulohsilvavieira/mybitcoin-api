export class LoginAttempt {
  private constructor(
    readonly email: string,
    readonly ipAddress: string,
    readonly successful: boolean,
    readonly createdAt: Date,
    readonly userId: string | null,
  ) {}

  static create(params: {
    email: string;
    ipAddress: string;
    successful: boolean;
    userId?: string;
  }): LoginAttempt {
    return new LoginAttempt(
      params.email,
      params.ipAddress,
      params.successful,
      new Date(),
      params.userId ?? null,
    );
  }
}
