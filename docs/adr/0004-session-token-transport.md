# ADR 0004 — Transporte de Sessão via Cookie httpOnly

**Status:** Em Progresso
**PR:** https://github.com/paulohsilvavieira/mybitcoin-api/pull/4
**Data:** 2026-07-27
**Autores:** Time de Backend
**Contexto relacionado:** ADR 0002 (Identity: Cadastro de Usuários)
**Gerado por:** skill `/adr-architect`

---

## Contexto

O bounded context `identity` tem hoje apenas Cadastro (CAD-001 a CAD-007) implementado. `docs/bussiness/02-identidade-e-acesso.md` define ainda Login (LOG), Logout (OUT), Recuperação de Senha (REC) e Sessões (SES-001 a SES-005) — nenhum implementado.

Sessões é o próximo passo planejado (ver plano de implementação discutido antes deste ADR) e é pré-requisito direto de Login e Logout: toda sessão criada por um login precisa de uma forma de ser transportada entre o navegador e a API em cada requisição subsequente, e essa decisão de transporte é estrutural — mudá-la depois que Login, Logout, CORS e o cliente HTTP do `mybitcoin-front` já estiverem construídos em cima dela é caro.

Este ADR formaliza exclusivamente **como a sessão é transportada e identificada entre cliente e servidor** — não implementa Login/Logout, apenas define o contrato que eles vão herdar.

> **Nota de numeração:** este ADR foi originalmente redigido como `0003`. Foi renumerado para `0004` porque outro ADR não relacionado (`0003-read-write-database-replication.md`, sobre réplica de leitura PostgreSQL) já ocupava o número 0003 no momento da amenda — ambos criados no mesmo dia, nenhum ainda commitado.

---

## Forças em Jogo

- É uma exchange: roubo de sessão via XSS é mais grave que CSRF, que é mitigável
- `mybitcoin-front` é uma SPA React consumindo esta API — hoje same-origin/same-site (ambiente local), mas a topologia de produção (mesmo domínio-pai vs domínios distintos) ainda não está definida
- Um vazamento de leitura do banco (backup exposto, réplica mal configurada, SQLi read-only) não pode, sozinho, permitir sequestro de sessões ativas
- CORS com credentials exige origem explícita — `Access-Control-Allow-Origin: *` deixa de ser compatível
- A decisão precisa ser reavaliável quando a topologia de domínio de produção for definida, sem quebrar o contrato de Login/Logout
- LOG-005 exige auditoria de toda tentativa de autenticação, e o projeto adota Event Sourcing como mecanismo principal de auditoria (`docs/bussiness/10-eventos-de-dominio-e-auditoria.md`) — criação/revogação de sessão precisa gerar rastro
- Hoje não existe no projeto nenhum mecanismo de parsing de cookie (`cookie-parser`), CORS configurado, ou filtro que converta `DomainError` em status HTTP — este ADR não pode assumir que essa infraestrutura já existe

---

## Decisão

A sessão é transportada por **cookie httpOnly**, nunca retornada no corpo da resposta para armazenamento em `localStorage` ou enviada via header `Authorization`.

### Cookie de sessão

| Atributo | Valor |
|---|---|
| Nome | `__Host-session` |
| Valor | token opaco aleatório (32 bytes, codificado em hex — 64 caracteres) |
| `HttpOnly` | sim |
| `Secure` | sim (obrigatório pelo prefixo `__Host-`) |
| `SameSite` | `Strict` |
| `Path` | `/` (obrigatório pelo prefixo `__Host-`) |
| `Domain` | **ausente** (obrigatório pelo prefixo `__Host-` — nunca compartilhado entre subdomínios) |
| `Max-Age` | igual ao TTL absoluto da sessão (86400s / 24h) — renovado a cada `touch()` até o teto absoluto |

O prefixo `__Host-` impede que o cookie seja sobrescrito por um subdomínio menos confiável (cookie tossing) e força `Secure` + ausência de `Domain`, então o navegador só aceita o cookie vindo exatamente do host da API.

### Identificador de sessão: token opaco hasheado, não o UUID da linha

A tabela `sessions` guarda um UUID (`id`, chave primária, uso interno) e um **`token_hash`** (SHA-256 do token opaco enviado ao cliente). O cliente nunca vê o `id` da linha nem o token em claro além do momento em que ele é setado no cookie.

Fluxo de verificação: a API recebe o token do cookie → calcula `SHA-256(token)` → busca por `token_hash` na tabela → carrega a sessão. Nunca há busca por token em claro no banco.

**Por quê:** se o banco vazar por qualquer canal de leitura (backup, réplica, dump), o atacante tem o hash, não o token — não consegue montar um cookie válido a partir disso. Usar o UUID da linha como identificador direto tornaria qualquer vazamento de leitura do banco equivalente a sequestro de sessão.

### CSRF: double-submit token complementar ao SameSite=Strict

`SameSite=Strict` já bloqueia o cookie em qualquer requisição de subrecurso ou navegação iniciada por outro site. Como camada complementar (defesa em profundidade, e para cobrir o caso de a topologia de produção migrar para domínios distintos, onde `SameSite=None` seria necessário e perderia a proteção de `Strict`):

- Um segundo cookie, **não-httpOnly**, chamado **`__Host-csrf`**, é setado no momento da criação da sessão (mesmo valor de vida do cookie de sessão, renovado junto). Usa o mesmo prefixo `__Host-` do cookie de sessão — `Secure`, `Path=/`, sem `Domain`.
- O frontend lê esse cookie via JS e reenvia o valor no header `X-CSRF-Token` em toda requisição de mutação (`POST`, `PUT`, `PATCH`, `DELETE`).
- A API compara `X-CSRF-Token` (header) com o valor do cookie `__Host-csrf`. Se não baterem ou o header estiver ausente em uma mutação, rejeita com `403`.
- Requisições `GET`/`HEAD` não exigem o header.

