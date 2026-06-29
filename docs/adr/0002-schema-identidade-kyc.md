# ADR 0002 — Schema de Identidade e KYC

**Status:** Proposto  
**Data:** 2026-06-05  
**Autores:** Time de Backend

---

## Contexto

O sistema inicialmente modelou autenticação e identidade em uma única tabela `accounts` (email + password). Com a adição de dados de KYC (Know Your Customer) — CPF, nome completo, data de nascimento, endereço, documentos —, manter tudo em uma única tabela cria problemas de segregação de dados sensíveis, ciclo de vida e compliance com LGPD.

A questão central é: vale a pena separar a tabela de autenticação da tabela de dados de usuário/perfil?

### Por que NÃO separar autenticação de identidade (apenas email/password)

Para um sistema que usa somente email/password com JWT refresh tokens, uma única tabela `accounts` é suficiente. A tabela `refresh_tokens` já fornece separação entre identidade e sessão. Separar `users` de `credentials` seria complexidade prematura.

### Por que separar ao adicionar KYC

KYC muda o cenário por três razões:

1. **Ciclo de vida independente** — um usuário pode existir sem KYC aprovado. O status de verificação (`pending → submitted → approved / rejected`) é independente das credenciais de acesso.
2. **Sensibilidade dos dados (LGPD)** — CPF, documentos e dados biométricos exigem controles de acesso, retenção e auditoria distintos das credenciais de autenticação.
3. **Volume e estrutura** — dados de KYC incluem documentos (múltiplos arquivos por perfil), o que exige tabela própria para evitar arrays ou JSON em `accounts`.

---

## Forças em Jogo

- Manter `accounts` simples para o fluxo de autenticação.
- Separar dados sensíveis de KYC para facilitar compliance com LGPD.
- Modelar o ciclo de vida de verificação KYC de forma independente da conta.
- Suportar múltiplos documentos por perfil KYC sem desnormalização.
- Evitar joins desnecessários no fluxo de autenticação (hot path).

---

## Decisão

Manter a tabela `accounts` para autenticação e criar tabelas separadas para KYC.

### Schema

```sql
-- Identidade e autenticação
accounts (
  id           SERIAL PRIMARY KEY,
  uuid         UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  email        VARCHAR(255) UNIQUE NOT NULL,
  password     TEXT NOT NULL,
  status       VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Perfil KYC: dados pessoais e status de verificação
kyc_profiles (
  id              SERIAL PRIMARY KEY,
  account_id      INTEGER NOT NULL REFERENCES accounts(id),
  full_name       VARCHAR(255) NOT NULL,
  cpf             VARCHAR(11) UNIQUE NOT NULL,
  birth_date      DATE NOT NULL,
  address         JSONB NOT NULL,   -- logradouro, número, bairro, cidade, estado, cep
  kyc_status      VARCHAR(50) NOT NULL DEFAULT 'pending',
                  -- pending | submitted | approved | rejected
  submitted_at    TIMESTAMPTZ,
  reviewed_at     TIMESTAMPTZ,
  reviewer_note   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
)

-- Documentos do KYC: frente/verso do documento, selfie, comprovante de endereço
kyc_documents (
  id               SERIAL PRIMARY KEY,
  kyc_profile_id   INTEGER NOT NULL REFERENCES kyc_profiles(id),
  type             VARCHAR(50) NOT NULL,
                   -- identity_front | identity_back | selfie | address_proof
  file_ref         TEXT NOT NULL,   -- referência ao storage (S3 key, etc.)
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

### Rationale

- `address` como JSONB evita cinco colunas extras sem perder legibilidade; não é usado em filtros diretos.
- `cpf` com UNIQUE garante que um CPF não seja cadastrado em múltiplas contas.
- `file_ref` armazena apenas a referência ao arquivo (S3 key, GCS path); os arquivos em si não ficam no banco.
- A separação `kyc_profiles` / `kyc_documents` permite múltiplos documentos por perfil sem arrays.

---

## Consequências

**Positivas:**
- Fluxo de autenticação não toca `kyc_profiles` — sem joins no hot path.
- Status KYC pode evoluir independentemente da conta (resubmissão, rejeição parcial).
- Dados sensíveis (CPF, documentos) ficam em tabelas isoladas, facilitando auditoria e eventual criptografia por coluna.

**Negativas / Trade-offs:**
- Criação de conta agora envolve duas tabelas quando o KYC é submetido junto — requer transação atômica (ver ADR 0001).
- Consultas de perfil completo exigem JOIN entre `accounts`, `kyc_profiles` e `kyc_documents`.

---

## Referências

- ADR 0001 — Fluxo de Transações Atômicas
- LGPD — Lei nº 13.709/2018, Art. 5º (dados pessoais sensíveis)
