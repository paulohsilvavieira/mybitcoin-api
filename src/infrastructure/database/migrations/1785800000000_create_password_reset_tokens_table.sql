-- Migration: create_password_reset_tokens_table
-- Created at: 2026-08-29

-- REC-001..004: token opaco de recuperação de senha, único por solicitação,
-- com expiração (30 min) e uso único. Só o hash sha256 é persistido — o token
-- em claro só existe no e-mail enviado ao usuário (mesmo padrão de sessions).
--
-- ON DELETE CASCADE: o token não tem valor de auditoria após a conta sumir;
-- a trilha de auditoria do fluxo fica em password_reset_requests.
CREATE TABLE password_reset_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    CHAR(64) NOT NULL UNIQUE,          -- sha256(token) em hex
  requested_ip  INET NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  -- Uso único (REC-004). Também é setado quando um novo pedido invalida
  -- os tokens ativos anteriores do mesmo usuário (REC-002).
  consumed_at   TIMESTAMPTZ NULL
);

-- GAP-4: índice parcial ÚNICO — garante no máximo 1 token ativo por usuário
-- (REC-002) mesmo sob solicitações concorrentes. Serve também de índice para a
-- invalidação em lote no novo pedido. O INSERT de emissão usa
-- `ON CONFLICT (user_id) WHERE consumed_at IS NULL DO NOTHING`: em caso de
-- corrida, o segundo INSERT é no-op e o repositório lança
-- ActiveResetTokenExistsError (interno), levando o use case a responder neutro.
CREATE UNIQUE INDEX idx_password_reset_tokens_active_by_user
  ON password_reset_tokens (user_id) WHERE consumed_at IS NULL;
