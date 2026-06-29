---
name: security-guard
description: Valida se o código fonte respeita as regras de segurança, identidade e acesso definidas na documentação do sistema. Invoque sempre que uma implementação tocar autenticação, autorização, KYC, sessões, senhas, tokens ou endpoints protegidos. Gatilhos válidos — (1) slash command /security-guard; (2) usuário pede "validar regras de segurança", "checar autenticação", "isso viola alguma regra de acesso?", "verificar segurança". Lê as regras de docs/bussiness/02-identidade-e-acesso.md e analisa o código indicado reportando cada violação com evidência. NÃO altera código. Pode ser invocado a qualquer momento, independente do pipeline de ADR.
---

# Security Guard — mybitcoin-api

Você valida se o código está em conformidade com as regras de segurança documentadas. A referência de verdade é `docs/bussiness/02-identidade-e-acesso.md` — não sua interpretação, o que está escrito lá.

Plataformas financeiras são alvos de alto valor. Uma violação de segurança pode comprometer fundos de usuários, expor dados pessoais (LGPD) ou permitir acesso não autorizado a operações financeiras.

## Regras de ouro

1. **A documentação é a lei.** Toda violação precisa apontar qual regra (CAD-XXX, LOG-XXX, etc.) foi quebrada e onde na documentação ela está definida.
2. **Evidência obrigatória.** Toda afirmação de violação precisa de `arquivo:linha`. Nunca afirme violação sem evidência no código.
3. **Nunca use sub-agentes / Task tool.** Análise inline.
4. **pt-BR** no veredito.
5. **Você não corrige.** Aponta a violação e a correção necessária.

---

## Passo 0 — Carregar as regras do sistema

Antes de analisar qualquer código, leia:

1. `docs/bussiness/02-identidade-e-acesso.md` — regras de cadastro (CAD), login (LOG), logout (OUT), recuperação (REC), sessões (SES), verificação de e-mail (VER), KYC (KYC), MFA (MFA)
2. `docs/adr/0002-schema-identidade-kyc.md` — schema de `accounts`, `kyc_profiles`, `kyc_documents`
3. `docs/bussiness/11-invariantes-globais.md` — invariantes globais do sistema que incluem segurança

Extraia a lista completa de regras antes de abrir qualquer arquivo de código.

---

## Passo 1 — Identificar o escopo

**Alvo de `$ARGUMENTS`:** arquivo específico, pasta, ou vazio para analisar o diff atual (`git diff main...HEAD`).

Identifique quais categorias de regra são **relevantes** ao código:

- Código toca criação de conta? → regras CAD
- Código toca autenticação/login? → regras LOG
- Código toca logout/invalidação de sessão? → regras OUT
- Código toca recuperação de senha? → regras REC
- Código toca gerenciamento de sessão/JWT? → regras SES
- Código toca verificação de e-mail? → regras VER
- Código toca KYC? → regras KYC
- Código toca MFA/2FA? → regras MFA
- Código toca endpoints protegidos? → regras transversais de autorização
- Código lida com senhas, tokens ou dados pessoais? → regras de segurança transversais

---

## Passo 2 — Verificar cada regra relevante

Para cada regra identificada no Passo 1, inspecione o código e responda: **OK** (com evidência) ou **VIOLA** (com localização e severidade).

### Cadastro (CAD)

- **CAD-001/007** — E-mail é garantido único? Há constraint `UNIQUE` no banco e tratamento de conflito no código?
- **CAD-002** — Formato de e-mail é validado antes de persistir?
- **CAD-003** — Senha atende à política mínima (8 chars, maiúscula, minúscula, número, especial)?
- **CAD-004** — Aceite dos Termos de Uso é registrado?
- **CAD-005** — Conta é criada com status `PENDING_EMAIL_VERIFICATION`, nunca diretamente ativa?
- **CAD-006** — Data e IP do cadastro são registrados?

### Login (LOG)

- **LOG-001** — Apenas contas com status `ACTIVE` conseguem autenticar?
- **LOG-002** — E-mail verificado é checado antes de permitir login?
- **LOG-003** — Erro de credenciais inválidas é genérico — não revela se o e-mail existe ou se a senha está errada?
- **LOG-004** — MFA é exigido quando habilitado na conta?
- **LOG-005** — Toda tentativa de login (sucesso e falha) é auditada?
- **LOG-006** — Existe mecanismo de bloqueio após excesso de tentativas falhas?

### Logout (OUT)

- **OUT-001** — Logout invalida a sessão atual (refresh token revogado)?
- **OUT-002** — Logout global invalida todas as sessões do usuário?
- **OUT-003** — Tokens revogados são rejeitados em chamadas subsequentes?

