import { randomBytes, createHash } from 'node:crypto';
import { Session } from '@/modules/identity/domain/entities/session.entity';
import { SessionRepository } from '@/modules/identity/domain/repositories/session.repository';
import { SessionCreated } from '@/modules/identity/domain/events/session-created.event';

export interface CreateSessionInput {
  userId: string;
  deviceInfo: string;
  ipAddress: string;
}

export interface CreateSessionOutput {
  token: string;
  sessionId: string;
  expiresAt: Date;
  event: SessionCreated;
}

export class CreateSession {
  constructor(private readonly sessionRepo: SessionRepository) {}

  async execute(input: CreateSessionInput): Promise<CreateSessionOutput> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const session = Session.create({
      userId: input.userId,
      tokenHash,
      deviceInfo: input.deviceInfo,
      ipAddress: input.ipAddress,
    });

    await this.sessionRepo.create(session);

    const event = new SessionCreated(
      session.id.toString(),
      session.userId,
      session.deviceInfo,
      session.ipAddress,
    );

    return {
      token,
      sessionId: session.id.toString(),
      expiresAt: session.expiresAt,
      event,
    };
  }
}