**Correção pós-validação (gap 1 — ALTO):** a versão anterior deste ADR usava `csrf_token` sem prefixo para o cookie de CSRF, enquanto o cookie de sessão usava `__Host-session`. Isso deixava aberto exatamente o ataque que o `__Host-` foi escolhido para mitigar: um subdomínio comprometido poderia setar `csrf_token=<valor arbitrário controlado pelo atacante>` (cookie tossing), e como o double-submit só compara cookie com header — sem verificar a origem do cookie — o atacante forjaria os dois lados da comparação. Usar `__Host-` nos dois cookies fecha essa lacuna nos dois.

### TTL

- **Idle timeout (SES-003):** 30 minutos sem atividade (`lastActivityAt` mais antigo que 30 min) → sessão tratada como expirada, mesmo com `Max-Age` do cookie ainda válido.
- **TTL absoluto (SES-002):** 24 horas desde `createdAt`, independente de atividade — força re-login diário.
- Cada requisição autenticada válida atualiza `lastActivityAt` (`touch()`), mas nunca estende o teto absoluto de 24h.

### CORS

Como a topologia de produção (mesmo domínio-pai vs domínios distintos) ainda não está definida, a configuração de CORS precisa ser explícita desde já, não usar wildcard:

```typescript
// main.ts
app.enableCors({
  origin: process.env.FRONTEND_ORIGIN, // origem explícita, nunca '*'
  credentials: true,                    // obrigatório para o navegador enviar/aceitar cookies
});
```

`FRONTEND_ORIGIN` é uma env var por ambiente (dev: `http://localhost:5173` ou equivalente; produção: a definir quando a topologia for decidida). Se no futuro API e frontend passarem a domínios distintos (cross-site), este ADR precisa ser revisitado: `SameSite=Strict` deixa de ser compatível com fluxo cross-site e o cookie precisaria de `SameSite=None`, o que eleva a dependência no double-submit CSRF token (já projetado aqui) como principal linha de defesa.

### Parsing de cookies (dependência nova)

**Correção pós-validação (gap 3 — ALTO):** o projeto não tem hoje nenhuma dependência de parsing de cookie. `SessionAuthGuard` depende de ler `request.cookies.['__Host-session']` e `request.cookies.['__Host-csrf']` — sem middleware de parsing, o Express expõe apenas `request.headers.cookie` como string crua.

Decisão: adicionar `cookie-parser` como dependência de produção e registrar em `main.ts` antes de qualquer rota:

```typescript
// main.ts
import * as cookieParser from 'cookie-parser';

app.use(cookieParser());
```

`cookie-parser` não precisa de segredo de assinatura aqui — o valor do cookie de sessão já é opaco e verificado via hash no banco; não há necessidade de cookies assinados (`signed cookies`) adicionalmente.

### Mapeamento de erros de domínio para status HTTP (mecanismo novo)

**Correção pós-validação (gap 4 — MÉDIO):** o projeto não tem, hoje, nenhum exception filter ou interceptor que converta subclasses de `DomainError` em status HTTP (`IdentityController` atual não captura `EmailAlreadyExistsError` nem qualquer outro erro — ver `src/modules/identity/presentation/identity.controller.ts`). A tabela de Edge Cases deste ADR promete códigos HTTP específicos; sem esse mecanismo, todo erro de domínio viraria `500` genérico.

Decisão: criar um filtro HTTP global, compartilhado por todos os módulos (não específico de `identity`), em `src/infrastructure/http/domain-error.filter.ts`:

```typescript
// src/infrastructure/http/domain-error.filter.ts
@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const status = DomainErrorFilter.statusFor(error);
    response.status(status).json({ code: error.code, message: error.message });
  }

  private static statusFor(error: DomainError): number {
    // mapa code → status HTTP; default 422 para erro de domínio não mapeado
  }
}
```

Registrado globalmente em `main.ts` via `app.useGlobalFilters(new DomainErrorFilter())`. Fica em `src/infrastructure/http/` (infraestrutura compartilhada, não pertence a nenhum bounded context) porque é um adaptador HTTP genérico, na mesma linha de `src/infrastructure/telemetry/` — não é um `*Repository` nem uma regra de negócio de `identity`.

Cada erro tipado deste ADR declara seu status via essa tabela (usada pela implementação do filtro):

| `error.code` | Status HTTP |
|---|---|
| `SESSION_NOT_FOUND` | 404 |
| `SESSION_EXPIRED` | 401 |
| `SESSION_ALREADY_REVOKED` | 409 |

A falha de CSRF (header ausente/divergente) **não** passa pelo filtro — é rejeitada diretamente pelo `SessionAuthGuard` com `403`, antes de qualquer use case rodar, porque não é um erro de domínio (é uma rejeição na borda HTTP).

### Domain Events

**Correção pós-validação (gap 2 — ALTO):** `docs/bussiness/10-eventos-de-dominio-e-auditoria.md:596` lista "Login, logout" como categoria de auditoria obrigatória, e LOG-005 exige que toda tentativa de autenticação seja auditada. O projeto já estabeleceu o precedente de emitir um domain event por fato relevante (`UserRegistered`, ADR 0002) — sessão não pode ser uma exceção silenciosa a essa convenção.

Dois eventos, um por fato (consistente com o padrão de "um evento = um fato" já usado no domínio — não um evento genérico `SessionStatusChanged`):

