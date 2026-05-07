-- Migration: 1777944384067_create_audit_accounts_logs.sql
-- Created at: 2026-05-05T01:26:24.067Z

CREATE TABLE IF NOT EXISTS audit_account_logs (
  id          BIGSERIAL   PRIMARY KEY,
  uuid        UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  account_id  BIGINT      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  action  TEXT        NOT NULL,
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_account_logs_account_id ON audit_account_logs(account_id);
