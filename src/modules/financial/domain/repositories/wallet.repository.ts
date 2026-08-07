import { Wallet } from '@/modules/financial/domain/entities';

export abstract class WalletRepository {
  abstract findByUserIdAndAsset(
    userId: string,
    asset: string,
  ): Promise<Wallet | null>;

  // Incremento atômico SQL-side — cria a linha com available_satoshi = amountSatoshi
  // se (user_id, asset) ainda não existe; soma amountSatoshi ao valor já persistido
  // se existe. Nunca lê-calcula-sobrescreve em memória (evita lost update).
  abstract creditAvailable(params: {
    userId: string;
    asset: string;
    amountSatoshi: bigint;
  }): Promise<Wallet>;
}
