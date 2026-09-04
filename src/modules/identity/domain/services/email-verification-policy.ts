/** VER-001/VER-004 — decisões do usuário (grelhamento ADR 0006): TTL de 1h, cooldown de 60s. */
const TOKEN_TTL_MS = 60 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * O cooldown de reenvio é aplicado atomicamente pelo repositório
 * (`UserRepository.issueEmailVerificationTokenIfDue` — `UPDATE ... WHERE ...`,
 * ADR 0006 Emenda gap 3), não por uma checagem em memória nesta policy.
 * `RESEND_COOLDOWN_MS` é exportado para o repositório de infraestrutura
 * montar o `WHERE` da query; `isCooldownActive` fica disponível para uso
 * fora do caminho de produção atômico (ex.: testes, decisões futuras).
 */
export class EmailVerificationPolicy {
  static computeExpiry(now: Date): Date {
    return new Date(now.getTime() + TOKEN_TTL_MS);
  }

  static isCooldownActive(lastSentAt: Date | null, now: Date): boolean {
    if (!lastSentAt) {
      return false;
    }

    return now.getTime() - lastSentAt.getTime() < RESEND_COOLDOWN_MS;
  }
}
