-- Migration: create_wallets_table
-- ADR 0006 — 1:1 com users.
-- FK user_id -> users(id): acoplamento de schema entre contextos ACEITO
-- explicitamente (gap #5) enquanto for monólito único — integridade
-- referencial > pureza de bounded context. Nenhum import de código entre
-- os módulos `wallets` e `identity`.

CREATE TABLE wallets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
