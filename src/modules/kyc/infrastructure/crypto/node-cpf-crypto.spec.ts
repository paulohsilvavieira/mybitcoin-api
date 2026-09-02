import { NodeCpfCrypto } from '@/modules/kyc/infrastructure/crypto/node-cpf-crypto';
import { KycCryptoConfig } from '@/modules/kyc/infrastructure/config/kyc-crypto.config';

describe('NodeCpfCrypto', () => {
  const config = {
    hashPepper: 'x'.repeat(20),
    encKey: Buffer.alloc(32, 7),
  } as unknown as KycCryptoConfig;

  const sut = new NodeCpfCrypto(config);
  const digits = '11144477735';

  it('produz o mesmo hash para a mesma entrada (deterministico)', () => {
    expect(sut.hash(digits)).toBe(sut.hash(digits));
  });

  it('produz hash diferente para pepper diferente', () => {
    const other = new NodeCpfCrypto({
      hashPepper: 'y'.repeat(20),
      encKey: Buffer.alloc(32, 7),
    });

    expect(other.hash(digits)).not.toBe(sut.hash(digits));
  });

  it('encrypt seguido de decrypt recupera os dígitos originais', () => {
    expect(sut.decrypt(sut.encrypt(digits))).toBe(digits);
  });

  it('decrypt de payload malformado lança erro', () => {
    expect(() => sut.decrypt('payload-invalido')).toThrow();
  });
});