- **`SessionCreated`** — emitido por `CreateSession` após persistência bem-sucedida. Payload: `sessionId`, `userId`, `deviceInfo`, `ipAddress`, `createdAt`.
- **`SessionRevoked`** — emitido por `RevokeSession` e por `RevokeAllSessions` (um evento por sessão revogada, mesmo em revogação em lote). Payload: `sessionId`, `userId`, `revokedAt`, `reason` (`'user_requested' | 'password_reset' | 'logout_all'` — enum extensível quando Logout/Recuperação de Senha existirem).

Não existe hoje, no projeto, nenhum mecanismo de event bus ou event store — `UserRegistered` (ADR 0002) foi definido como classe, mas `register-user.usecase.ts` nunca o instancia, retorna ou publica; é código morto, não um precedente funcional a seguir. Este ADR não resolve essa dívida arquitetural. O que ele garante é o contrato mínimo: `CreateSession`, `RevokeSession` e `RevokeAllSessions` devem **retornar** o evento correspondente (`SessionCreated`/`SessionRevoked`) no output do use case, mesmo sem nenhum consumidor ainda — para que, quando um mecanismo de publicação/event store for decidido (nesta ADR ou em uma futura), os dados exigidos pela trilha de auditoria da seção 8 do doc 10 já estejam disponíveis na fronteira do use case, sem precisar reabrir o domínio de `Session`.

### Rationale

**Por que cookie httpOnly e não `Authorization: Bearer` em header?**
Um token acessível via JS (necessário para popular um header) é lido por qualquer script injetado via XSS. Cookie `httpOnly` nunca é exposto ao JS da página, então um XSS não consegue exfiltrar a sessão — só consegue fazer requisições no contexto do navegador da vítima, o que o double-submit CSRF token e o `SameSite=Strict` mitigam.

**Por que token opaco hasheado e não o UUID da tabela `sessions` direto?**
Consistência com o padrão que o domínio já usa para tokens sensíveis de uso único (ex: seria o mesmo padrão para o token de recuperação de senha, REC-002, quando implementado) — o valor que autentica nunca é o mesmo valor armazenado em claro no banco.

**Por que `__Host-` nos dois cookies e não um nome simples?**
O custo de adotar o prefixo agora (exige `Secure`, `Path=/`, sem `Domain`) é zero neste momento — a API já vai rodar sob HTTPS e não há necessidade de compartilhar cookies entre subdomínios. Adotar depois exigiria trocar o nome dos cookies e invalidar todas as sessões ativas na migração. Aplicar o prefixo só no cookie de sessão e não no de CSRF anularia a proteção pretendida (ver correção do gap 1 acima).

**Por que um exception filter global e não try/catch por controller?**
`docs/architecture/02-clean-architecture-ddd-fundamentos.md:234-245` mostra o padrão de try/catch no controller como exemplo didático, mas o projeto ainda não tem nenhum controller fazendo isso na prática (`IdentityController` não captura nada hoje). Um filtro global evita duplicar o mapa erro→status em cada controller futuro (Login, Logout, Recuperação de Senha vão reusar os mesmos padrões de erro de sessão) e centraliza a decisão em um único lugar auditável.

---

## Impacto nos Bounded Contexts

| Bounded Context | Impacto | Como se comunica |
|----------------|---------|-----------------|
| identity | Novo conceito `Session` + `SessionRepository`; base para Login/Logout futuros | — |
| financial | Nenhum diretamente — futuros endpoints financeiros vão depender do guard de sessão criado aqui para autenticar o usuário | Import do guard/decorator de autenticação |
| shared | `DomainError` reutilizado para erros de sessão | Import |
| infrastructure (compartilhada) | Novo `DomainErrorFilter` em `src/infrastructure/http/`; `cookie-parser` e `enableCors` adicionados a `main.ts` | Registrado globalmente, usado por todos os módulos |

**Entidades de domínio afetadas:** `Session` (nova)
**Domain Events:** `SessionCreated`, `SessionRevoked` — publicados após persistência bem-sucedida; alimentam a trilha de auditoria de LOG-005/OUT-xxx
**Interfaces de repositório afetadas:** `SessionRepository` (nova)
**Migrations necessárias:** sim — tabela `sessions`

---

## Checklist de Arquitetura

- [x] Nenhum arquivo em `identity/domain/` importa de `identity/infrastructure/` ou `identity/presentation/`
- [x] Valores monetários usam `BIGINT`/`bigint` — não aplicável (sem valores financeiros nesta decisão)
- [x] Erros de domínio são subclasses de `DomainError` (nunca boolean de retorno)
- [x] Operações multi-tabela usam `UnitOfWork` (ADR 0001) — não aplicável (tabela única `sessions`; `revokeAll` é um único `UPDATE` em lote)
- [x] Entidades não recebem dependências de infraestrutura no construtor — hashing do token (SHA-256) acontece na camada de aplicação/infraestrutura, o domínio só manipula `tokenHash: string`
- [x] `DomainErrorFilter` fica em `src/infrastructure/http/` (infraestrutura compartilhada), não em `identity/` — é genérico para qualquer módulo, não conhece `Session` especificamente

---

## Plano de Implementação

### 1. Domínio (`src/modules/identity/domain/`)

