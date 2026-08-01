import { Session } from '@/modules/identity/domain/entities/session.entity';
import { SessionRepository } from '@/modules/identity/domain/repositories/session.repository';

export interface ListActiveSessionsInput {
  userId: string;
}

export interface ListActiveSessionsOutput {
  sessions: Session[];
}

export class ListActiveSessions {
  constructor(private readonly sessionRepo: SessionRepository) {}

  async execute(
    input: ListActiveSessionsInput,
  ): Promise<ListActiveSessionsOutput> {
    const sessions = await this.sessionRepo.findActiveByUserId(input.userId);
    return { sessions };
  }
}
