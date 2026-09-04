import { Repositories } from '@/shared/unit-of-work';
import { Wallet } from '@/modules/wallets/domain/entities/wallet.entity';
import { Balance } from '@/modules/wallets/domain/entities/balance.entity';
import { WalletNotFoundError } from '@/modules/wallets/domain/errors/wallet-not-found.error';
import { BalanceProvisioningError } from '@/modules/wallets/domain/errors/balance-provisioning.error';

/**
 * Helper interno: garante `Wallet` + `Balance(asset)` do usuário DENTRO da
 * UnitOfWork da operação (provisionamento lazy — ADR 0006). Retorna a linha de
 * balance já travada com `SELECT ... FOR UPDATE`.
 *
 * Ambos os ramos de "não encontrou após inserir" são fail-loud (lançam erro
 * tipado): um `null` aqui significa invariante quebrada e faria o `save()`
 * (UPDATE-only) virar no-op silencioso, divergindo `balances` do ledger.
 */
export async function provisionWallet(
  repos: Repositories,
  userId: string,
  asset: string,
): Promise<{ wallet: Wallet; balance: Balance }> {
  let wallet = await repos.walletRepo.findByUserId(userId);
  if (!wallet) {
    await repos.walletRepo.insertIfNotExists(Wallet.createForUser(userId));
    wallet = await repos.walletRepo.findByUserId(userId);
  }
  if (!wallet) {
    // ON CONFLICT DO NOTHING + relê não encontrou => invariante quebrada
    throw new WalletNotFoundError(userId);
  }

  let balance = await repos.balanceRepo.findForUpdate(wallet.id, asset);
  if (!balance) {
    await repos.balanceRepo.insertZeroIfNotExists(wallet.id, asset);
    balance = await repos.balanceRepo.findForUpdate(wallet.id, asset);
  }
  if (!balance) {
    throw new BalanceProvisioningError(wallet.id, asset);
  }

  return { wallet, balance };
}
