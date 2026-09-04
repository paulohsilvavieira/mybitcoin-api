-- Migration: 1785790800000_create_administrators_table.sql
-- ADR 0007 — Catálogo de Ativos, Pares de Mercado e Autorização de Administrador

CREATE TABLE administrators (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(30) NOT NULL DEFAULT 'SUPER_ADMIN',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_administrators_role CHECK (role IN ('SUPER_ADMIN'))
);
