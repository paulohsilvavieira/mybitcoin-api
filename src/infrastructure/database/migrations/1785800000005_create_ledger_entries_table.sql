-- Migration: create_ledger_entries_table
-- ADR 0006 — imutável. Sem UPDATE, sem DELETE (triggers na migration seguinte).
-- Uma linha = uma perna (debit OU credit) sobre uma conta identificada por string.

CREATE TABLE ledger_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   UUID NOT NULL REFERENCES transactions(id),
  account          VARCHAR(96) NOT NULL,   -- USER_AVAILABLE:{u}:{asset} | EXCHANGE:TREASURY:{asset} | ...
  asset            VARCHAR(12) NOT NULL REFERENCES assets(symbol),
  entry_type       VARCHAR(8)  NOT NULL CHECK (entry_type IN ('debit','credit')),
  amount_minor     BIGINT NOT NULL CHECK (amount_minor > 0),
  balance_before_minor BIGINT,             -- NULL para contas operacionais
  balance_after_minor  BIGINT,             -- NULL para contas operacionais
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_entries_tx      ON ledger_entries (transaction_id);
CREATE INDEX idx_ledger_entries_account ON ledger_entries (account, created_at DESC, id DESC);
