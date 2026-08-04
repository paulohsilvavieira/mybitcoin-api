
# ADR 0005 — Identity: Login e Logout

**Status:** Implementado

**PR:** https://github.com/paulohsilvavieira/mybitcoin-api/pull/5 (mergeado)

**Data:** 2026-08-01

**Autores:** Time de Backend

**Contexto relacionado:** ADR 0002 (Identity: Cadastro de Usuários), ADR 0004 (Transporte de Sessão via Cookie httpOnly)

**Gerado por:** skill `/adr-architect`

---

## Contexto

O bounded context `identity` tem hoje Cadastro (ADR 0002, CAD-001 a CAD-007) e a infraestrutura de Sessões (ADR 0004: cookie `__Host-session`, cookie CSRF `__Host-csrf`, `SessionAuthGuard`, `DomainErrorFilter`, `cookie-parser`, CORS) implementados e funcionando. `docs/bussiness/02-identidade-e-acesso.md` define ainda Login (LOG-001 a LOG-006) e Logout (OUT-001 a OUT-003) — nenhum dos dois implementado.

O ADR 0004 já deixou pronto o contrato que Login/Logout precisam consumir: `CreateSession` (mint de token + persistência), `RevokeSession`/`RevokeAllSessions` (revogação), `setSessionCookies`/`clearSessionCookies` (helpers de cookie), `SessionAuthGuard` (proteção de rota) e `DomainErrorFilter` (mapeamento de erro → HTTP). Este ADR fecha o elo que faltava: **validar credenciais e criar/revogar sessão a partir delas**, o único pedaço do fluxo de autenticação que ainda não existe.

Duas descobertas de código, feitas antes deste ADR, moldam o escopo:

1. **Verificação de e-mail não existe de fato.** `RegisterUser` gera um `verificationToken` mas nunca o persiste, e `EmailService.sendVerification` é um stub no-op (`identity.module.ts:52-56`). Nenhum usuário jamais transita de `PENDING_EMAIL_VERIFICATION` para `ACTIVE` hoje. LOG-002 ("email deve estar verificado") aplicado à risca bloquearia login para 100% dos usuários.
2. **`mybitcoin-front` está no template inicial do Vite.** `App.tsx` é o boilerplate padrão, sem roteador configurado (apesar de `react-router-dom` já ser dependência), sem cliente HTTP, sem páginas. Existe apenas um `useAuthStore` (Zustand) e um `ProtectedRoute` esqueleto, ambos nunca conectados a uma API real.

Este ADR cobre Login, Logout (sessão atual e global) e o endpoint de perfil (`GET /auth/me`) necessário para o frontend restaurar sessão — API e bootstrap mínimo do frontend (roteamento, cliente HTTP, páginas de login).

**Fora de escopo** (não implementado aqui, tratado como débito técnico documentado): MFA/2FA (LOG-004), bloqueio por excesso de tentativas (LOG-006), Recuperação de Senha, Verificação de E-mail, KYC.

---

## Forças em Jogo

- LOG-003 exige que credenciais inválidas não revelem qual campo está incorreto — usuário inexistente e senha errada devem produzir o mesmo erro
- LOG-005 exige auditoria de toda tentativa de login, inclusive falhas, sem que este ADR precise criar um mecanismo de auditoria novo (event bus/event store não existem no projeto — dívida já registrada no ADR 0004)
- LOG-002, aplicado literalmente, travaria o sistema inteiro porque verificação de e-mail não está implementada — decisão consciente de relaxar essa regra até o fluxo de verificação existir
- OUT-001/002/003 exigem idempotência: sessão já expirada ou token inválido não devem gerar erro
- O ADR 0004 já define o contrato de cookies/CSRF/guard — este ADR não pode reabrir essas decisões, só consumi-las
- `mybitcoin-front` não tem nenhuma infraestrutura de app (roteador, cliente HTTP) — sem isso, Login/Logout não têm como ser exercitados de ponta a ponta
- A sessão é 100% cookie `httpOnly` (ADR 0004) — o frontend nunca vê o token de sessão; o campo `token` do `useAuthStore` atual é resquício de um design de bearer token e está desalinhado com a decisão vigente

---

## Decisão

### Backend — Login

Novo use case `Login` (`application/login.usecase.ts`), injeta `UserRepository` e uma função `comparePassword: (plain: string, hash: string) => Promise<boolean>` (mesmo padrão de injeção usado por `hashPassword` em `RegisterUser`, ADR 0002).

Fluxo:
1. `Email.create(input.email)` — formato inválido lança `InvalidEmailError` (422, já existente) — não é um vazamento de LOG-003 porque é validação de formato, não revela existência de conta.
2. Busca usuário por e-mail. Não encontrado → `InvalidCredentialsError` (genérico, LOG-003).
3. Compara senha via `comparePassword`. Não bate → `InvalidCredentialsError` (mesmo erro do passo anterior — usuário não distingue "e-mail não existe" de "senha errada").
4. Se `user.status.isSuspended()` → `AccountSuspendedError` (erro específico — decisão do usuário: suspensão não é segredo de segurança como senha, e o usuário suspenso legítimo precisa saber o motivo).
5. `PENDING_EMAIL_VERIFICATION` e `ACTIVE` são **ambos aceitos** (LOG-002 relaxado — ver Rationale).
6. Retorna dados do usuário (`userId`, `name`, `email`, `status`) — **não** cria sessão; isso é responsabilidade do controller, que encadeia com `CreateSession` (já existente, ADR 0004).

O controller (`POST /auth/login`) orquestra: `Login.execute()` → `CreateSession.execute({ userId, deviceInfo: <User-Agent>, ipAddress: <IP> })` → `setSessionCookies(response, { token, expiresAt })` → responde `200` com `{ userId, name, email, status }`.

### Backend — Logout (sessão atual)

Novo use case `Logout` (`application/logout.usecase.ts`), injeta `SessionRepository`. Recebe o token em claro (do cookie), calcula o hash (mesmo padrão de `ValidateSession`), busca a sessão por `findByTokenHash`. Se encontrada e ainda não revogada, revoga e retorna o evento `SessionRevoked` (`reason: 'user_requested'`). Se não encontrada, já revogada, ou token ausente/inválido — **não lança erro**, retorna `{ event: null }`. Idempotência total, conforme os edge cases OUT-001/OUT-003 da documentação.

