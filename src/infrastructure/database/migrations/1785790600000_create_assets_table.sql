-- Migration: 1785790600000_create_assets_table.sql
-- ADR 0007 — Catálogo de Ativos, Pares de Mercado e Autorização de Administrador

CREATE TABLE assets (
  symbol      VARCHAR(10) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  scale       SMALLINT NOT NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_assets_symbol_format CHECK (symbol ~ '^[A-Z0-9]{2,10}$'),
  CONSTRAINT chk_assets_scale_range   CHECK (scale BETWEEN 0 AND 18),
  CONSTRAINT chk_assets_status        CHECK (status IN ('ACTIVE', 'INACTIVE'))
);

CREATE INDEX idx_assets_status ON assets (status);

INSERT INTO assets (symbol, name, scale) VALUES
  ('BTC',  'Bitcoin', 8),
  ('BRL',  'Real',    2),
  ('USDT', 'Tether',  6),
  ('ETH',  'Ether',   18);
