import { BalanceDto } from '@/modules/financial/presentation/dtos/balance.dto';

/**
 * GET /financial/balances retorna a lista de saldos diretamente (sem wrapper),
 * um item por ativo que o usuário já movimentou. Lista vazia (`[]`) é o caso
 * normal de uma conta que nunca depositou nada — não é erro.
 */
export type GetBalancesResponseDto = BalanceDto[];