`POST /auth/logout` **não usa `SessionAuthGuard`** — lê `request.cookies['__Host-session']` diretamente. Sempre chama `clearSessionCookies(response)` e sempre responde `204`, independentemente do estado da sessão.

**Por quê sem guard:** o guard rejeitaria com `401` quando não há cookie ou a sessão já expirou — exatamente os dois casos que a documentação de negócio pede para tratar como sucesso idempotente. Colocar o guard aqui contradiria OUT-001/OUT-003.

### Backend — Logout global

Reusa `RevokeAllSessions` (ADR 0004, já existente e implementado, apenas nunca exposto por um controller). `POST /auth/logout-all` **usa `SessionAuthGuard`** (precisa saber `userId` de forma confiável — diferente do logout de sessão única, aqui não há ambiguidade a tolerar: se não há sessão válida, não há "todas as sessões do usuário" para revogar). Chama `RevokeAllSessions.execute({ userId: request.user.userId, reason: 'logout_all' })` (o valor `'logout_all'` já existe no enum `SessionRevokedReason` do ADR 0004, nunca usado até agora), depois `clearSessionCookies(response)`, responde `204`.

### Backend — Perfil do usuário autenticado

Novo use case `GetCurrentUser` (`application/get-current-user.usecase.ts`), injeta `UserReadRepository`, busca por `userId`. `GET /auth/me` usa `SessionAuthGuard`, retorna `{ id, name, email, status }`. Necessário para o frontend restaurar o estado de autenticação ao recarregar a página, já que a sessão é um cookie `httpOnly` opaco — o frontend não tem outra forma de saber quem está autenticado.

### Backend — Auditoria (LOG-005)

Log estruturado, mesmo padrão de `RegisterUser` (`this.logger.log/warn` com `operation`, `email`, `reason`, `duration_ms`) no controller, cobrindo: tentativa iniciada, sucesso, falha por credenciais inválidas, falha por conta suspensa. Sem tabela nova, sem event bus — não expande a dívida arquitetural já registrada no ADR 0004 (domain events sem mecanismo de publicação).

### Backend — Erros de domínio novos

**Correção pós-validação (gap 1 — ALTO):** `DomainErrorFilter` devolve `error.message` ao cliente **verbatim** (`domain-error.filter.ts:22`). O padrão já usado no módulo embute o valor recebido na mensagem (`EmailAlreadyExistsError`: `` `Email '${email}' is already registered` ``; `SessionNotFoundError`: `` `Session '${sessionId}' not found` ``). Copiar esse padrão para `InvalidCredentialsError` reabriria a enumeração de contas que LOG-003 existe para fechar (a mensagem ecoaria o e-mail informado, ou pior, dois textos ligeiramente diferentes para "e-mail não existe" vs "senha errada"). Por isso os dois erros abaixo usam **mensagem estática, sem interpolação**, explicitamente diferente do padrão do resto do módulo:

- `InvalidCredentialsError` (`identity/domain/errors/invalid-credentials.error.ts`) — `code: 'INVALID_CREDENTIALS'`. Construtor **sem parâmetros**, mensagem fixa: `super('Invalid email or password')`. Usado idêntico nos dois branches (e-mail não encontrado, senha incorreta) — nem o código nem a mensagem podem variar entre os dois casos.

**Correção pós-validação (gap 2 — MÉDIO):** mesma mecânica seguida pelo padrão de `SessionNotFoundError(sessionId)` vazaria o UUID interno do usuário na resposta HTTP sem necessidade (o cliente já sabe qual conta tentou logar).

- `AccountSuspendedError` (`identity/domain/errors/account-suspended.error.ts`) — `code: 'ACCOUNT_SUSPENDED'`. Construtor recebe `userId` (para uso em log estruturado no controller, LOG-005), mas a mensagem exposta ao cliente é estática e não o contém: `super('This account has been suspended')`.
- `UserNotFoundError` (`identity/domain/errors/user-not-found.error.ts`) — `code: 'USER_NOT_FOUND'`. Novo erro decorrente da correção do gap 3 (ver seção "Edge Cases & Erros de Domínio"), usado por `GetCurrentUser` quando o `userId` de uma sessão válida não resolve para um usuário existente. Mensagem estática: `super('User not found')` (não precisa embutir `userId` — o valor já veio do próprio cookie de sessão do requisitante, não é informação nova para ele).

Adicionados ao mapa de `DomainErrorFilter` (ADR 0004, `src/infrastructure/http/domain-error.filter.ts`): `INVALID_CREDENTIALS` → 401, `ACCOUNT_SUSPENDED` → 403, `USER_NOT_FOUND` → 401 (mesmo status de sessão inválida — ver Rationale abaixo).

### Frontend — Bootstrap mínimo

Como `App.tsx` ainda é o boilerplate do Vite e não existe cliente HTTP nem roteador configurado, este ADR inclui o bootstrap mínimo necessário para Login/Logout funcionarem de ponta a ponta:

