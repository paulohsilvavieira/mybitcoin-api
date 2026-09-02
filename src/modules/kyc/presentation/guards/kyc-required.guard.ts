import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedRequest } from '@/modules/identity/presentation/authenticated-request';
import { KycStatusReadRepository } from '@/modules/kyc/domain/repositories/kyc-status-read.repository';

/**
 * KYC-001 — bloqueia a rota quando o usuário autenticado não tem KYC aprovado.
 *
 * Deve ser aplicado APÓS o `SessionAuthGuard` (depende de `request.user`).
 * Lê o status da réplica (`KycStatusReadRepository`). Fail-closed: qualquer
 * status diferente de `APPROVED` (inclui ausência de perfil) resulta em 403.
 *
 * Exportado pelo `KycModule` para uso por outros módulos. Ainda não aplicado a
 * nenhuma rota (não há operação financeira de usuário implementada).
 */
@Injectable()
export class KycRequiredGuard implements CanActivate {
  constructor(private readonly kycStatusRead: KycStatusReadRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const userId = request.user?.userId;
    if (!userId) {
      throw new ForbiddenException('KYC required');
    }

    const status = await this.kycStatusRead.findStatusByUserId(userId);
    if (status !== 'APPROVED') {
      throw new ForbiddenException('KYC approval required for this operation');
    }

    return true;
  }
}
