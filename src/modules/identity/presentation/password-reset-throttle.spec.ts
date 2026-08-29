import 'reflect-metadata';
import { ThrottlerGuard } from '@nestjs/throttler';
import { IdentityController } from '@/modules/identity/presentation/identity.controller';

/**
 * Garante que o rate-limit por IP continua plugado nos endpoints de
 * recuperação de senha — a remoção silenciosa do `@UseGuards(ThrottlerGuard)`
 * passaria despercebida pelos testes e2e (que não exercitam o limite de 429).
 */
describe('Recuperação de senha — rate-limit por IP', () => {
  const guardsOf = (method: string): unknown[] =>
    (Reflect.getMetadata(
      '__guards__',
      (IdentityController.prototype as Record<string, unknown>)[
        method
      ] as never,
    ) as unknown[]) ?? [];

  it('forgot-password tem ThrottlerGuard', () => {
    expect(guardsOf('forgotPassword')).toContain(ThrottlerGuard);
  });

  it('reset-password tem ThrottlerGuard', () => {
    expect(guardsOf('resetPassword')).toContain(ThrottlerGuard);
  });
});