- **Cliente HTTP** (`src/lib/api-client.ts`): wrapper sobre `fetch` com `credentials: 'include'` (obrigatório para o navegador enviar/receber os cookies `__Host-session`/`__Host-csrf` — ADR 0004). Para métodos mutantes (`POST`/`PUT`/`PATCH`/`DELETE`), lê o cookie `__Host-csrf` via `document.cookie` (não-`httpOnly`, por design do ADR 0004) e injeta o header `X-CSRF-Token`. Em erro, usa `parseApiError`/`ApiError` já existentes em `src/lib/api-errors.ts`.
- **Roteador**: `react-router-dom` configurado em `App.tsx` (`createBrowserRouter`), com rotas `/login` (pública) e uma rota protegida mínima de exemplo usando `ProtectedRoute` (já existe, sem alterações de lógica).
- **Service de auth** (`src/services/auth.service.ts`): `login(email, password)`, `logout()`, `logoutAll()`, `getMe()` — chamam o cliente HTTP contra `POST /auth/login`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/me`.
- **Store** (`src/stores/use-auth-store.ts`): remove o campo `token` (nunca acessível ao JS, por design do ADR 0004). Mantém `user: User | null`, `isLoading`, `kycStatus`, `setUser`, `setLoading`, `setKycStatus`, `logout` (agora só limpa estado local — a chamada real ao backend é do service).
- **Página de Login** (`src/pages/login-page.tsx`): formulário e-mail/senha, chama `authService.login`, popula `useAuthStore` com o usuário retornado, redireciona para a rota protegida de exemplo (ou para `location.state.from`, padrão já usado em `ProtectedRoute`).
- **Bootstrap de sessão**: no carregamento inicial da aplicação, chama `authService.getMe()`; sucesso popula `useAuthStore.setUser`, falha (401) mantém `user: null`; em ambos os casos `setLoading(false)` ao final — consistente com o uso de `isLoading` já feito por `ProtectedRoute`.

### Rationale

**Por que relaxar LOG-002 em vez de bloquear login até Verificação de E-mail existir?**
Bloquear login incondicionalmente para contas não verificadas, sem que exista nenhum caminho para verificá-las (token gerado nunca é persistido), tornaria o sistema inutilizável por qualquer usuário cadastrado — não é um trade-off aceitável para uma decisão que pode ser revertida quando Verificação de E-mail (fora de escopo deste ADR) for implementada. A decisão é documentada explicitamente aqui para não ser confundida com um descuido.

**Por que `Login` retorna dados do usuário em vez de já criar a sessão internamente?**
Mantém o use case de domínio (validação de credenciais) desacoplado da decisão de infraestrutura de sessão (ADR 0004, já implementada como use case separado `CreateSession`). O controller orquestra os dois — mesmo padrão de composição que `RegisterUser` já não faz (mas poderia) e que este ADR não tem motivo para desviar: `CreateSession` é reutilizável por qualquer fluxo futuro que precise mintar uma sessão (ex: login social, se um dia existir).

**Por que erro específico para conta suspensa mas genérico para credenciais erradas?**
São ameaças diferentes. Enumeração de contas via senha errada é o ataque clássico que LOG-003 mitiga (tentar e-mails em massa até um retornar "senha errada" em vez de "e-mail não existe"). Suspensão já pressupõe que a plataforma conhece e decidiu sobre aquela conta — não há superfície de enumeração nova em confirmar isso para quem já sabe o e-mail e a senha corretos.

**Por que `UserNotFoundError` mapeia para 401 e não para 404?**
`GetCurrentUser` só é alcançado depois que `SessionAuthGuard` já validou uma sessão ativa — chegar a esse ponto e não achar o `User` correspondente não é um "recurso que legitimamente pode não existir" do ponto de vista do cliente (como `SessionNotFoundError` ao tentar revogar sessão de outro usuário), é uma violação de invariante (sessão não pode existir sem usuário). Tratar como `401` e limpar os cookies (mesmo comportamento de `SessionExpiredError` no `SessionAuthGuard`, ADR 0004) força o cliente a re-autenticar em vez de expor um estado inconsistente como se fosse um `404` de negócio normal.

**Por que logout sem guard e logout-all com guard?**
Logout de uma sessão específica é sobre "esquecer este cookie", uma operação que faz sentido mesmo se o cookie já não identifica nada válido — daí a idempotência exigida pela doc. Logout-all é sobre "encontre todas as sessões deste usuário", que exige saber quem é o usuário de forma confiável; sem sessão válida, não há usuário a resolver, então `401` é a resposta correta (não há nada de ambíguo ou "quase-válido" a tolerar).

---

## Impacto nos Bounded Contexts

| Bounded Context | Impacto | Como se comunica |
|----------------|---------|-----------------|
| identity | Novos use cases `Login`, `Logout`, `GetCurrentUser`; novos erros `InvalidCredentialsError`, `AccountSuspendedError`, `UserNotFoundError`; consome `CreateSession`/`RevokeAllSessions`/cookies do ADR 0004 | Import direto (mesmo módulo) |
| financial | Nenhum | — |
| shared | `DomainError` reutilizado | Import |
| infrastructure (compartilhada) | `DomainErrorFilter` (ADR 0004) ganha 3 novas entradas no mapa código→status | Edição do arquivo existente |
| frontend (`mybitcoin-front`) | Bootstrap de roteador, cliente HTTP, service de auth, página de login, store sem campo `token` | Novo projeto consumidor da API |

**Entidades de domínio afetadas:** nenhuma nova (reutiliza `User`, `Session` existentes)
**Domain Events:** nenhum novo — `Login` não cria evento (falha de login não é fato de domínio auditável via evento neste ADR, ver decisão de auditoria por log); `Logout`/`RevokeAllSessions` reusam `SessionRevoked` (ADR 0004)
**Interfaces de repositório afetadas:** nenhuma nova — `UserRepository`, `UserReadRepository`, `SessionRepository` já têm os métodos necessários
**Migrations necessárias:** não

---

## Checklist de Arquitetura

- [x] Nenhum arquivo em `identity/domain/` importa de `identity/infrastructure/` ou `identity/presentation/`
- [x] Valores monetários usam `BIGINT`/`bigint` — não aplicável (sem valores financeiros)
- [x] Erros de domínio são subclasses de `DomainError` (`InvalidCredentialsError`, `AccountSuspendedError`, `UserNotFoundError`)
- [x] Operações multi-tabela usam `UnitOfWork` — não aplicável (cada use case toca uma única tabela: `Login` só lê `users`; `Logout`/`RevokeAllSessions` só escrevem `sessions`)
- [x] Entidades não recebem dependências de infraestrutura no construtor — `comparePassword` é injetado no use case (application), igual ao padrão de `hashPassword` em `RegisterUser`

---

## Plano de Implementação

### 1. Domínio (`src/modules/identity/domain/`)
- [ ] Erro `InvalidCredentialsError` — `errors/invalid-credentials.error.ts` (`code = 'INVALID_CREDENTIALS'`, construtor sem parâmetros, mensagem estática `'Invalid email or password'` — **nunca interpolar e-mail/senha/qualquer dado do request**)
- [ ] Erro `AccountSuspendedError` — `errors/account-suspended.error.ts` (`code = 'ACCOUNT_SUSPENDED'`, construtor recebe `userId` só para log, mensagem estática `'This account has been suspended'` sem o `userId`)
- [ ] Erro `UserNotFoundError` — `errors/user-not-found.error.ts` (`code = 'USER_NOT_FOUND'`, construtor recebe `userId` só para log, mensagem estática `'User not found'`)

### 2. Aplicação (`src/modules/identity/application/`)
- [ ] Use Case `Login` — `login.usecase.ts` (email/senha → dados do usuário; erros conforme fluxo descrito na Decisão)
- [ ] Use Case `Logout` — `logout.usecase.ts` (token em claro → revoga sessão por hash, idempotente, nunca lança erro)
- [ ] Use Case `GetCurrentUser` — `get-current-user.usecase.ts` (userId → dados do usuário via `UserReadRepository`; `findById` retornando `null` lança `UserNotFoundError`, ver Edge Cases)

### 3. Infraestrutura (`src/modules/identity/infrastructure/`, `src/infrastructure/http/`)
- [ ] Nenhuma migration nova
- [ ] `DomainErrorFilter` (`src/infrastructure/http/domain-error.filter.ts`): adicionar `INVALID_CREDENTIALS` → 401, `ACCOUNT_SUSPENDED` → 403 e `USER_NOT_FOUND` → 401 ao mapa existente

### 4. Presentation (`src/modules/identity/presentation/`)
- [ ] DTO `LoginDto` — `dto/login.dto.ts` (`email`, `password`)
- [ ] DTO `LoginResponseDto` — `dto/login-response.dto.ts` (`userId`, `name`, `email`, `status`)
- [ ] DTO `MeResponseDto` — `dto/me-response.dto.ts` (`id`, `name`, `email`, `status`)
- [ ] `identity.module.ts`: registrar `Login` (inject `UserRepository` + `comparePassword: (plain, hash) => bcrypt.compare(plain, hash)`), `Logout` (inject `SessionRepository`), `GetCurrentUser` (inject `UserReadRepository`)
- [ ] `identity.controller.ts`:
  - [ ] `POST /auth/login` — chama `Login` → `CreateSession` → `setSessionCookies` → `200`
  - [ ] `POST /auth/logout` — sem guard, lê cookie diretamente → `Logout` → `clearSessionCookies` → `204` sempre
  - [ ] `POST /auth/logout-all` — `@UseGuards(SessionAuthGuard)` → `RevokeAllSessions({ reason: 'logout_all' })` → `clearSessionCookies` → `204`
  - [ ] `GET /auth/me` — `@UseGuards(SessionAuthGuard)` → `GetCurrentUser` → `200`
  - [ ] Log estruturado (LOG-005) em cada branch de `POST /auth/login` (início, sucesso, credenciais inválidas, conta suspensa)
- [ ] Swagger: exemplos de sucesso e erro para os 4 endpoints, seguindo o padrão de `register` (`@ApiOperation`, `@ApiOkResponse`, `@ApiUnauthorizedResponse`, `@ApiForbiddenResponse`)

### 5. Frontend (`mybitcoin-front/src/`)
- [ ] `lib/api-client.ts` — wrapper `fetch` com `credentials: 'include'`, injeção de `X-CSRF-Token` em métodos mutantes, integração com `ApiError`/`parseApiError` existentes
- [ ] `services/auth.service.ts` — `login`, `logout`, `logoutAll`, `getMe`
- [ ] `stores/use-auth-store.ts` — remover campo `token`
- [ ] `App.tsx` — configurar `react-router-dom` (`createBrowserRouter`), rota pública `/login`, rota protegida mínima de exemplo
- [ ] `pages/login-page.tsx` — formulário de login, integração com `authService.login` + `useAuthStore`
- [ ] Bootstrap de sessão no carregamento da app — chama `getMe()`, popula ou limpa `useAuthStore`, `setLoading(false)` ao final

---

## Edge Cases & Erros de Domínio

| Caso | Erro de domínio | Comportamento decidido |
|------|----------------|----------------------|
| E-mail não cadastrado | `InvalidCredentialsError` | `401`, mensagem genérica (LOG-003) |
| Senha incorreta | `InvalidCredentialsError` | `401`, mesma mensagem genérica do caso anterior |
| E-mail com formato inválido | `InvalidEmailError` (já existe, ADR 0002) | `422` — validação de formato, não é vazamento de LOG-003 |
| Conta `SUSPENDED` | `AccountSuspendedError` | `403`, mensagem específica |
| Conta `PENDING_EMAIL_VERIFICATION` | — | Login permitido (LOG-002 relaxado, ver Rationale) |
| Conta `ACTIVE` | — | Login permitido |
| MFA habilitado (LOG-004) | — | Fora de escopo — MFA não existe no projeto; não implementado |
| Excesso de tentativas (LOG-006) | — | Fora de escopo — rate limiting/lockout não existe no projeto; não implementado |
| Logout sem cookie de sessão | — (nunca lança) | `204` idempotente, cookies limpos de qualquer forma |
| Logout com sessão já expirada/revogada | — (nunca lança) | `204` idempotente |
| Logout-all sem sessão válida | — (guard rejeita antes do use case) | `401` |
| `GET /auth/me` sem sessão válida | — (guard rejeita antes do use case) | `401` |
| `GET /auth/me` com sessão válida mas `userId` não resolve para um `User` existente (`UserReadRepository.findById` → `null`) | `UserNotFoundError` | `401`, cookies limpos — tratado como invariante quebrada (sessão não pode existir sem usuário), não como 404 de negócio normal (ver Rationale) |

---

## Plano de Teste

- [ ] Unit (use case `Login`): credenciais válidas + status `ACTIVE` → sucesso; credenciais válidas + `PENDING_EMAIL_VERIFICATION` → sucesso; e-mail inexistente → `InvalidCredentialsError`; senha errada → `InvalidCredentialsError` (mesma classe/mensagem dos dois casos); conta `SUSPENDED` → `AccountSuspendedError`
- [ ] Unit (use case `Logout`): token válido de sessão ativa → revoga e retorna evento; token de sessão já revogada → não lança, `event: null`; token inexistente → não lança, `event: null`
- [ ] Unit (use case `GetCurrentUser`): userId existente → retorna dados; userId inexistente (`UserReadRepository.findById` retorna `null`) → `UserNotFoundError`
- [ ] Unit (erros `InvalidCredentialsError`/`AccountSuspendedError`/`UserNotFoundError`): mensagem é estática e não contém e-mail/senha/UUID interpolado — teste de regressão direto contra o gap 1/2 da validação (ex.: `expect(new InvalidCredentialsError().message).toBe('Invalid email or password')`, o mesmo texto independente do que causou o erro)
- [ ] Unit (`DomainErrorFilter`): `INVALID_CREDENTIALS` → 401, `ACCOUNT_SUSPENDED` → 403, `USER_NOT_FOUND` → 401
- [ ] Integração (`identity.controller`, `POST /auth/login`): fluxo completo com banco real — sucesso seta os dois cookies (`__Host-session` httpOnly, `__Host-csrf` não-httpOnly); falha não seta cookie nenhum
- [ ] Integração (`POST /auth/logout`): com sessão válida → revoga no banco, limpa cookies, `204`; sem cookie → `204` sem tocar o banco; com cookie de sessão já revogada → `204`
- [ ] Integração (`POST /auth/logout-all`): revoga todas as sessões ativas do usuário (`findActiveByUserId` retorna vazio depois); sem sessão válida → `401`
- [ ] Integração (`GET /auth/me`): sessão válida → retorna dados do usuário; sem sessão → `401`
- [ ] Negativo: tentativas de login com e-mail de outro usuário existente + senha aleatória não devem distinguir erro do caso "e-mail não existe" (mesmo `code`/mensagem)

---

## Fluxos

```
1. POST /auth/login { email, password }
   → Login.execute() → valida credenciais, status da conta
   → Sucesso: CreateSession.execute({ userId, deviceInfo, ipAddress })
   → setSessionCookies(response, { token, expiresAt })
   → Log estruturado (sucesso)
   → 200 { userId, name, email, status }

   → Falha (credenciais): Log estruturado (falha) → 401 INVALID_CREDENTIALS
   → Falha (suspenso): Log estruturado (falha) → 403 ACCOUNT_SUSPENDED

