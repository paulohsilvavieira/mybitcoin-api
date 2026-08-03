import { FailedLoginAttemptsSummary } from '@/modules/identity/domain/repositories/login-attempt.repository';

/** LOG-006 — decisão do usuário (grelhamento): 5 tentativas, bloqueio de 15 min. */
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

/**
 * Sem contador/`locked_until` mutável: o bloqueio é derivado a partir do
 * histórico de tentativas (`LoginAttemptRepository.countFailedSinceLastSuccess`).
 * Cada falha adicional durante o bloqueio empurra `lockedUntil` para 15min a
 * partir dela — um atacante persistente nunca "escapa" o bloqueio esperando;
 * um usuário legítimo que espera e acerta a senha reseta o contador ao ter
 * sucesso (decisão do usuário: reset só em login bem-sucedido).
 */
export class LoginLockoutPolicy {
  static isLocked(
    summary: FailedLoginAttemptsSummary,
    now: Date = new Date(),
  ): boolean {
    if (summary.count < MAX_FAILED_ATTEMPTS || !summary.mostRecentFailureAt) {
      return false;
    }

    const lockedUntil = new Date(
      summary.mostRecentFailureAt.getTime() + LOCKOUT_DURATION_MS,
    );
    return now < lockedUntil;
  }
}