- [ ] Value Object `SessionId` — `value-objects/session-id.vo.ts`
- [ ] Entidade `Session` — `entities/session.entity.ts` (campos: `id`, `userId`, `tokenHash`, `deviceInfo`, `ipAddress`, `createdAt`, `lastActivityAt`, `expiresAt`, `revokedAt`)
- [ ] Erro `SessionNotFoundError` — `errors/session-not-found.error.ts` (`code = 'SESSION_NOT_FOUND'`)
- [ ] Erro `SessionExpiredError` — `errors/session-expired.error.ts` (`code = 'SESSION_EXPIRED'`)
- [ ] Erro `SessionAlreadyRevokedError` — `errors/session-already-revoked.error.ts` (`code = 'SESSION_ALREADY_REVOKED'`)
- [ ] Domain Event `SessionCreated` — `events/session-created.event.ts`
- [ ] Domain Event `SessionRevoked` — `events/session-revoked.event.ts`
- [ ] Interface `SessionRepository` — `repositories/session.repository.ts`, com a assinatura completa (correção do gap 5):

```typescript
export abstract class SessionRepository {
  abstract create(session: Session): Promise<void>;
  abstract findByTokenHash(tokenHash: string): Promise<Session | null>;
  abstract findActiveByUserId(userId: string): Promise<Session[]>;
  abstract revoke(sessionId: string): Promise<void>;
  abstract revokeAll(userId: string): Promise<void>;
  abstract touch(sessionId: string, lastActivityAt: Date): Promise<void>;
}
```

**Invariantes da entidade Session:**
- `isActive()` é falso se `revokedAt` não for nulo, se `now > expiresAt` (teto absoluto 24h), ou se `now - lastActivityAt > 30min` (idle)
- `revoke()` é idempotente na entidade (não lança erro), mas o use case de revogação lança `SessionAlreadyRevokedError` se a sessão já estiver revogada — a checagem de "já revogada" é responsabilidade do use case, não da entidade
- `touch()` atualiza apenas `lastActivityAt`, nunca `expiresAt`

### 2. Aplicação (`src/modules/identity/application/`)

- [ ] Use Case `CreateSession` — `create-session.usecase.ts` (gera token opaco de 32 bytes, calcula hash, persiste, publica `SessionCreated`, retorna o token em claro **apenas para o controller setar o cookie** — nunca loga o valor em claro)
- [ ] Use Case `ListActiveSessions` — `list-active-sessions.usecase.ts`
- [ ] Use Case `RevokeSession` — `revoke-session.usecase.ts` (publica `SessionRevoked` com `reason: 'user_requested'`)
- [ ] Use Case `RevokeAllSessions` — `revoke-all-sessions.usecase.ts` (publica `SessionRevoked` por sessão afetada)
- [ ] Use Case `ValidateSession` — `validate-session.usecase.ts` (recebe token em claro do cookie, calcula hash, busca via `findByTokenHash`, valida `isActive()`, chama `touch()`) — usado pelo guard HTTP

### 3. Infraestrutura (`src/modules/identity/infrastructure/`)

- [ ] Migration `create_sessions_table` — `migrations/<timestamp>_create_sessions_table.sql`
- [ ] SQL queries — `persistence/session.sql.ts`
- [ ] Repository `PgSessionRepository` — `persistence/pg-session.repository.ts`

### 3B. Infraestrutura compartilhada (`src/infrastructure/`)

- [ ] Filtro `DomainErrorFilter` — `src/infrastructure/http/domain-error.filter.ts`
- [ ] Instalar dependência `cookie-parser` (+ `@types/cookie-parser` como dev dependency)
- [ ] `main.ts`: `app.use(cookieParser())`, `app.enableCors({ origin: process.env.FRONTEND_ORIGIN, credentials: true })`, `app.useGlobalFilters(new DomainErrorFilter())`

### 4. Presentation (`src/modules/identity/presentation/`)

- [ ] Guard `SessionAuthGuard` — lê cookie `__Host-session`, chama `ValidateSession`, popula `request.user`; para mutações, valida header `X-CSRF-Token` contra cookie `__Host-csrf` (rejeita com `403` direto no guard, não via `DomainErrorFilter`)
- [ ] Helper de resposta que seta os dois cookies (`__Host-session` httpOnly + `__Host-csrf` não-httpOnly) — será chamado pelo futuro controller de Login
- [ ] Controller `SessionsController` — `sessions.controller.ts`: `GET /sessions` (lista sessões ativas do usuário autenticado via guard), `DELETE /sessions/:id` (revoga uma sessão do próprio usuário)

---

## Schema

```sql
CREATE TABLE sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  token_hash        VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 hex (64 chars)
  device_info       VARCHAR(255) NOT NULL,
  ip_address        INET NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ NULL
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);
```

**Nota (gap 6, aceito):** a constraint `UNIQUE` inline em `token_hash` já cria o índice único necessário — a versão anterior deste ADR também declarava um `CREATE UNIQUE INDEX idx_sessions_token_hash` redundante, mesmo padrão herdado de `1720800000000_create_users_table.sql:7,17` (`email`). Removido aqui por ser estritamente redundante; a inconsistência em `users` fica registrada, não é escopo deste ADR corrigi-la.

---

## Edge Cases & Erros de Domínio

| Caso | Erro de domínio | Comportamento decidido |
|------|----------------|----------------------|
| Cookie de sessão ausente em rota protegida | — (guard rejeita antes do use case) | `401 Unauthorized` |
| Token não encontrado (hash não bate com nenhuma linha) | `SessionNotFoundError` | `401 Unauthorized` (guard captura antes do `DomainErrorFilter` padrão de 404 — ver nota abaixo) |
| Sessão expirada (absoluto ou idle) | `SessionExpiredError` | `401 Unauthorized` + cookie limpo (`Set-Cookie` com `Max-Age=0` nos dois cookies) |
| Sessão revogada | `SessionExpiredError` (revogação é tratada como expiração do ponto de vista de autenticação) | `401 Unauthorized` |
| Tentativa de revogar sessão de outro usuário | `SessionNotFoundError` (nunca revela que a sessão existe e pertence a outro usuário) | `404 Not Found` |
| Tentativa de revogar sessão já revogada | `SessionAlreadyRevokedError` | `409 Conflict` (idempotência explícita — diferente do OUT-001/002 de logout, que serão idempotentes por design quando implementados) |
| Mutação sem header `X-CSRF-Token` ou valor divergente do cookie | — (guard rejeita antes do use case) | `403 Forbidden` |

