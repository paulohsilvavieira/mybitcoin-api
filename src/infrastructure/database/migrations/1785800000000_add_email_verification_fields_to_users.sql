-- Migration: add_email_verification_fields_to_users
-- Created at: 2026-08-29

-- ADR 0006 — Identity: Verificação de E-mail. Três colunas novas em
-- `users` (mesma tabela, sem tabela separada — só um token é válido por
-- vez, sem necessidade de histórico auditável como em `login_attempts`).
-- Nenhuma é NOT NULL: contas existentes antes desta migration começam
-- com essas colunas NULL, tratado como "sem token pendente".
ALTER TABLE users
  ADD COLUMN email_verification_token_hash    VARCHAR(64),
  ADD COLUMN email_verification_expires_at    TIMESTAMPTZ,
  ADD COLUMN email_verification_last_sent_at  TIMESTAMPTZ;

CREATE INDEX idx_users_email_verification_token_hash
  ON users (email_verification_token_hash);
