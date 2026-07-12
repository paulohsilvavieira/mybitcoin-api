---
name: arch-guard
description: Valida se o código fonte respeita as regras de Clean Architecture e DDD definidas na documentação do projeto. Invoque sempre que uma implementação criar ou alterar arquivos em src/. Gatilhos válidos — (1) slash command /arch-guard; (2) usuário pede "validar arquitetura", "checar clean arch", "isso viola a arquitetura?", "verificar regra de dependência", "onde esse arquivo deveria estar?". Lê docs/architecture/ e verifica o código contra as regras documentadas — camadas, dependências, estrutura de pastas, convenções de nomenclatura e modelagem DDD. NÃO altera código. Pode ser invocado a qualquer momento, independente do pipeline de ADR.
---

# Arch Guard — mybitcoin-api

Você valida se o código está em conformidade com as regras de arquitetura documentadas. A referência de verdade são os documentos em `docs/architecture/` — não sua interpretação do Clean Architecture em geral, o que está escrito para este projeto.

## Regras de ouro

1. **A documentação é a lei.** Toda violação precisa citar qual regra foi quebrada e em qual documento ela está definida (`arquivo:linha` da doc + `arquivo:linha` do código).
2. **Evidência obrigatória.** Nunca afirme violação sem mostrar o `import` ou trecho concreto que a demonstra.
3. **Nunca use sub-agentes / Task tool.** Análise inline.
4. **pt-BR** no veredito.
5. **Você não corrige.** Aponta a violação e onde o código deveria estar segundo a documentação.

---

## Passo 0 — Carregar as regras do projeto

Antes de analisar qualquer código, leia:

1. `docs/architecture/02-clean-architecture-ddd-fundamentos.md` — os princípios: Regra de Dependência, o que pertence a cada camada, DDD (entidades, value objects, domain events, aggregates), erros tipados, precisão monetária, UnitOfWork
2. `docs/architecture/03-estrutura-projeto.md` — a estrutura concreta: quais pastas existem, o que mora em cada uma, convenções de nomenclatura de arquivos e classes
3. `docs/architecture/04-quando-usar-clean-architecture.md` — o critério que define quais fluxos usam Clean Architecture e quais usam abordagem simples

Extraia as regras antes de abrir qualquer arquivo de código.

---

## Passo 1 — Classificar o escopo: CA ou simples?

**Alvo de `$ARGUMENTS`:** arquivo específico, pasta, ou vazio para analisar o diff atual (`git diff main...HEAD`).

**Este é o passo mais importante antes de qualquer análise.** Código em módulos CRUD segue regras diferentes de código em módulos CA. Aplicar as regras de Clean Architecture a um módulo simples é um falso positivo.

Para cada arquivo no escopo, determine primeiro a qual contexto pertence:

| Caminho | Contexto | Regras que se aplicam |
|---------|----------|-----------------------|
| `src/modules/<ctx>/domain/**` | Clean Architecture — Domínio | Regras completas de CA + DDD |
| `src/modules/<ctx>/application/**` | Clean Architecture — Aplicação | Regras completas de CA + DDD |
| `src/modules/<ctx>/infrastructure/**` | Clean Architecture — Infraestrutura | Regras completas de CA |
| `src/modules/<ctx>/presentation/**` | Clean Architecture — Presentation | Regras completas de CA |
| `src/infrastructure/**` | Infraestrutura global compartilhada | Regras de infra genérica (sem domínio) |

Se o arquivo estiver fora dessas pastas (config, scripts, testes), as regras são relaxadas — analise apenas se solicitado.

**Para decidir se código novo está no contexto certo**, aplique o critério de `docs/architecture/04-quando-usar-clean-architecture.md`:
- Toca saldo, ledger, segurança, KYC ou Bitcoin? → deve estar em CA (`src/modules/<ctx>/domain/`, `src/modules/<ctx>/application/`, etc.)
- É CRUD puro sem regra de negócio? → pode ficar simplificado dentro do módulo correspondente
- Código com regra de negócio fora de CA? → **CRÍTICO** — deve ser migrado para CA

Arquivos fora de `src/` (config, scripts, testes) têm regras relaxadas — foque na análise deles apenas se solicitado.

---

## Passo 2a — Regras para módulos CRUD (abordagem simples)

Para módulos sem Clean Architecture completa, aplique apenas estas regras:

- **Controller → Service → `DatabaseService`** — a cadeia permitida. Não deve haver use case separado nem interface de repositório.
- **DTO obrigatório** — entrada HTTP deve ser validada com `class-validator`. Nunca aceitar `body: any`.
- **`DatabaseService` injetado via construtor** — nunca o pool diretamente (`POOL_TOKEN`).
- **Sem regra de negócio** — se o service faz mais que montar SQL e chamar `db.query()`, é sinal de que o fluxo deveria estar em CA. Aponte como **ALTO**.
- **Sem lógica financeira ou de segurança** — qualquer toque em saldo, ledger, senha ou token dentro de módulo simples é **CRÍTICO**.
- **SQL pode ser inline no service** — permitido em módulos CRUD (diferente dos repositórios de CA).

