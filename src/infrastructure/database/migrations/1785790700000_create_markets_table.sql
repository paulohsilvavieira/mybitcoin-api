-- Migration: 1785790700000_create_markets_table.sql
-- ADR 0007 — Catálogo de Ativos, Pares de Mercado e Autorização de Administrador

CREATE TABLE markets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol              VARCHAR(21) NOT NULL,
  base_asset          VARCHAR(10) NOT NULL REFERENCES assets(symbol),
  quote_asset         VARCHAR(10) NOT NULL REFERENCES assets(symbol),
  status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  price_precision     SMALLINT NOT NULL,
  quantity_precision  SMALLINT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_markets_status             CHECK (status IN ('ACTIVE', 'INACTIVE')),
  CONSTRAINT chk_markets_distinct_assets    CHECK (base_asset <> quote_asset),
  CONSTRAINT chk_markets_price_precision    CHECK (price_precision BETWEEN 0 AND 18),
  CONSTRAINT chk_markets_quantity_precision CHECK (quantity_precision BETWEEN 0 AND 18)
);

CREATE UNIQUE INDEX idx_markets_symbol ON markets (symbol);
CREATE UNIQUE INDEX idx_markets_pair   ON markets (base_asset, quote_asset);
CREATE INDEX        idx_markets_status ON markets (status);
