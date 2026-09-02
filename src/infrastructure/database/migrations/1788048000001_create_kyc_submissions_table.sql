-- Migration: create_kyc_submissions_table
-- Created at: 2026-08-29
-- ADR 0007 — KYC Básico
-- Trilha de auditoria imutável (KYC-006) — nunca UPDATE/DELETE. Uma linha por tentativa.

CREATE TABLE kyc_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  result            VARCHAR(20) NOT NULL,            -- APPROVED | REJECTED
  rejection_reason  VARCHAR(60),                     -- código do erro quando result = REJECTED
  full_name         VARCHAR(255) NOT NULL,
  cpf_hash          CHAR(64) NOT NULL,
  cpf_encrypted     TEXT NOT NULL,
  cpf_last_digits   CHAR(2) NOT NULL,
  birth_date        DATE NOT NULL,
  nationality       CHAR(2) NOT NULL,
  submitted_ip      INET NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kyc_submissions_user_id ON kyc_submissions (user_id, created_at DESC);
