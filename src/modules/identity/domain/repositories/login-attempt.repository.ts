import { LoginAttempt } from '@/modules/identity/domain/entities/login-attempt.entity';

export interface FailedLoginAttemptsSummary {
  count: number;
  mostRecentFailureAt: Date | null;
}

export abstract class LoginAttemptRepository {
  abstract record(attempt: LoginAttempt): Promise<void>;

  /**
   * Falhas contadas desde o último login bem-sucedido para este email (ou
   * desde sempre, se nunca houve sucesso). Chave por email normalizado, não
   * por userId — emails inexistentes acumulam o mesmo estado de bloqueio que
   * contas reais, para não criar um canal lateral que revele existência de
   * conta (LOG-003).
   */
  abstract countFailedSinceLastSuccess(
    email: string,
  ): Promise<FailedLoginAttemptsSummary>;
}