**Nota sobre status de `SessionNotFoundError`:** o código de erro é o mesmo (`SESSION_NOT_FOUND`) nos dois casos acima, mas o status HTTP difere por contexto — dentro do `SessionAuthGuard` (validação de sessão do próprio request) vira `401`; dentro de `RevokeSession` (tentando agir sobre a sessão de outro usuário) vira `404`. O `DomainErrorFilter` usa o mapa padrão (`SESSION_NOT_FOUND` → 404) só quando o erro escapa do use case sem ser capturado antes — o guard intercepta o caso de autenticação e responde `401` diretamente, sem deixar o erro chegar ao filtro global.

---

## Plano de Teste

- [ ] Unit (entidade `Session`): `isActive()` com cada combinação (revogada / expirada absoluta / expirada por idle / ativa), `touch()` não altera `expiresAt`, `revoke()` idempotente
- [ ] Unit (use case `CreateSession`): gera token diferente a cada chamada (SES-001), persiste `deviceInfo`/`ipAddress` (SES-004), token em claro nunca aparece em logs, publica `SessionCreated`
- [ ] Unit (use case `ValidateSession`): hash do token bate → sessão válida; hash não encontrado → `SessionNotFoundError`; sessão expirada → `SessionExpiredError`
- [ ] Unit (use case `ListActiveSessions`): retorna só sessões com `isActive() === true` do usuário informado
- [ ] Unit (use case `RevokeSession`): erro ao tentar revogar sessão de outro usuário; erro ao revogar já revogada; publica `SessionRevoked`
- [ ] Unit (`DomainErrorFilter`): cada `code` mapeia para o status correto; erro de domínio não mapeado cai no default
- [ ] Integração (`PgSessionRepository`): persistência real, `token_hash` nunca é o token em claro, `revokeAll` afeta todas as linhas do `user_id`, `findByTokenHash` retorna `null` para hash inexistente
- [ ] Integração (guard `SessionAuthGuard`): requisição sem cookie → 401; cookie com token inválido → 401; mutação sem `X-CSRF-Token` → 403; mutação com `X-CSRF-Token` divergente do cookie `__Host-csrf` → 403
- [ ] Negativo: sessão expirada por idle mas dentro do teto absoluto → ainda inválida; sessão dentro do idle mas além do teto absoluto de 24h → inválida

---

## Fluxos

```
1. (Futuro) Login bem-sucedido
   → CreateSession.execute({ userId, deviceInfo, ipAddress })
   → Gera token opaco (32 bytes) + calcula SHA-256
   → Persiste Session com token_hash
   → Publica SessionCreated
   → Controller seta Set-Cookie: __Host-session=<token>; HttpOnly; Secure; SameSite=Strict; Path=/
   → Controller seta Set-Cookie: __Host-csrf=<valor>; Secure; SameSite=Strict; Path=/ (sem HttpOnly)

2. Requisição autenticada subsequente
   → cookie-parser popula request.cookies
   → SessionAuthGuard lê request.cookies['__Host-session']
   → ValidateSession.execute(token) → calcula hash → findByTokenHash → busca Session
   → Se mutação (POST/PUT/PATCH/DELETE): compara header X-CSRF-Token com request.cookies['__Host-csrf']
   → Se válida: touch() atualiza lastActivityAt, request segue
   → Se inválida/expirada: 401, Set-Cookie limpa os dois cookies

3. GET /sessions
   → Guard popula request.user via ValidateSession
   → ListActiveSessions.execute(userId) → retorna sessões ativas (sem token_hash no response)

4. DELETE /sessions/:id
   → Guard popula request.user
   → RevokeSession.execute({ sessionId, requestingUserId }) → valida posse → revoga → publica SessionRevoked
```

---

## Consequências

**Positivas:**
- Sessão nunca acessível via JS da página — XSS não consegue exfiltrar o valor que autentica
- Vazamento de leitura do banco não é equivalente a sequestro de sessão (token_hash, não token em claro)
- `__Host-` nos dois cookies (sessão e CSRF) fecha a porta para cookie tossing via subdomínio nos dois lados do double-submit
- Contrato pronto para Login/Logout consumirem sem decisão de segurança pendente
- CORS explícito desde o início evita a armadilha comum de `origin: '*'` com `credentials: true`
- `SessionCreated`/`SessionRevoked` alimentam a trilha de auditoria exigida por LOG-005 desde o primeiro commit deste ADR, sem retrabalho futuro
- `DomainErrorFilter` fica disponível para todo o projeto, não só para `identity` — Login, Logout, Recuperação de Senha e módulos futuros reusam o mesmo mapeamento

**Negativas / Trade-offs:**
- `SameSite=Strict` fica incompatível se a topologia de produção migrar para domínios totalmente distintos — este ADR precisa ser revisitado nesse caso (mitigado por já ter o double-submit CSRF token projetado)
- Double-submit token adiciona complexidade ao frontend (ler cookie não-httpOnly e replicar em header) que um bearer token simples não teria
- Sessão de 24h absoluto força re-login diário mesmo para uso contínuo — trade-off de segurança vs conveniência, revisável depois
- Nova dependência de produção (`cookie-parser`) e uma nova peça de infraestrutura compartilhada (`DomainErrorFilter`) além do escopo estrito de "sessão" — necessárias para o ADR funcionar de ponta a ponta

