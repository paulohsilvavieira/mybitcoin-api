import { Resend } from 'resend';
import { EmailService } from '@/modules/identity/domain/services/email.service';

/** Escapa os 5 caracteres especiais de HTML — `name` vem do cadastro do usuário. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class ResendEmailService extends EmailService {
  constructor(
    private readonly resend: Resend,
    private readonly fromAddress: string,
    private readonly frontendOrigin: string,
  ) {
    super();
  }

  async sendVerification(params: {
    to: string;
    name: string;
    token: string;
  }): Promise<void> {
    const link = `${this.frontendOrigin}/verify-email?token=${params.token}`;
    const safeName = escapeHtml(params.name);
    await this.resend.emails.send({
      from: this.fromAddress,
      to: params.to,
      subject: 'Confirme seu e-mail — MyBitcoin',
      html: `<p>Olá, ${safeName}!</p><p>Confirme seu e-mail clicando no link abaixo:</p><p><a href="${link}">${link}</a></p><p>Este link expira em 1 hora.</p>`,
    });
  }
}
