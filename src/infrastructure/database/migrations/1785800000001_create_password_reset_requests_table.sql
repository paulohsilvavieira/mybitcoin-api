-- Migration: create_password_reset_requests_table
-- Created at: 2026-08-29

-- Rate-limit por e-mail (3 / 15 min, derivado por query, sem contador mutável —
-- mesmo padrão de login_attempts) + trilha de auditoria do fluxo (LOG-005/KYC-006).
-- Registra também e-mails inexistentes (user_found = false) para não criar um
-- canal lateral que revele existência de conta (LOG-003).
CREATE TABLE password_reset_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) NOT NULL,
  ip_address  INET NOT NULL,
  user_found  BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_requests_email_created_at
  ON password_reset_requests (email, created_at);