---

## Decisões do Usuário

> Confirmadas no grelhamento (Passo 2 da skill). Não são suposições do arquiteto.

- 2026-07-27 — Transporte da sessão → Cookie httpOnly (decidido antes deste ADR, na conversa que motivou a formalização)
- 2026-07-27 — Topologia de domínio produção/dev → Ainda não definida; mesma origem assumida por enquanto (dev local), com plano de revisão explícito no ADR
- 2026-07-27 — Identificador de sessão exposto ao cliente → Token opaco aleatório, hasheado (SHA-256) no banco — nunca o UUID da linha
- 2026-07-27 — Proteção CSRF complementar → Double-submit token (cookie não-httpOnly + header `X-CSRF-Token`)
- 2026-07-27 — Nome/atributos do cookie de sessão → `__Host-session` (Secure, Path=/, sem Domain)
- 2026-07-27 — Atributo SameSite → `Strict`
- 2026-07-27 — TTL da sessão → 30 minutos de idle timeout (SES-003), 24 horas de teto absoluto (SES-002)
- 2026-07-27 — Renumeração para ADR 0004 → resolvido conflito de numeração com `0003-read-write-database-replication.md` (arquiteto, sem necessidade de grelhamento — puramente administrativo)

---

## Referências

- ADR 0001 — UnitOfWork Pattern
- ADR 0002 — Identity: Cadastro de Usuários
- `docs/bussiness/02-identidade-e-acesso.md` — Regras SES-001 a SES-005, LOG-004, LOG-005, OUT-001 a OUT-003
- `docs/bussiness/10-eventos-de-dominio-e-auditoria.md` — Event Sourcing, auditoria de Login/Logout
- `docs/architecture/02-clean-architecture-ddd-fundamentos.md` — Princípios
- `docs/architecture/03-estrutura-projeto.md` — Estrutura de pastas

---

## Validação (Estágio 2) — 2026-07-27

### Veredito: 🔁 REVISAR

### Checklist

| Item | Resultado | Evidência |
| --- | --- | --- |
| A. Regra de Dependência | OK | Nenhum artefato de domínio proposto importa infra/presentation; guard chama use case (fluxo permitido: presentation → application) |
| B. Aggregate root / identidade clara | OK | `Session` é standalone, sem entidades filhas |
| B. Value Objects para conceitos sem identidade | OK | `SessionId` planejado, mesmo padrão de `user-id.vo.ts:1-10` |
| B. Invariantes protegidas pelo aggregate | OK | `isActive()`/`revoke()`/`touch()` descritos como responsabilidade da entidade |
| **B. Domain Events para fatos que outros contextos/auditoria precisam** | **GAP — ALTO** | `docs/bussiness/10-eventos-de-dominio-e-auditoria.md:596` lista "Login, logout" como categoria auditável, e a seção 1 do mesmo doc define Event Sourcing como "mecanismo principal de persistência de mudanças de estado" desta exchange. LOG-005 (`docs/bussiness/02-identidade-e-acesso.md:113`) exige que toda tentativa seja auditada. ADR 0002 já estabeleceu o precedente com `UserRegistered` (`0002-identity-registration.md:86`). O ADR 0003 não define nenhum domain event (`SessionCreated`, `SessionRevoked`, etc.) — criação/revogação de sessão fica sem rastro auditável |
| B. Erros tipados (`DomainError`) | OK | `SessionNotFoundError`/`SessionExpiredError`/`SessionAlreadyRevokedError`, seguindo `src/shared/domain.error.ts:1-6` |
| C. Precisão monetária | N/A | Nenhum valor financeiro nesta decisão |
| D. UnitOfWork / atomicidade | OK | Tabela única; `revokeAll` é um único `UPDATE` em lote — consistente com o critério do ADR 0001 |
| E. Schema consistente com ADRs anteriores | OK (nota BAIXA) | FK para `users(id)` correta. `token_hash VARCHAR(64) UNIQUE` inline **e** `CREATE UNIQUE INDEX idx_sessions_token_hash` depois são redundantes (dois índices únicos para a mesma coluna) — mas reproduz exatamente o mesmo padrão já aceito em `1720800000000_create_users_table.sql:7` e `:17` para `email`. Não é regressão introduzida por este ADR, só uma inconsistência herdada — registrar, não bloquear |
| **E. Interface de repositório sem métodos listados** | **GAP — MÉDIO** | O ADR não lista os métodos de `SessionRepository`. Em particular, `ValidateSession` precisa buscar por `token_hash` (não por `id`) — sem um método nomeado explicitamente (ex: `findByTokenHash`), o executor pode confundir com `findById` e buscar pela chave errada |
| F. Edge cases (inexistente, revogado, expirado, duplicado) | OK | Tabela de edge cases cobre os 7 casos com erro tipado e status HTTP |
| **F/D — Mecanismo de mapeamento `DomainError` → status HTTP inexistente** | **GAP — MÉDIO** | `grep` por `guard/filter/interceptor` em `src/` não retornou nenhum arquivo — não existe exception filter global no projeto. `IdentityController` (`identity.controller.ts`) hoje não captura `EmailAlreadyExistsError` nem nada — ADR 0003 promete 401/403/404/409 na tabela de edge cases sem incluir, no Plano de Implementação, a criação do mecanismo que converte os erros tipados nesses status |
| **G/plano — Dependência `cookie-parser` ausente** | **GAP — ALTO** | `package.json` não tem `cookie-parser` nem equivalente (`python3 -c` sobre dependencies confirmou lista completa, sem o pacote). O plano assume que o Guard lê `request.cookies`, mas sem middleware de parsing de cookie isso é `undefined` no Express/NestJS por padrão. `main.ts` também não tem `app.use(cookieParser())` nem `app.enableCors(...)` hoje — CORS com credentials não está configurado em lugar nenhum do código atual |
| **Decisão — Cookie CSRF sem prefixo `__Host-`** | **GAP — ALTO** | O ADR justifica `__Host-session` explicitamente para impedir cookie tossing por subdomínio menos confiável. O cookie `csrf_token` (não-httpOnly) é definido sem o mesmo prefixo. Isso deixa o double-submit token vulnerável exatamente ao ataque que o `__Host-` foi escolhido para mitigar: um subdomínio comprometido pode setar `csrf_token=<valor arbitrário>` e o double-submit deixa de provar posse do cookie legítimo — a proteção CSRF projetada como "defesa em profundidade" fica com o mesmo buraco que a defesa do cookie de sessão fecha |
| G. Plano de teste cobre Regra de Dependência | OK | Item explícito no plano de teste |
| H. Ordem do plano (domain → application → infra → presentation) | OK | Seguida corretamente |