2. POST /auth/logout
   → Lê cookie __Host-session diretamente (sem guard)
   → Logout.execute({ token }) — nunca lança
   → clearSessionCookies(response)
   → 204 (sempre)

3. POST /auth/logout-all
   → SessionAuthGuard valida sessão, popula request.user
   → RevokeAllSessions.execute({ userId, reason: 'logout_all' })
   → clearSessionCookies(response)
   → 204

4. GET /auth/me
   → SessionAuthGuard valida sessão, popula request.user
   → GetCurrentUser.execute({ userId })
   → 200 { id, name, email, status }

5. (Frontend) Carregamento da aplicação
   → authService.getMe()
   → Sucesso: useAuthStore.setUser(user)
   → Falha (401): useAuthStore.setUser(null)
   → useAuthStore.setLoading(false)
```

---

## Consequências

**Positivas:**
- Fecha o fluxo de autenticação de ponta a ponta (cadastro → login → sessão protegida → logout), consumindo 100% da infraestrutura já pronta do ADR 0004 sem reabrir nenhuma decisão de segurança
- Erro genérico para credenciais inválidas fecha a superfície de enumeração de contas via login (LOG-003)
- `Logout` idempotente elimina uma classe inteira de bugs de frontend (race condition entre múltiplas abas fazendo logout simultâneo, retry após timeout)
- `mybitcoin-front` sai do boilerplate para uma base mínima funcional (roteador, cliente HTTP, fluxo de auth real)

**Negativas / Trade-offs:**
- LOG-002 relaxado é uma divergência documentada, não uma implementação completa da regra — precisa ser revisitada (endurecida de volta) quando Verificação de E-mail for implementada; risco de esquecimento se não houver um lembrete além deste ADR
- LOG-004 (MFA) e LOG-006 (lockout por tentativas) ficam sem nenhuma proteção — a API aceita tentativas de login ilimitadas hoje; aceitável para o estágio atual do projeto, mas é uma lacuna de segurança real, não apenas teórica
- Auditoria via log estruturado (não persistida em tabela/evento consultável) significa que investigar tentativas de login históricas depende de um sistema de agregação de logs externo, que o projeto não tem hoje
- Escopo de frontend maior que "só login/logout": inclui bootstrap de roteador e cliente HTTP que qualquer feature futura de UI também precisaria — decisão consciente de fazer uma vez aqui em vez de cada feature reinventar

---

## Decisões do Usuário

> Confirmadas no grelhamento (Passo 2 da skill). Não são suposições do arquiteto.

- 2026-08-01 — Escopo desta pipeline → Login + Logout (Recuperação de Senha, Verificação de E-mail, KYC, MFA ficam fora)
- 2026-08-01 — LOG-002 (email verificado obrigatório) → Relaxado: login permitido tanto para `ACTIVE` quanto `PENDING_EMAIL_VERIFICATION`, decisão reversível quando Verificação de E-mail existir
- 2026-08-01 — Endpoint de perfil → Incluir `GET /auth/me` neste ADR (necessário para o frontend restaurar sessão no reload)
- 2026-08-01 — Auditoria de LOG-005 → Log estruturado (padrão de `RegisterUser`), sem tabela nova
- 2026-08-01 — `reason` do logout global em `RevokeAllSessions` → Novo valor `'logout_all'` (já previsto como extensão no ADR 0004)
- 2026-08-01 — Campo `token` no `useAuthStore` do frontend → Remover (sessão é 100% cookie `httpOnly`, JS nunca tem acesso ao token)
- 2026-08-01 — Conta suspensa no login → Erro específico `AccountSuspendedError` (403), não o erro genérico de credenciais
- 2026-08-01 — Idempotência do logout de sessão única → `POST /auth/logout` sem `SessionAuthGuard`, sempre `204`, mesmo sem cookie válido
- 2026-08-01 — Escopo do frontend → Bootstrap completo (roteador + cliente HTTP + página de login), não só camada de integração
- 2026-08-01 — Gap 4 da validação (login CSRF / fixação de sessão via form POST cross-site em `POST /auth/login`, sem CSRF possível porque não há sessão prévia) → Aceito como fora de escopo deste ADR, mesma categoria de risco já aceito para LOG-004/LOG-006. Não bloqueia aprovação

---

## Referências

- ADR 0002 — Identity: Cadastro de Usuários
- ADR 0004 — Transporte de Sessão via Cookie httpOnly
- `docs/bussiness/02-identidade-e-acesso.md` — Regras LOG-001 a LOG-006, OUT-001 a OUT-003
- `docs/architecture/02-clean-architecture-ddd-fundamentos.md` — Princípios
- `docs/architecture/03-estrutura-projeto.md` — Estrutura de pastas

---

## Validação (Estágio 2) — 2026-08-01

### Veredito: 🔁 REVISAR

### Checklist

| Bloco | Item | Status | Evidência |
|---|---|---|---|
| A. Regra de Dependência | `Login`/`Logout`/`GetCurrentUser` não importam infra/presentation | OK | Plano de Implementação descreve os três como classes de `application/` recebendo apenas interfaces de domínio (`UserRepository`, `SessionRepository`, `UserReadRepository`) e uma função injetada (`comparePassword`), mesmo padrão de `hashPassword` em `RegisterUser` (`register-user.usecase.ts:15-19`) |
| A. Regra de Dependência | Repositórios acessados só via interface de domínio | OK | `UserRepository`, `SessionRepository`, `UserReadRepository` já existem como abstract classes em `domain/repositories/`; nenhuma query nova, nenhum SQL inline proposto |
| B. Modelagem DDD | Entidades com identidade clara | N/A | Nenhuma entidade nova — reusa `User`/`Session` |
| B. Value Objects | Conceitos sem identidade cobertos | OK | Reusa `Email`, `UserId`, `UserStatus` existentes; não precisa de VO novo |
| B. Invariantes no aggregate | — | N/A | Nenhuma invariante nova de `User`/`Session` introduzida |
| B. Domain Events | Fatos relevantes emitem evento | OK, com nota | `Logout` reusa `SessionRevoked` (ADR 0004); `Login` conscientemente não emite evento (decisão documentada na seção "Rationale" e em "Decisões do Usuário" — auditoria via log estruturado). Coerente, não é omissão silenciosa |
| **B. Erros tipados — mensagem não deve vazar informação que a própria regra pretende esconder** | — | **GAP — ALTO** | O padrão já estabelecido no módulo embute o valor recebido na mensagem do erro, que é devolvida ao cliente **verbatim** por `DomainErrorFilter` (`domain-error.filter.ts:22`: `response.status(status).json({ code: error.code, message: error.message })`) — ver `EmailAlreadyExistsError` (`super(\`Email '${email}' is already registered\`)`) e `SessionNotFoundError` (`super(\`Session '${sessionId}' not found\`)`). O ADR especifica que `InvalidCredentialsError` deve ser **o mesmo erro** para "e-mail não encontrado" e "senha errada" (LOG-003, seção Decisão item 3), mas não diz explicitamente que a mensagem **não pode conter o e-mail informado** nem qualquer dado que distinga os dois casos. Se o executor seguir o padrão existente do módulo (que sempre embute o parâmetro recebido), a mensagem viraria algo como `"Invalid credentials for 'user@example.com'"` — o que não vaza qual campo errou, mas ainda **confirma a existência da conta** ao ecoar o e-mail de volta com uma mensagem construída a partir dele vs. uma mensagem genérica estática, e mais grave: um erro de copy-paste do padrão (`super(\`Email '${email}' not found\`)` em vez do genérico) reintroduziria a distinção que LOG-003 existe para eliminar |
| **B. Erros tipados — `AccountSuspendedError` expõe identificador interno ao cliente** | — | **GAP — MÉDIO** | Mesma mecânica do gap acima: se `AccountSuspendedError` seguir o padrão de `SessionNotFoundError(sessionId)` e embutir `userId` (UUID interno) na mensagem, esse UUID vaza para a resposta HTTP sem necessidade — o cliente já sabe qual conta tentou logar (foi ele que enviou o e-mail), não precisa do UUID interno do agregado na mensagem de erro |
| C. Precisão monetária | — | N/A | Nenhum valor monetário |
| D. UnitOfWork/atomicidade | `Login` só lê, `Logout`/`RevokeAllSessions` só escrevem em `sessions` (tabela única) | OK | Nenhuma operação multi-tabela proposta |
| **D. Consistência de leitura (ADR 0003)** | `Login` usa repositório de escrita (não a réplica) para checar credenciais | OK, verificado | ADR 0003 (`0003-read-write-database-replication.md:395`) recomenda explicitamente: "casos que exigem leitura consistente com a última escrita devem usar o repositório de escrita". A seção "Decisão" deste ADR 0005 especifica `Login` injetando `UserRepository` (write), não `UserReadRepository` — correto, evita falso `InvalidCredentialsError` por lag de réplica logo após um cadastro |
| E. Schema | Nenhuma migration | OK | Confirmado — nenhuma coluna/tabela nova necessária para Login/Logout/`GET /auth/me` |
| F. Edge cases — registro inexistente | — | OK | Tabela de Edge Cases cobre e-mail não cadastrado, senha incorreta, conta suspensa |
| **F. Edge cases — `GetCurrentUser` quando `findById` retorna `null`** | — | **GAP — MÉDIO** | A convenção do projeto (`CLAUDE.md`: "Métodos `find*` retornam entidade de domínio ou `null` — nunca `undefined`") implica que `UserReadRepository.findById` pode retornar `null`. O ADR não decide o comportamento desse caso — a seção "Plano de Teste" apenas registra a ambiguidade ("decidir explicitamente... não deve ocorrer em uso normal") sem resolvê-la na tabela de Edge Cases, que é o lugar obrigatório para esse tipo de decisão segundo o próprio template da skill. Fica sem erro tipado definido para um caminho de código que existe e precisa compilar/retornar algo |
| F. Edge cases — operação duplicada/idempotência | Logout idempotente | OK | Coberto explicitamente (token ausente/inválido/já revogado → sempre 204, nunca lança) |
| F. Edge cases — falha de integração externa | N/A | N/A | Nenhuma integração externa nova (Bitcoin RPC, etc.) |
| G. Plano de teste | Cobre os edge cases do ADR | OK, com a lacuna do gap acima | Cenários de `Login`/`Logout`/`DomainErrorFilter`/integração cobertos; falta apenas o cenário de `GetCurrentUser` com usuário não encontrado, decorrente do gap acima |
| G. Plano de teste | Inclui integração com banco real | OK | Seção "Plano de Teste" lista testes de integração para os 4 endpoints |
| G. Plano de teste | Verifica Regra de Dependência | OK | Implícito pela ausência de import cruzado nos use cases descritos; module já teria esse tipo de teste arquitetural em `arch-guard` na Etapa 7 da pipeline, não precisa duplicar aqui |
| H. Plano de implementação | Ordem domain → application → infra → presentation → frontend | OK | Seções 1-5 seguem essa ordem |
| — | Nota informativa (não é gap deste ADR) | — | `Password.create()` (política de senha CAD-003) é código morto — `RegisterUser` (`register-user.usecase.ts:53`) chama `this.hashPassword(input.password)` diretamente sobre a senha crua, nunca instancia `Password`. Ou seja, a política de senha (8+ chars, maiúscula, minúscula, número, especial) **não é hoje efetivamente aplicada** no cadastro, apesar de `WeakPasswordError` existir. Isso não é causado nem corrigido por este ADR 0005 (que só consome `user.passwordHash` já hasheado, igual `RegisterUser` faz) — registrado aqui para não ser confundido com escopo resolvido, mesmo padrão de nota que o ADR 0004 já fez para o evento `UserRegistered` morto |
| — | Nota informativa (não é gap deste ADR) | — | `POST /auth/login` fica fora do `SessionAuthGuard` por definição (não há sessão ainda) e portanto fora da checagem de CSRF do ADR 0004 — um cross-site form POST para `/auth/login` ainda é fisicamente possível (o navegador envia o POST; `SameSite=Strict` só impede cookies *existentes* de serem anexados, não bloqueia a requisição em si) e, se o atacante souber e-mail/senha da vítima, resultaria em "login CSRF" (fixação de sessão sob controle do atacante no navegador da vítima). Risco aceito como BAIXO/fora de escopo deste ADR, mesma categoria de LOG-004/LOG-006 já deferidos — mas deve ficar registrado, não silencioso |

