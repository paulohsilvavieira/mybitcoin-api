import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import { CpfCrypto } from '@/modules/kyc/domain/services/cpf-crypto';
import { KycCryptoConfig } from '@/modules/kyc/infrastructure/config/kyc-crypto.config';

const IV_BYTES = 12;

/** Implementação de `CpfCrypto` com `node:crypto` — SHA-256 + AES-256-GCM. */
export class NodeCpfCrypto extends CpfCrypto {
  constructor(private readonly config: KycCryptoConfig) {
    super();
  }

  hash(cpfDigits: string): string {
    return createHash('sha256')
      .update(cpfDigits + this.config.hashPepper, 'utf8')
      .digest('hex');
  }

  encrypt(cpfDigits: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.config.encKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(cpfDigits, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      iv.toString('base64'),
      tag.toString('base64'),
      ciphertext.toString('base64'),
    ].join('.');
  }

  decrypt(payload: string): string {
    const [ivB64, tagB64, ctB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !ctB64) {
      throw new Error('Invalid CPF ciphertext payload');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.config.encKey,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