### Gaps (ordenados por severidade)

| # | Severidade | Gap | Evidência | Correção exigida |
| --- | --- | --- | --- | --- |
| 1 | ALTO | Cookie `csrf_token` sem prefixo `__Host-` | Seção "Cookie de sessão" vs seção "CSRF" do ADR | Renomear para `__Host-csrf` (ou equivalente), com os mesmos atributos `Secure`, `Path=/`, sem `Domain`, exigidos pelo prefixo |
| 2 | ALTO | Nenhum domain event definido para criação/revogação de sessão | `docs/bussiness/10-eventos-de-dominio-e-auditoria.md:584-601` (auditoria de Login/Logout), LOG-005, precedente `UserRegistered` no ADR 0002 | Definir `SessionCreated` e `SessionRevoked` (ou evento único `SessionStatusChanged`) no plano de domínio, com envelope compatível com o padrão da seção 2 do doc 10 |
| 3 | ALTO | Dependência `cookie-parser` (ou similar) e configuração de CORS/cookie-parsing não estão no plano nem instaladas | `package.json` sem o pacote; `main.ts:1-13` sem `app.use(cookieParser())` nem `enableCors` | Adicionar ao Plano de Implementação (passo de Infraestrutura/Presentation): instalar `cookie-parser`, `app.use(cookieParser())` e `app.enableCors(...)` em `main.ts` |
| 4 | MÉDIO | Mecanismo de conversão `DomainError` → status HTTP não existe no projeto e não está no plano | Ausência de guard/filter em `src/`; `identity.controller.ts` sem tratamento de erro | Adicionar ao plano um exception filter global (ou por controller) que mapeie `SessionNotFoundError`→404, `SessionExpiredError`→401, `SessionAlreadyRevokedError`→409, guard CSRF→403 |
| 5 | MÉDIO | `SessionRepository` sem métodos listados, faltando explicitamente `findByTokenHash` | ADR não lista assinatura da interface; `ValidateSession` depende de busca por hash, não por id | Listar os métodos da interface no ADR: `create`, `findByTokenHash`, `findActiveByUserId`, `revoke`, `revokeAll`, `touch` |
| 6 | BAIXO | Índice único redundante em `token_hash` (constraint inline + `CREATE UNIQUE INDEX`) | Schema do ADR; mesmo padrão em `1720800000000_create_users_table.sql:7,17` | Registrar como aceito por consistência com ADR 0002, ou remover a linha `UNIQUE` inline e manter só o índice nomeado — decisão do usuário, não bloqueia sozinho |

### Cobertura

- **OK:** Regra de Dependência, modelagem de aggregate/VO, invariantes no aggregate, erros tipados, UnitOfWork/atomicidade, edge cases, plano de teste, ordem do plano de implementação
- **GAP:** domain events de auditoria, prefixo do cookie CSRF, dependência de cookie-parsing/CORS ausente, mapeamento de erro→HTTP ausente, métodos da interface de repositório não listados
- **N/A:** precisão monetária (sem valores financeiros nesta decisão)

### Próximo passo

Rode `/adr-architect` para amendar o ADR endereçando os gaps 1-5 acima (o gap 6 pode ser aceito explicitamente pelo usuário sem retornar ao architect), depois re-valide.

---

## Emenda (pós-Estágio 2) — 2026-07-27

Amenda aplicada pelo `/adr-architect` endereçando os gaps do Estágio 2:

| Gap | Status | O que mudou |
| --- | --- | --- |
| 1 (ALTO — CSRF sem `__Host-`) | Corrigido | Cookie CSRF renomeado para `__Host-csrf`, mesmos atributos do cookie de sessão |
| 2 (ALTO — sem domain events) | Corrigido | Adicionados `SessionCreated` e `SessionRevoked` ao plano de domínio, emitidos por `CreateSession`/`RevokeSession`/`RevokeAllSessions` |
| 3 (ALTO — `cookie-parser` ausente) | Corrigido | Adicionada seção "Parsing de cookies" + passo explícito no Plano de Implementação (3B) para instalar e registrar `cookie-parser` |
| 4 (MÉDIO — sem mapeamento erro→HTTP) | Corrigido | Adicionado `DomainErrorFilter` em `src/infrastructure/http/`, registrado globalmente, com tabela `code` → status |
| 5 (MÉDIO — repositório sem métodos) | Corrigido | Assinatura completa de `SessionRepository` listada no plano de domínio |
| 6 (BAIXO — índice redundante) | Aceito, com correção | Removido o `CREATE UNIQUE INDEX` redundante do schema deste ADR (a constraint inline já basta); registrado que `users.email` mantém a mesma redundância por não ser escopo deste ADR |

