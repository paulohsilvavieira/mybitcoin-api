-- Migration: create_sessions_table
-- Created at: 2026-08-01

CREATE TABLE sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  token_hash        VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hex (64 chars)
  device_info       VARCHAR(255) NOT NULL,
  ip_address        INET NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ NULL
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);
