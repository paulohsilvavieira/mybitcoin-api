-- Migration: ledger_entries_immutability_triggers
-- ADR 0006 (gap #4) — imutabilidade forçada por TRIGGER, não por REVOKE: a
-- aplicação conecta como superuser (DB_USER=postgres), que ignora GRANT/REVOKE.
-- Um trigger RAISE EXCEPTION funciona para qualquer role.

CREATE OR REPLACE FUNCTION ledger_entries_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only: % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_entries_no_update
  BEFORE UPDATE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_immutable();

CREATE TRIGGER trg_ledger_entries_no_delete
  BEFORE DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_entries_immutable();
