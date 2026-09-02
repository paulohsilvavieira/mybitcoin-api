import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Chaves criptográficas do CPF (ADR 0007).
 *
 * `KYC_CPF_HASH_PEPPER` — segredo concatenado antes do SHA-256.
 * `KYC_CPF_ENC_KEY`     — chave AES-256 (32 bytes), em hex (64 chars) ou base64.
 *
 * Instanciado pelo `KycModule` → resolvido no bootstrap do Nest. Chave ausente
 * ou inválida **derruba o boot** (fail-fast, sem fallback de dev).
 */
@Injectable()
export class KycCryptoConfig {
  readonly hashPepper: string;
  readonly encKey: Buffer;

  constructor(config: ConfigService) {
    const pepper = config.get<string>('KYC_CPF_HASH_PEPPER');
    const keyRaw = config.get<string>('KYC_CPF_ENC_KEY');

    if (!pepper || pepper.length < 16) {
      throw new Error(
        'KYC_CPF_HASH_PEPPER ausente ou muito curto (mínimo 16 caracteres)',
      );
    }
    if (!keyRaw) {
      throw new Error('KYC_CPF_ENC_KEY ausente');
    }

    const key = KycCryptoConfig.decodeKey(keyRaw);
    if (key.length !== 32) {
      throw new Error(
        'KYC_CPF_ENC_KEY deve decodificar para 32 bytes (AES-256): use 64 chars hex ou base64',
      );
    }

    this.hashPepper = pepper;
    this.encKey = key;
  }

  private static decodeKey(raw: string): Buffer {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    return Buffer.from(raw, 'base64');
  }
}
