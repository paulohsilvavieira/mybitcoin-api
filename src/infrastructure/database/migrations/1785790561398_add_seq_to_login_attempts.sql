-- Migration: add_seq_to_login_attempts
-- Created at: 2026-08-03

-- countFailedSinceLastSuccess comparava por created_at (resolução de
-- milissegundo, gerado em JS via `new Date()`). Duas tentativas em
-- sequência rápida podem empatar no mesmo milissegundo, e a comparação
-- `created_at > último sucesso` (estrita) descarta por engano uma falha
-- que deveria contar — undercounta o bloqueio de LOG-006 tanto em teste
-- quanto em produção. BIGSERIAL garante ordem estritamente monotônica,
-- atribuída atomicamente pelo Postgres no INSERT, sem depender de
-- resolução de relógio.
ALTER TABLE login_attempts ADD COLUMN seq BIGSERIAL NOT NULL;