### Gaps (ordenados por severidade)

| # | Severidade | Gap | Evidência | Correção exigida |
|---|---|---|---|---|
| 1 | ALTO | `InvalidCredentialsError` não tem mensagem especificada; o padrão existente do módulo embutiria o e-mail recebido na mensagem, arriscando reabrir a enumeração de contas que LOG-003 existe para fechar | `domain-error.filter.ts:22` (mensagem vai ao cliente verbatim); `email-already-exists.error.ts:7`, `session-not-found.error.ts:7` (padrão de embutir o parâmetro) | Especificar no ADR, na seção "Decisão" ou no Plano de Implementação: `InvalidCredentialsError` usa uma mensagem **estática**, sem interpolar e-mail/senha/qualquer dado do request (ex.: `super('Invalid email or password')`), idêntica nos dois branches (e-mail não encontrado e senha errada) |
| 2 | MÉDIO | `AccountSuspendedError` sem mensagem especificada; risco de embutir `userId` (UUID interno) na resposta HTTP seguindo o padrão de `SessionNotFoundError` | `session-not-found.error.ts:7` (padrão do módulo) | Especificar mensagem sem UUID interno, ex.: `super('This account has been suspended')`, mesmo que o construtor ainda receba `userId` para uso em log estruturado (não na mensagem exposta) |
| 3 | MÉDIO | `GetCurrentUser` sem decisão de erro tipado para `findById` retornando `null` | Seção "Plano de Teste" registra a ambiguidade sem resolvê-la; ausente da tabela "Edge Cases & Erros de Domínio" | Adicionar linha na tabela de Edge Cases: `userId` de sessão válida não encontrado em `users` → erro tipado (ex.: `UserNotFoundError`, mapeado a 401 em `DomainErrorFilter`, mesmo tratamento de sessão inválida) — trata como violação de invariante (sessão não pode existir sem usuário), não como fluxo de negócio esperado |
| 4 | BAIXO (aceito, registrar) | `POST /auth/login` sem proteção contra "login CSRF" (fixação de sessão via form POST cross-site) | Nota informativa acima | Nenhuma correção exigida para aprovação — aceitar explicitamente como fora de escopo (mesma categoria de LOG-004/006), já registrado na seção "Consequências" ou como nota de rastreabilidade |

