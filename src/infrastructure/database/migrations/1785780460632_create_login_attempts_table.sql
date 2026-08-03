-- Migration: create_login_attempts_table
-- Created at: 2026-08-02

-- LOG-006: bloqueio temporário após excesso de tentativas de login falhas.
-- Sem coluna mutável de contador/locked_until — o estado de bloqueio é
-- derivado por query (ver LoginAttemptRepository.countFailedSinceLastSuccess),
-- contando falhas desde o último sucesso. Tabela também fortalece LOG-005
-- (histórico de tentativas consultável via SQL, não só log estruturado).
--
-- user_id fica NULL quando o email não corresponde a nenhum usuário — o
-- registro é feito por email normalizado (não por user_id) para que contas
-- inexistentes acumulem estado de bloqueio da mesma forma que contas reais,
-- sem criar um canal lateral que revele existência de conta (LOG-003).
CREATE TABLE login_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ON DELETE SET NULL: exclusão de usuário preserva o histórico de
  -- auditoria (tentativas de login continuam existindo, só perdem o vínculo).
  user_id     UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  email       VARCHAR(255) NOT NULL,
  ip_address  INET NOT NULL,
  successful  BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_attempts_email_created_at ON login_attempts (email, created_at);