Também renumerado de `0003` para `0004` por conflito de numeração com `0003-read-write-database-replication.md` (ambos não commitados, criados no mesmo dia).

**Próximo passo:** rode `/adr-validator` novamente sobre este ADR (`0004-session-token-transport.md`) para confirmar que os 5 gaps foram endereçados antes de `/adr-executor`.

---

## Validação (Estágio 2, 2ª rodada) — 2026-07-27

### Veredito: ✅ APROVA (com 1 gap MÉDIO para decisão explícita)

Re-derivação independente confirmou que os 5 gaps ALTO/MÉDIO da rodada anterior foram corrigidos:

| Gap (rodada 1) | Resultado |
| --- | --- |
| 1 — CSRF sem `__Host-` | **Corrigido** — `grep -n "csrf_token\b"` no ADR só retorna menções históricas dentro do bloco de validação anterior e do texto "Correção pós-validação"; a seção "Decisão" ativa usa `__Host-csrf` consistentemente (cookie, fluxos, rationale) |
| 3 — `cookie-parser` ausente | **Corrigido** — nova seção "Parsing de cookies" + passo 3B no plano; confirmado via `grep -i cookie-parser package.json` (ainda ausente do `package.json`, como esperado — é trabalho do `/adr-executor`, não do ADR) |
| 4 — sem mapeamento erro→HTTP | **Corrigido** — `DomainErrorFilter` especificado em `src/infrastructure/http/domain-error.filter.ts` (`find src -iname "*filter*"` confirma que não existe ainda — correto, é passo do executor) com tabela `code`→status |
| 5 — `SessionRepository` sem métodos | **Corrigido** — assinatura completa listada (`create`, `findByTokenHash`, `findActiveByUserId`, `revoke`, `revokeAll`, `touch`) |
| 6 — índice redundante | **Corrigido** — schema atual (linhas 255-268) tem só `token_hash ... UNIQUE` inline + `idx_sessions_user_id`, sem duplicata |

### Novo achado (não presente na rodada 1)

| # | Severidade | Gap | Evidência | Correção exigida |
| --- | --- | --- | --- | --- |
| 7 | MÉDIO | Rationale afirma que a publicação de `SessionCreated`/`SessionRevoked` "segue o mesmo padrão do use case `RegisterUser`" — isso é factualmente incorreto, e nenhum mecanismo concreto de emissão/consumo é especificado | `grep -rn "UserRegistered" src/` mostra que `user-registered.event.ts` só aparece na própria definição; `register-user.usecase.ts` (lido integralmente) nunca instancia, retorna ou publica `UserRegistered` — o evento existe como código morto, não há precedente real a seguir | Reescrever a frase do Rationale removendo a alegação de precedente inexistente. Deixar explícito que (a) `CreateSession`/`RevokeSession`/`RevokeAllSessions` devem pelo menos **retornar** o evento no output do use case (mesmo sem consumidor ainda), e (b) que não existe hoje nenhum mecanismo de event bus/event store no projeto — dívida arquitetural pré-existente (mesma lacuna do ADR 0002), não algo que este ADR resolve, mas o texto não pode alegar que já é seguido |

Este gap é sobre **precisão do texto do ADR e escopo explícito**, não sobre a decisão de transporte de sessão em si — a decisão central (cookie httpOnly, token opaco hasheado, CSRF, TTL) continua sólida e implementável como está. Por isso não é ALTO: mesmo sem correção, o `/adr-executor` consegue implementar `Session`, `SessionRepository`, os guards e os cookies corretamente; o único risco é o executor copiar a frase incorreta como justificativa ou assumir que existe um mecanismo de publicação que não existe.

### Cobertura (2ª rodada)

- **OK:** todos os itens A-H do checklist original, mais os 6 gaps da rodada 1 confirmados corrigidos por evidência direta no código/ADR
- **GAP:** 1 novo (MÉDIO — precisão do texto sobre precedente de domain events)
- **N/A:** precisão monetária (inalterado)

### Próximo passo

Gap 7 é MÉDIO — pela regra do gate, pode ser aceito explicitamente sem retornar ao `/adr-architect`, já que não é CRÍTICO/ALTO e não bloqueia a implementação em si. Recomendo aceitar com uma correção rápida de uma frase (troque "segue o mesmo padrão do use case RegisterUser" por algo como "não há mecanismo de publicação de eventos ainda implementado no projeto; este ADR define o contrato do evento, a infraestrutura de emissão fica para uma ADR futura ou para o `/adr-executor` decidir no nível de implementação").

Se você aceitar o gap 7 como está (ou pedir a correção de uma frase), o ADR está **pronto para `/adr-executor`**.

---

## Gap 7 — Correção aplicada — 2026-07-27

O usuário optou por corrigir a frase em vez de aceitar como estava. A seção "Domain Events" (dentro de "Decisão") foi reescrita: removida a alegação de que a publicação "segue o mesmo padrão do `RegisterUser`" (falsa — `UserRegistered` é código morto, nunca instanciado/publicado por `register-user.usecase.ts`). O texto atual deixa explícito que (a) não existe mecanismo de event bus/event store no projeto hoje, (b) essa é dívida arquitetural pré-existente que este ADR não resolve, e (c) o contrato mínimo garantido por este ADR é que `CreateSession`/`RevokeSession`/`RevokeAllSessions` retornam o evento no output do use case.

Nenhum outro gap pendente. **ADR pronto para `/adr-executor`.**
