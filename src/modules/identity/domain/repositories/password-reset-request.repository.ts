import { PasswordResetRequest } from '@/modules/identity/domain/entities/password-reset-request.entity';

export abstract class PasswordResetRequestRepository {
  abstract record(request: PasswordResetRequest): Promise<void>;

  /**
   * Quantas solicitações foram registradas para este e-mail normalizado desde
   * `since`. Usado para o rate-limit por e-mail (3 / 15 min), derivado por
   * query — sem contador mutável, mesmo padrão de `login_attempts`.
   */
  abstract countSince(email: string, since: Date): Promise<number>;
}
