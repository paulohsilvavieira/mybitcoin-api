import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AdministratorReadRepository } from '@/modules/identity/domain/repositories';
import { AuthenticatedRequest } from '@/modules/identity/presentation/authenticated-request';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly administratorReadRepository: AdministratorReadRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const userId = request.user?.userId;
    if (!userId) {
      throw new ForbiddenException();
    }

    const admin = await this.administratorReadRepository.findByUserId(userId);
    if (admin === null) {
      throw new ForbiddenException();
    }

    request.admin = { id: admin.id, role: admin.role };
    return true;
  }
}
