import { Session } from '@/modules/identity/domain/entities/session.entity';
import { SessionReadRepository } from '@/modules/identity/domain/repositories/session-read.repository';

export interface ListActiveSessionsInput {
  userId: string;
}

export interface ListActiveSessionsOutput {
  sessions: Session[];
}

export class ListActiveSessions {
  constructor(private readonly sessionReadRepo: SessionReadRepository) {}

  async execute(
    input: ListActiveSessionsInput,
  ): Promise<ListActiveSessionsOutput> {
    const sessions = await this.sessionReadRepo.findActiveByUserId(
      input.userId,
    );
    return { sessions };
  }
}