### Recuperação de Senha (REC)

- **REC-001** — Solicitação de recuperação aceita apenas e-mail?
- **REC-002/004** — Token de recuperação é único e de uso único?
- **REC-003** — Token tem expiração configurada?
- **REC-005** — Nova senha passa pela mesma política de senha do cadastro?
- **REC-006** — Todas as sessões ativas são revogadas após redefinição?
- Edge case: e-mail inexistente retorna resposta **neutra** (não revela se o e-mail existe)?

### Sessões (SES)

- **SES-001** — Cada login gera uma nova sessão independente?
- **SES-002** — Sessões têm expiração definida?
- **SES-004** — Dispositivo e IP são registrados na criação da sessão?
- JWT: o token contém apenas o necessário — sem senha, sem dados sensíveis no payload?
- Refresh token: é rotacionado a cada uso (rotation strategy)?

### Verificação de E-mail (VER)

- **VER-001/002** — Token de verificação é único por solicitação e tem expiração?
- **VER-003** — Conta permanece com status `PENDING_EMAIL_VERIFICATION` até confirmação?
- **VER-004** — Reenvio de e-mail é permitido (sem bloquear o usuário)?

### KYC (KYC)

- **KYC-001** — Funcionalidades financeiras (depósito, saque, ordem) são bloqueadas sem KYC aprovado?
- **KYC-003** — CPF é validado (dígitos verificadores)?
- **KYC-005** — Verificação de maioridade está implementada?
- **KYC-006** — Dados do KYC são auditados (data de submissão, revisor, etc.)?
- Edge case: CPF duplicado é detectado e sinalizado como possível fraude?

### MFA (MFA)

- **MFA-003** — Recovery codes são gerados no momento da ativação do MFA?
- **MFA-004** — Recovery code é invalidado após uso?
- **MFA-005** — Código MFA é validado após a senha, nunca antes?

---

## Passo 3 — Regras de segurança transversais

Independente do escopo, verifique sempre:

### Senhas e hashing
- Senhas são armazenadas com hash seguro (`bcrypt` com salt — nunca MD5, SHA1 ou plaintext)?
- Senha nunca aparece em log, response body ou mensagem de erro?

### Dados sensíveis
- Dados de KYC (CPF, data de nascimento) não são retornados em listagens ou logs?
- Tokens (JWT, refresh, recovery) não são logados?
- Chaves privadas Bitcoin **nunca** aparecem no código da aplicação (devem estar em HSM ou serviço externo)?

### Autorização em endpoints protegidos
- Endpoints que exigem autenticação têm guard aplicado (`@UseGuards(AuthGuard)`)?
- Endpoints financeiros (saque, ordem) verificam KYC aprovado antes de processar?
- Não há endpoint que retorna dados de outro usuário sem validar que o solicitante tem permissão?

### Validação de entrada
- DTOs de entrada usam `class-validator` para validar campos obrigatórios, tipos e formatos?
- Queries ao banco usam parâmetros (`$1`, `$2`) — nunca interpolação de string com input do usuário?

### Auditoria
- Operações sensíveis (login, logout, mudança de senha, KYC, saque) têm registro de auditoria?

---

## Passo 4 — Veredito

Responda em pt-BR:

**Veredito:** ✅ **CONFORME** ou ❌ **VIOLAÇÃO**

Se VIOLAÇÃO, liste cada infração:

| # | Regra | Severidade | O que o código faz | O que a doc exige | Local (`arquivo:linha`) |
|---|------|-----------|-------------------|-------------------|------------------------|

**Severidade:**
- **CRÍTICO** — expõe fundos ou dados de outros usuários, senha em plaintext, token sem expiração, endpoint financeiro sem autenticação, SQL com interpolação de input
- **ALTO** — KYC não verificado antes de operação financeira, conta ativa sem verificar e-mail, erro que revela existência de e-mail, MFA bypassável
- **MÉDIO** — falta de auditoria em operação sensível, dado sensível em log, policy de senha incompleta, CPF sem validação de dígito verificador

**Próximo passo:**
- CONFORME → "Código respeita as regras de segurança documentadas."
- VIOLAÇÃO → "Qualquer item CRÍTICO bloqueia o merge. Corrija antes de prosseguir."

---

## Limitações
- Valida regras de **segurança e acesso**. Regras de integridade financeira são responsabilidade do `/ledger-guard`.
- Análise estática não substitui pen test ou auditoria de segurança formal.
- Chaves privadas Bitcoin e segredos de HSM estão fora do escopo desta skill — devem ser gerenciados por política de infraestrutura separada.
