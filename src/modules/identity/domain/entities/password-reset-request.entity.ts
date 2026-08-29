/**
 * Registro de uma solicitação de recuperação de senha (REC-001).
 *
 * Chave por e-mail normalizado, gravado inclusive quando o e-mail não
 * corresponde a nenhum usuário (`userFound = false`) — assim contas
 * inexistentes acumulam o mesmo estado de rate-limit que contas reais, sem
 * criar um canal lateral que revele existência de conta (LOG-003). Serve
 * também de trilha de auditoria consultável via SQL (LOG-005/KYC-006).
 */
export class PasswordResetRequest {
  private constructor(
    readonly email: string,
    readonly ipAddress: string,
    readonly userFound: boolean,
    readonly createdAt: Date,
  ) {}

  static record(params: {
    email: string;
    ipAddress: string;
    userFound: boolean;
  }): PasswordResetRequest {
    return new PasswordResetRequest(
      params.email,
      params.ipAddress,
      params.userFound,
      new Date(),
    );
  }
}
