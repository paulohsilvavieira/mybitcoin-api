export abstract class EmailService {
  abstract sendVerification(params: {
    to: string;
    name: string;
    token: string;
  }): Promise<void>;

  /**
   * REC-001 — envia o e-mail de recuperação de senha. A montagem da URL do
   * link (`PASSWORD_RESET_URL?token=...`) é responsabilidade da implementação
   * de infraestrutura; o domínio só passa o token em claro.
   */
  abstract sendPasswordReset(params: {
    to: string;
    name: string;
    token: string;
  }): Promise<void>;
}
