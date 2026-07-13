-- Migration: create_users_table
-- Created at: 2026-07-12

CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255) NOT NULL,
  email            VARCHAR(255) NOT NULL UNIQUE,
  password_hash    VARCHAR(255) NOT NULL,
  status           VARCHAR(30) NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION',
  email_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  terms_accepted   BOOLEAN NOT NULL DEFAULT FALSE,
  registration_ip  INET NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email ON users (email);
