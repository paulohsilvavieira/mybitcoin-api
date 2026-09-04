-- Migration: create_transactions_table
-- ADR 0006 — agrupa as pernas de uma operação.
-- Sem coluna 'status' (gap #7): uma transação só existe se foi commitada com
-- sucesso; falha => rollback da UnitOfWork => nenhuma linha.
-- UNIQUE (reference_type, reference_id, operation) => idempotência das primitivas.

CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation       VARCHAR(24) NOT NULL,   -- credit | debit | lock | unlock
  reference_type  VARCHAR(24) NOT NULL,   -- DEPOSIT | WITHDRAWAL | ORDER | TRADE | ADJUSTMENT
  reference_id    VARCHAR(64) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reference_type, reference_id, operation)
);
