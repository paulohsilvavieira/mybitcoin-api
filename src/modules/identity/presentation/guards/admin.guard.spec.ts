import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from '@/modules/identity/presentation/guards/admin.guard';
import { Administrator } from '@/modules/identity/domain/entities/administrator.entity';

describe('AdminGuard', () => {
  const mockRepo = { findByUserId: jest.fn() };
  let sut: AdminGuard;

  function makeContext(request: any): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    sut = new AdminGuard(mockRepo);
  });

  it('libera e popula request.admin quando existe linha em administrators', async () => {
    mockRepo.findByUserId.mockResolvedValueOnce(
      Administrator.reconstitute({
        id: 'admin-1',
        userId: 'user-1',
        role: 'SUPER_ADMIN',
        createdAt: new Date(),
      }),
    );
    const request: any = { user: { userId: 'user-1' } };

    await expect(sut.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request.admin).toEqual({ id: 'admin-1', role: 'SUPER_ADMIN' });
  });

  it('lança ForbiddenException quando o usuário não é administrador', async () => {
    mockRepo.findByUserId.mockResolvedValueOnce(null);
    const request: any = { user: { userId: 'user-1' } };

    await expect(sut.canActivate(makeContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lança ForbiddenException (não 500) quando request.user está ausente', async () => {
    const request: any = {};

    await expect(sut.canActivate(makeContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mockRepo.findByUserId).not.toHaveBeenCalled();
  });
});