### Cobertura

- **OK:** Regra de Dependência, uso correto do repositório de escrita para `Login` (consistente com ADR 0003), ausência de migrations, idempotência de `Logout`, ordem do plano de implementação, plano de teste (exceto o gap 3)
- **GAP:** especificação de mensagem de dois erros de domínio novos (1 ALTO, 1 MÉDIO), edge case de `GetCurrentUser` sem decisão (1 MÉDIO), login CSRF fora de escopo (1 BAIXO, aceitável)
- **N/A:** DDD (nenhuma entidade/VO nova), precisão monetária, schema/migrations

### Próximo passo

Rode `/adr-architect` para amendar o ADR endereçando o gap ALTO (1) e o gap MÉDIO (2) — ambos são especificações de mensagem de erro, correção pontual e rápida. O gap MÉDIO (3) também deve ser resolvido antes de `/adr-executor` (decisão de erro tipado faltando). O gap BAIXO (4) pode ser aceito explicitamente pelo usuário sem retornar ao architect. Depois, re-valide.

---

## Emenda (pós-Estágio 2) — 2026-08-01

Amenda aplicada pelo `/adr-architect` endereçando os gaps do Estágio 2:

| Gap | Status | O que mudou |
|---|---|---|
| 1 (ALTO — `InvalidCredentialsError` podia vazar e-mail via mensagem) | Corrigido | Construtor sem parâmetros, mensagem estática `'Invalid email or password'`, idêntica para "e-mail não encontrado" e "senha errada" (seção "Decisão" → "Backend — Erros de domínio novos") |
| 2 (MÉDIO — `AccountSuspendedError` podia vazar `userId`) | Corrigido | Construtor recebe `userId` só para log estruturado; mensagem exposta ao cliente é estática, sem o UUID |
| 3 (MÉDIO — `GetCurrentUser` sem decisão para usuário não encontrado) | Corrigido | Novo erro `UserNotFoundError` (`code = 'USER_NOT_FOUND'`), mapeado a `401` no `DomainErrorFilter` (mesmo tratamento de sessão inválida — cookies limpos), com Rationale explicando por que `401` e não `404`. Adicionado à tabela de Edge Cases, ao Plano de Implementação (domínio) e ao Plano de Teste |
| 4 (BAIXO — login CSRF) | Aceito, sem correção | Registrado explicitamente em "Decisões do Usuário" como risco aceito, mesma categoria de LOG-004/006 |

