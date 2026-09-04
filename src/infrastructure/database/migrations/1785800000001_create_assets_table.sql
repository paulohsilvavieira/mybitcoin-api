-- Migration: create_assets_table
-- ADR 0006 — catálogo de ativos suportados, com a escala (menor unidade) de cada um.

CREATE TABLE assets (
  symbol      VARCHAR(12) PRIMARY KEY,          -- 'BRL', 'BTC'
  name        VARCHAR(64)  NOT NULL,
  scale       SMALLINT     NOT NULL CHECK (scale >= 0 AND scale <= 18),
  status      VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | INACTIVE
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO assets (symbol, name, scale, status) VALUES
  ('BRL', 'Real Brasileiro (simulado)', 2, 'ACTIVE'),
  ('BTC', 'Bitcoin', 8, 'ACTIVE');
