export class Administrator {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly role: string,
    readonly createdAt: Date,
  ) {}

  static reconstitute(params: {
    id: string;
    userId: string;
    role: string;
    createdAt: Date;
  }): Administrator {
    return new Administrator(
      params.id,
      params.userId,
      params.role,
      params.createdAt,
    );
  }
}