**Próximo passo:** rode `/adr-validator` novamente sobre este ADR (`0005-login-logout.md`) para confirmar que os gaps foram endereçados antes de `/adr-executor`.

---

## Validação (Estágio 2, 2ª rodada) — 2026-08-01

**Veredito:** ✅ **APROVA (com 4 gaps MÉDIO de propagação textual)**

Os 3 gaps bloqueantes da 1ª rodada (ALTO/MÉDIO) foram confirmados corrigidos: `InvalidCredentialsError` com mensagem estática, `AccountSuspendedError` sem UUID exposto, `UserNotFoundError` novo cobrindo o edge case de `GetCurrentUser`. O gap 4 (BAIXO — login CSRF) segue aceito e registrado.

**Gap novo (não bloqueante):** a emenda adicionou `UserNotFoundError` à seção "Decisão", ao Rationale, à tabela de Edge Cases e ao Plano de Teste, mas não propagou para "Impacto nos Bounded Contexts" (linha 123/126), "Checklist de Arquitetura" (linha 140) e o item 3 do "Plano de Implementação" (linha 160) — o mais acionável dos quatro, por ser o checklist literal que o executor segue. Mesmo padrão de inconsistência textual que o ADR 0004 teve na sua própria 2ª rodada.

## Correção aplicada — 2026-08-01

