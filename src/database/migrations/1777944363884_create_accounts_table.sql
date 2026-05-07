-- Migration: 1777944363884_create_accounts_table.sql
-- Created at: 2026-05-05T01:26:03.884Z

CREATE TABLE IF NOT EXISTS accounts (
  id          BIGSERIAL   PRIMARY KEY,
  uuid        UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  email       TEXT        NOT NULL UNIQUE,
  password    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
