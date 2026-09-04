-- Migration: create_balances_table
-- ADR 0006 — projeção materializada; 1 registro por (wallet, ativo).
-- available_minor / locked_minor nunca negativos (INV-001..004).

CREATE TABLE balances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id        UUID NOT NULL REFERENCES wallets(id),
  asset            VARCHAR(12) NOT NULL REFERENCES assets(symbol),
  available_minor  BIGINT NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  locked_minor     BIGINT NOT NULL DEFAULT 0 CHECK (locked_minor >= 0),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wallet_id, asset)
);
