-- Migration: 1777944379768_create_refresh_tokens_table.sql
-- Created at: 2026-05-05T01:26:19.768Z

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          BIGSERIAL   PRIMARY KEY,
  uuid        UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  account_id  BIGINT      NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_account_id ON refresh_tokens(account_id);
