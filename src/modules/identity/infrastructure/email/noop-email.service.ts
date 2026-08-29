import { Logger } from '@nestjs/common';
import { EmailService } from '@/modules/identity/domain/services/email.service';

/**
 * Implementação stub do `EmailService` (mesma dívida registrada no ADR 0002).
 * Não envia e-mail de verdade — apenas loga. Mantém, porém, a responsabilidade
 * de infraestrutura de montar a URL do link de recuperação
 * (`PASSWORD_RESET_URL` + `?token=<token>`), que nunca pode vazar para o use case.
 *
 * A fiação no módulo NestJS (injeção de `PASSWORD_RESET_URL` via `ConfigService`)
 * é feita na etapa de presentation.
 */
export class NoopEmailService extends EmailService {
  private readonly logger = new Logger(NoopEmailService.name);

  constructor(private readonly resetBaseUrl: string) {
    super();
  }

  sendVerification(): Promise<void> {
    return Promise.resolve();
  }

  sendPasswordReset(params: {
    to: string;
    name: string;
    token: string;
  }): Promise<void> {
    // O token NUNCA é logado em produção (security-guard): quem lê o log
    // conseguiria redefinir a senha. Em dev, expõe o link completo só para
    // facilitar o teste manual.
    if (process.env.NODE_ENV !== 'production') {
      const url = new URL(this.resetBaseUrl);
      url.searchParams.set('token', params.token);
      this.logger.debug(`[dev] password reset link: ${url.toString()}`);
    }
    this.logger.log('email.password_reset.stub', { to: params.to });
    return Promise.resolve();
  }
}
