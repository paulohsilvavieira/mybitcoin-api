import { KycCryptoConfig } from '@/modules/kyc/infrastructure/config/kyc-crypto.config';

describe('KycCryptoConfig', () => {
  const hexKey = '7'.repeat(64);
  const base64Key = Buffer.alloc(32, 7).toString('base64');

  function fakeConfig(values: Record<string, string | undefined>) {
    return { get: (key: string) => values[key] } as any;
  }

  it('aceita pepper válido e chave hex de 64 caracteres', () => {
    const sut = new KycCryptoConfig(
      fakeConfig({
        KYC_CPF_HASH_PEPPER: 'pepper-1234567890',
        KYC_CPF_ENC_KEY: hexKey,
      }),
    );

    expect(sut.encKey.length).toBe(32);
    expect(sut.hashPepper).toBe('pepper-1234567890');
  });

  it('aceita chave base64 que decodifica para 32 bytes', () => {
    const sut = new KycCryptoConfig(
      fakeConfig({
        KYC_CPF_HASH_PEPPER: 'pepper-1234567890',
        KYC_CPF_ENC_KEY: base64Key,
      }),
    );

    expect(sut.encKey.length).toBe(32);
  });

  it('lança quando o pepper está ausente', () => {
    expect(
      () => new KycCryptoConfig(fakeConfig({ KYC_CPF_ENC_KEY: hexKey })),
    ).toThrow();
  });

  it('lança quando o pepper é curto demais', () => {
    expect(
      () =>
        new KycCryptoConfig(
          fakeConfig({
            KYC_CPF_HASH_PEPPER: 'curto',
            KYC_CPF_ENC_KEY: hexKey,
          }),
        ),
    ).toThrow();
  });

  it('lança quando a chave de criptografia está ausente', () => {
    expect(
      () =>
        new KycCryptoConfig(
          fakeConfig({ KYC_CPF_HASH_PEPPER: 'pepper-1234567890' }),
        ),
    ).toThrow();
  });

  it('lança quando a chave não decodifica para 32 bytes', () => {
    expect(
      () =>
        new KycCryptoConfig(
          fakeConfig({
            KYC_CPF_HASH_PEPPER: 'pepper-1234567890',
            KYC_CPF_ENC_KEY: 'YWJjZA==',
          }),
        ),
    ).toThrow();
  });
});