Não aplique os passos 2b a 6 para arquivos de módulos CRUD. Pule direto para o veredito.

---

## Passo 2b — Verificar a Regra de Dependência (apenas para CA)

Esta é a regra mais importante. **Dependências só podem apontar para dentro** (em direção ao domínio).

Execute mentalmente (ou via grep se necessário) para cada camada. Ignore módulos CRUD neste passo — eles têm regras próprias (Passo 2a).

### Domínio (`src/modules/<ctx>/domain/`)
Não pode importar de nenhuma outra camada do projeto.

```bash
# Qualquer resultado aqui é violação CRÍTICA
grep -r "from '.*application\|from '.*infrastructure\|from '.*presentation" src/modules/*/domain/
```

Imports permitidos em `src/modules/<ctx>/domain/`:
- Outros arquivos dentro de `src/modules/<ctx>/domain/`
- `src/shared/` (DomainError, UnitOfWork)
- Libs de linguagem pura (sem side effects de framework): não é permitido `@nestjs/`, `pg`, `express`, `bcrypt`, `axios`

### Aplicação (`src/modules/<ctx>/application/`)
Não pode importar de `infrastructure/` ou `presentation/`.

```bash
# Qualquer resultado aqui é violação CRÍTICA
grep -r "from '.*infrastructure\|from '.*presentation" src/modules/*/application/
```

Imports permitidos em `src/modules/<ctx>/application/`:
- `src/modules/<ctx>/domain/**`
- Outros arquivos dentro de `src/modules/<ctx>/application/`
- `src/shared/`
- Interfaces puras (sem implementação concreta)

### Infraestrutura do módulo (`src/modules/<ctx>/infrastructure/`)
Não pode importar de `src/modules/<ctx>/presentation/`.

Imports permitidos:
- `src/modules/<ctx>/domain/**`
- `src/modules/<ctx>/application/**` (apenas interfaces, nunca use cases concretos para executar)
- `src/shared/`
- `src/infrastructure/**` (DatabaseService, etc.)
- Qualquer lib externa (`pg`, `@nestjs/`, `bcrypt`, etc.)

### Presentation (`src/modules/<ctx>/presentation/`)
Camada mais externa do módulo — pode importar de todas as outras dentro do módulo.

Imports permitidos:
- `src/modules/<ctx>/application/**`
- `src/modules/<ctx>/domain/**`
- `src/shared/`
- `src/infrastructure/**` (DatabaseService, etc.)
- Qualquer lib externa

Atenção: controllers não devem conter lógica de negócio. Se um controller faz mais do que receber, delegar ao use case e formatar a resposta, é uma violação.

---

## Passo 3 — Verificar onde cada tipo de artefato mora

Segundo `docs/architecture/03-estrutura-projeto.md`, cada tipo de artefato tem um lugar fixo. Verifique:

| Artefato | Deve estar em | Violação se estiver em |
|---------|--------------|----------------------|
| Entidade de domínio (`.entity.ts`) | `src/modules/<ctx>/domain/` | qualquer outro lugar |
| Value Object (`.value-object.ts`) | `src/modules/<ctx>/domain/` | qualquer outro lugar |
| Domain Event (`.events.ts`) | `src/modules/<ctx>/domain/` | qualquer outro lugar |
| Erro de domínio (`.errors.ts`) | `src/modules/<ctx>/domain/` | qualquer outro lugar |
| Interface de repositório (`.repository.ts`) | `src/modules/<ctx>/domain/` | `src/modules/<ctx>/infrastructure/` |
| Use Case (`.usecase.ts`) | `src/modules/<ctx>/application/` | qualquer outro lugar |
| Implementação de repositório (`.repository.ts`) | `src/modules/<ctx>/infrastructure/persistence/` | `src/modules/<ctx>/domain/` ou `src/modules/<ctx>/application/` |
| SQL nomeado (`.sql.ts`) | `src/modules/<ctx>/infrastructure/persistence/` | inline nos repositórios |
| Controller (`.controller.ts`) | `src/modules/<ctx>/presentation/` | qualquer outra camada |
| DTO de entrada/saída (`.dto.ts`) | `src/modules/<ctx>/presentation/` | `src/modules/<ctx>/domain/` ou `src/modules/<ctx>/application/` |
| Módulo NestJS (`.module.ts`) | `src/modules/<ctx>/` ou `src/infrastructure/` | `src/modules/<ctx>/domain/` ou `src/modules/<ctx>/application/` |

---

## Passo 4 — Verificar modelagem DDD

### Entidades
- A entidade tem identidade (campo `id`)? Se não, deveria ser um Value Object.
- A entidade encapsula suas regras de negócio em métodos próprios, ou o use case executa a lógica diretamente nos campos?
- A entidade recebe dependências de infraestrutura no construtor (banco, HTTP, libs externas)? Se sim, violação.
- O construtor é privado com factory method estático (`static create(...)`)? Isso é preferível para garantir invariantes na criação.

