import { DomainError } from '@/shared/domain.error';

/**
 * CPF já vinculado a um perfil KYC aprovado de outra conta.
 * Edge case KYC-003 — "CPF duplicado → sinalizar possível fraude".
 */
export class CpfAlreadyInUseError extends DomainError {
  readonly code = 'CPF_ALREADY_IN_USE';

  constructor() {
    super('This CPF is already associated with an approved account');
  }
}
