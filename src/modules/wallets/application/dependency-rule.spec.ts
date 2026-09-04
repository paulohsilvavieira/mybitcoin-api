import { CreditUseCase } from '@/modules/wallets/application/credit.usecase';
import { DebitUseCase } from '@/modules/wallets/application/debit.usecase';
import { LockUseCase } from '@/modules/wallets/application/lock.usecase';
import { UnlockUseCase } from '@/modules/wallets/application/unlock.usecase';
import { UnitOfWork } from '@/shared/unit-of-work';
import { AssetRepository } from '@/modules/wallets/domain/repositories';

/**
 * Regra de Dependência (ADR 0006, gap G): as primitivas são instanciáveis com
 * dependências mockadas, SEM subir o container de DI do NestJS. Se exigissem o
 * container, haveria acoplamento a infraestrutura.
 */
describe('Regra de Dependência — primitivas sem NestJS', () => {
  const uow = { run: jest.fn() } as unknown as UnitOfWork;
  const assetRepo = {
    findBySymbol: jest.fn(),
    listActive: jest.fn(),
  } as unknown as AssetRepository;

  it('cada primitiva é construída só com UnitOfWork + AssetRepository', () => {
    expect(new CreditUseCase(uow, assetRepo)).toBeInstanceOf(CreditUseCase);
    expect(new DebitUseCase(uow, assetRepo)).toBeInstanceOf(DebitUseCase);
    expect(new LockUseCase(uow, assetRepo)).toBeInstanceOf(LockUseCase);
    expect(new UnlockUseCase(uow, assetRepo)).toBeInstanceOf(UnlockUseCase);
  });
});
