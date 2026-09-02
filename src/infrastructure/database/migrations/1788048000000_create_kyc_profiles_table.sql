-- Migration: create_kyc_profiles_table
-- Created at: 2026-08-29
-- ADR 0007 — KYC Básico

CREATE TABLE kyc_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id),
  status            VARCHAR(20) NOT NULL,            -- APPROVED | REJECTED
  rejection_reason  VARCHAR(60),                     -- código do erro quando status = REJECTED
  full_name         VARCHAR(255) NOT NULL,
  cpf_hash          CHAR(64) NOT NULL,               -- SHA-256(cpf + pepper), hex
  cpf_encrypted     TEXT NOT NULL,                   -- AES-256-GCM(cpf): base64(iv).base64(tag).base64(ct)
  cpf_last_digits   CHAR(2) NOT NULL,                -- máscara ***.***.**-XX
  birth_date        DATE NOT NULL,
  nationality       CHAR(2) NOT NULL,                -- ISO 3166-1 alpha-2
  approved_at       TIMESTAMPTZ,                     -- preenchido só quando status = APPROVED
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CPF único apenas entre perfis APROVADOS — um CPF rejeitado não "queima" o número.
CREATE UNIQUE INDEX idx_kyc_profiles_cpf_hash_approved
  ON kyc_profiles (cpf_hash) WHERE status = 'APPROVED';
