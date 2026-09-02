import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { KycRequiredGuard } from '@/modules/kyc/presentation/guards/kyc-required.guard';

describe('KycRequiredGuard', () => {
  const mockStatusRead = { findStatusByUserId: jest.fn() };
  let sut: KycRequiredGuard;

  function makeContext(user: unknown): ExecutionContext {
    const request = { user };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    sut = new KycRequiredGuard(mockStatusRead);
  });

  it('retorna true quando o status é APPROVED', async () => {
    mockStatusRead.findStatusByUserId.mockResolvedValue('APPROVED');

    await expect(
      sut.canActivate(makeContext({ userId: 'user-1' })),
    ).resolves.toBe(true);
  });

  it('lança ForbiddenException quando o status é REJECTED', async () => {
    mockStatusRead.findStatusByUserId.mockResolvedValue('REJECTED');

    await expect(
      sut.canActivate(makeContext({ userId: 'user-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lança ForbiddenException quando não há status (null)', async () => {
    mockStatusRead.findStatusByUserId.mockResolvedValue(null);

    await expect(
      sut.canActivate(makeContext({ userId: 'user-1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lança ForbiddenException quando request.user está ausente', async () => {
    await expect(
      sut.canActivate(makeContext(undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockStatusRead.findStatusByUserId).not.toHaveBeenCalled();
  });
});
