-- Migration: 1786063282336_create_financial_core_tables.sql
-- Created at: 2026-08-06

-- ADR 0006 — cria as tabelas que faltavam para o bounded context `financial`
-- funcionar contra um banco real (`transactions`/`ledger_entries`, hoje sem
-- migration apesar de já terem repositório/SQL) e a nova tabela `wallets`
-- (saldo materializado por usuário/ativo).

CREATE TABLE transactions (
  id               UUID PRIMARY KEY,
  account_id       UUID NOT NULL REFERENCES users(id),
  type             VARCHAR(20) NOT NULL,
  asset            VARCHAR(10) NOT NULL,
  amount_satoshi   BIGINT NOT NULL CHECK (amount_satoshi > 0),
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_account_id ON transactions (account_id);

CREATE TABLE ledger_entries (
  id               UUID PRIMARY KEY,
  transaction_id   UUID NOT NULL REFERENCES transactions(id),
  account          VARCHAR(255) NOT NULL,
  type             VARCHAR(10) NOT NULL CHECK (type IN ('debit', 'credit')),
  amount_satoshi   BIGINT NOT NULL CHECK (amount_satoshi > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_entries_transaction_id ON ledger_entries (transaction_id);
CREATE INDEX idx_ledger_entries_account ON ledger_entries (account);

-- INV-014: ledger_entries é apenas-append. Trigger de banco em vez de só
-- confiar no repositório (`PgLedgerEntryRepository` não expõe update/delete
-- hoje, mas isso não impede um INSERT futuro descuidado ou acesso direto).
CREATE FUNCTION forbid_ledger_entries_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only (INV-014): % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_entries_no_update
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_entries_mutation();

CREATE TABLE wallets (
  id                 UUID PRIMARY KEY,
  user_id            UUID NOT NULL REFERENCES users(id),
  asset              VARCHAR(10) NOT NULL,
  available_satoshi  BIGINT NOT NULL DEFAULT 0 CHECK (available_satoshi >= 0),
  locked_satoshi     BIGINT NOT NULL DEFAULT 0 CHECK (locked_satoshi >= 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, asset)
);

CREATE INDEX idx_wallets_user_id ON wallets (user_id);