Os 4 pontos de propagação foram corrigidos nesta mesma passada: "Impacto nos Bounded Contexts" agora lista os 3 erros novos e "3 novas entradas" no filtro; "Checklist de Arquitetura" lista os 3 erros; item 3 do Plano de Implementação inclui `USER_NOT_FOUND → 401`.

Nenhum gap pendente. **ADR pronto para `/adr-executor`.**

---

## Emenda (pós-implementação) — 2026-08-03

O `/security-guard` (Etapa 7 da pipeline) encontrou 2 itens ALTO/MÉDIO além do já aceito (item 4 acima) e do já registrado (relaxamento de LOG-001/002): LOG-006 (sem bloqueio por tentativas) e `ValidationPipe` global ausente. Ambos foram implementados nesta emenda.

### LOG-006 — bloqueio por excesso de tentativas

**Decisões do grelhamento (2026-08-03):**
- Redis como front-line de rate-limit foi cogitado e **rejeitado por ora** — introduzir Redis é uma peça de infraestrutura nova (mesmo porte da réplica de leitura do ADR 0003) e merece seu próprio ADR quando o volume justificar. Fica registrado como débito/otimização futura, não implementado aqui.
- Armazenamento: tabela `login_attempts` (append-only), não colunas mutáveis em `users` — também fortalece LOG-005 (histórico de tentativas consultável via SQL, hoje só coberto por log estruturado).
- Limiar: 5 tentativas falhas / bloqueio de 15 min.
- Reset do contador: só em login bem-sucedido — o bloqueio é **derivado por query** (falhas desde o último sucesso, sem coluna `locked_until`), então tentativas bloqueadas nunca são gravadas e não estendem o bloqueio; só uma nova tentativa real (após o bloqueio expirar) pode empurrar o limite de novo.
- Chave do bloqueio: email normalizado, não `userId` — emails inexistentes acumulam o mesmo estado de bloqueio que contas reais, para não abrir um canal lateral que revele existência de conta (LOG-003). `TooManyLoginAttemptsError` (429) tem mensagem estática e genérica pela mesma razão.
- Conta suspensa não passa pelo contador de LOG-006 (já está bloqueada por outro motivo).

**Novos artefatos:** `domain/entities/login-attempt.entity.ts`, `domain/repositories/login-attempt.repository.ts`, `domain/services/login-lockout-policy.ts`, `domain/errors/too-many-login-attempts.error.ts`, `infrastructure/persistence/login-attempt.sql.ts` + `pg-login-attempt.repository.ts`, migration `1785780460632_create_login_attempts_table.sql` (`user_id` com `ON DELETE SET NULL` — exclusão de usuário preserva o histórico de auditoria). `Login` passa a receber `LoginAttemptRepository` no construtor e `ipAddress` no input.

### `ValidationPipe` global (item 3 do security-guard)

Adicionado `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))` em `main.ts`. Efeito colateral encontrado e corrigido: `ConfirmDepositInputDTO` (módulo `financial`) não tinha nenhum decorator `class-validator` — com `whitelist`/`forbidNonWhitelisted` ativados globalmente, os campos seriam descartados/rejeitados silenciosamente em produção (nenhum teste de integração via HTTP cobria esse endpoint, então o `pnpm test` não pegaria isso). Adicionados `@IsUUID()` em `transactionId` e `@IsInt() @Min(0)` em `confirmations`. Auditoria confirmou que nenhum outro DTO de entrada do projeto está sem validador.

**Testes:** `login.usecase.spec.ts` ganhou a suíte `LOG-006 — bloqueio por excesso de tentativas` (registro de tentativa com/sem `userId`, bloqueio ativo, bloqueio expirado, não-bloqueio para email inexistente não distinguível de conta real). 175 testes verdes (API), build real (`tsconfig.build.json`) limpo.
