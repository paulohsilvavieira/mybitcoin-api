import { UserReadRepository } from '@/modules/identity/domain/repositories';
import { UserStatusType } from '@/modules/identity/domain/value-objects/user-status.vo';
import { UserNotFoundError } from '@/modules/identity/domain/errors/user-not-found.error';

export interface GetCurrentUserInput {
  userId: string;
}

export interface GetCurrentUserOutput {
  id: string;
  name: string;
  email: string;
  status: UserStatusType;
}

export class GetCurrentUser {
  constructor(private readonly userReadRepo: UserReadRepository) {}

  async execute(input: GetCurrentUserInput): Promise<GetCurrentUserOutput> {
    const user = await this.userReadRepo.findById(input.userId);
    if (!user) {
      throw new UserNotFoundError(input.userId);
    }

    return {
      id: user.id.toString(),
      name: user.name,
      email: user.email.toString(),
      status: user.status.toString(),
    };
  }
}