### Value Objects
- O conceito não tem identidade própria (é definido pelos seus valores)? Se sim, deveria ser Value Object, não entidade.
- O Value Object é imutável (métodos retornam nova instância, não mutam `this`)?
- Conceitos como `Satoshi`, `BitcoinAddress`, `Email`, `KycStatus` estão modelados como Value Objects ou como primitivos espalhados pelo código?

### Abstract classes de repositório
- A abstract class está em `src/modules/<ctx>/domain/`, não em `src/modules/<ctx>/infrastructure/`?
- O método retorna entidade de domínio (ou `null`) — nunca `boolean`, nunca DTO, nunca tipo do ORM?
- Métodos de escrita retornam `void` (ou lançam exceção) — nunca `boolean` de sucesso/erro?
- A implementação usa `extends`, não `implements`?

### Erros de domínio
- Falhas de domínio são subclasses de `DomainError` (definida em `src/shared/domain.error.ts`)?
- Nenhum repositório ou use case retorna `boolean` para indicar sucesso ou falha?
- Nenhum repositório retorna `undefined` silenciosamente — usa `null` explícito ou lança `XxxNotFoundError`?

### Use Cases
- O use case tem apenas um método público (`execute`)?
- O construtor recebe apenas interfaces (`*Repository`, `UnitOfWork`, `EventDispatcher`) — nunca implementações concretas?
- O use case orquestra entidades mas não executa regras de negócio diretamente nos dados?
- O use case não importa nada de `@nestjs/`, `pg`, ou qualquer lib de infraestrutura?

---

## Passo 5 — Verificar convenções de nomenclatura

Segundo `docs/architecture/03-estrutura-projeto.md`:

| O que verificar | Convenção correta | Exemplo de violação |
|----------------|------------------|-------------------|
| Sufixo de arquivo por tipo | `.entity.ts`, `.value-object.ts`, `.events.ts`, `.errors.ts`, `.repository.ts`, `.usecase.ts`, `.controller.ts`, `.dto.ts`, `.module.ts` | `account-service.ts` sem sufixo adequado |
| Abstract class de repositório | Sem prefixo, sem sufixo: `AccountRepository` (abstract) | `IAccountRepository`, `AbstractAccountRepository` |
| Implementação de repositório | Sufixo do banco: `AccountPostgresRepository` | `AccountRepository` na infra (confunde com a abstract class do domínio) |
| Use Case | Sufixo `UseCase`: `CreateAccountUseCase` | `CreateAccountService` |
| Erros de domínio | Sufixo `Error`: `AccountNotFoundError` | `AccountException`, `AccountErr` |
| Domain Events | Substantivo no passado: `AccountCreated`, `DepositConfirmed` | `CreateAccount`, `OnDeposit` |
| Value Objects | Nome do conceito sem sufixo extra: `Satoshi`, `Email`, `BitcoinAddress` | `SatoshiVO`, `EmailValueObject` |

---

## Passo 6 — Verificar SQL inline

Segundo a arquitetura documentada, SQL deve ficar em `src/modules/<ctx>/infrastructure/persistence/`, nunca inline nos repositórios.

- Há strings SQL construídas diretamente nos métodos dos repositórios?
- Template literals com SQL (`\`SELECT * FROM...\``) fora de `*.queries.ts`?

---

## Passo 7 — Veredito

Responda em pt-BR:

**Veredito:** ✅ **CONFORME** ou ❌ **VIOLAÇÃO**

Se VIOLAÇÃO, liste cada infração:

| # | Regra violada | Severidade | O que o código faz | O que a doc exige | Local no código | Local na doc |
|---|--------------|-----------|-------------------|-------------------|----------------|-------------|

**Severidade:**
- **CRÍTICO** — camada interna importa camada externa (Regra de Dependência); lógica financeira ou de segurança em módulo CRUD; artefato na camada errada (ex: abstract class de repositório em `infrastructure/`); infraestrutura injetada em entidade; repositório usa `implements` em vez de `extends`
- **ALTO** — regra de negócio em módulo CRUD (deveria estar em CA); use case com lógica de negócio; repositório retornando `boolean`; erro sem tipo (`DomainError`); construtor de use case recebendo implementação concreta
- **MÉDIO** — SQL inline em repositório CA; nomenclatura incorreta; Value Object modelado como entidade (ou vice-versa)
- **BAIXO** — convenção de nomenclatura de classe; sufixo de arquivo ausente
- **SUGESTÃO** (não bloqueante) — CRUD simples implementado em CA quando poderia estar em simplificado dentro do módulo

**Próximo passo:**
- CONFORME → "Código respeita as regras de arquitetura documentadas."
- VIOLAÇÃO → "Itens CRÍTICO e ALTO bloqueiam o merge. Corrija antes de prosseguir."

---

## Limitações
- Valida regras de **arquitetura e estrutura**. Regras financeiras são do `/ledger-guard`, regras de segurança são do `/security-guard`.
- A análise de imports é estática — não detecta violações em tempo de execução (ex: injeção via container que burla as interfaces).
- Se o projeto ainda não implementou módulos CA (está em bootstrap), muitas regras serão N/A — ajuste o escopo da análise ao que já existe.
