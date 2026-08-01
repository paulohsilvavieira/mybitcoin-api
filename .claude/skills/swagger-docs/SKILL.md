---
name: swagger-docs
description: Documenta ou atualiza a documentação Swagger/OpenAPI (`@nestjs/swagger`) de um controller do mybitcoin-api — tags, operações, exemplos de body de sucesso e de erro. Gatilhos válidos — (1) slash command /swagger-docs; (2) usuário pede "documenta esse endpoint no swagger", "adiciona exemplo no swagger", "atualiza a documentação da API", "cria a doc do swagger para X". Aplica as convenções já estabelecidas no projeto (DomainErrorResponseDto, ApiCookieAuth, tags por módulo) para que `/docs` fique completo e navegável. NÃO altera regra de negócio, apenas anotações de documentação. NÃO invocar automaticamente em toda edição de controller — só quando o usuário pedir a documentação.
---

# Swagger Docs — mybitcoin-api

Você documenta endpoints HTTP com `@nestjs/swagger` para que `/docs` sirva como referência completa e testável da API. Você **não** altera comportamento de negócio — só anotações (`@Api*`) e DTOs de resposta.

**Alvo de `$ARGUMENTS`:** controller, endpoint ou módulo específico. Se vazio, documente o diff atual (`git diff main...HEAD` em arquivos `*.controller.ts`).

---

## Contexto do projeto

- Setup global do Swagger: `src/main.ts` (`DocumentBuilder` + `SwaggerModule.setup('docs', ...)`)
- Erros de domínio são capturados por `src/infrastructure/http/domain-error.filter.ts`, que sempre responde `{ code, message }` — nunca outro formato
- Autenticação é por cookie de sessão (`SESSION_COOKIE_NAME` em `src/modules/identity/presentation/session-cookies.ts`), não por Bearer token
- DTO compartilhado de erro: `src/infrastructure/http/domain-error-response.dto.ts` (`DomainErrorResponseDto`) — reuse, não recrie

---

## Passo 1 — Levantar os fatos antes de documentar

Nunca invente exemplo ou status code. Para cada endpoint do alvo:

1. Leia o **controller** para saber path, verbo HTTP e status de sucesso real (`@HttpCode` explícito, ou o default do NestJS: `POST`/`PUT`/`PATCH` → 201, `GET`/`DELETE` → 200, a menos que haja `@HttpCode(HttpStatus.NO_CONTENT)`).
2. Leia o **DTO de entrada** (`*.dto.ts`) para os campos reais — nomes, tipos, obrigatoriedade.
3. Leia o **use case** (`application/*.usecase.ts`) chamado pelo controller e siga toda a árvore de chamadas (value objects, entidades) para listar **todos** os `DomainError` que podem ser lançados — cada um tem `code` e `message` fixos na própria classe de erro (`src/modules/<ctx>/domain/errors/*.error.ts`).
4. Verifique `src/infrastructure/http/domain-error.filter.ts` → `STATUS_BY_CODE` para saber qual HTTP status cada `code` produz. Códigos ausentes do mapa caem no `DEFAULT_STATUS` (422 Unprocessable Entity).
5. Se o endpoint usa `@UseGuards(SessionAuthGuard)`, ele exige cookie de sessão (401 se ausente/inválido/expirado) e, se for método mutante (POST/PUT/PATCH/DELETE), também o header `X-CSRF-Token` (403 se ausente/divergente) — documente os dois.

---

## Passo 2 — Anotar o controller

Ordem e decorators por controller:

```typescript
@ApiTags('NomeDoModulo')          // um por módulo de negócio: Auth, Sessions, Financial, etc.
@Controller('rota')
export class XController {
```

Se o controller inteiro exige sessão (`@UseGuards(SessionAuthGuard)` na classe), adicione também no nível da classe:

```typescript
@ApiCookieAuth(SESSION_COOKIE_NAME)
@ApiUnauthorizedResponse({ description: 'Cookie de sessão ausente, inválido, expirado ou revogado' })
```

Por método:

```typescript
@Post('caminho')
@ApiOperation({ summary: '...', description: '...' })   // description só quando agrega algo além do summary
@ApiBody({ type: XDto, examples: { default: { summary: '...', value: {...} } } })  // omitir se não há body
@ApiParam({ name: 'id', description: '...', example: '...' })  // um por parâmetro de rota
@ApiCreatedResponse / @ApiOkResponse / @ApiNoContentResponse({ ... })  // resposta de sucesso real
@ApiUnprocessableEntityResponse / @ApiConflictResponse / @ApiNotFoundResponse / @ApiForbiddenResponse({ ... })  // uma por status de erro possível
```

Regras:

- **Um `@ApiXxxResponse` por status HTTP distinto**, nunca um genérico "erro" cobrindo vários status.
- Quando um mesmo status (ex: 422) cobre múltiplos `code` de erro, use `examples` (plural, com chave por cenário) em vez de `example` único — veja `IdentityController.register` como modelo.
- `type: DomainErrorResponseDto` em toda resposta de erro de domínio, para o schema aparecer correto mesmo com múltiplos exemplos.
- Exemplos de sucesso: crie (ou reutilize) um DTO de resposta em `presentation/dto(s)/*-response.dto.ts` com `@ApiProperty({ description, example })` em cada campo — não retorne tipos anônimos (`{ status: string }`) sem DTO equivalente para o Swagger enxergar o schema.
- Nunca copie mensagens de erro genéricas — use a mensagem exata que a classe de erro produz (interpole os valores de exemplo escolhidos, ex: mesmo `email` do exemplo de sucesso).

---

## Passo 3 — DTOs

Todo DTO de request ganha `@ApiProperty` em cada campo com `description` (o que é, não repita o nome) e `example` realista — reaproveite valores fictícios coerentes entre si dentro do mesmo endpoint (mesmo email no request e nos exemplos de erro, por exemplo).

Todo DTO de response é uma classe nova em `presentation/dto(s)/`, nunca uma interface — decorators do Swagger exigem classe.

---

## Passo 4 — main.ts

Se o endpoint pertence a um módulo/tag que ainda não existe em `DocumentBuilder`, adicione `.addTag('Nome', 'descrição curta')` em `src/main.ts`. Não crie uma tag por controller quando já existe uma tag de módulo equivalente.

---

## Passo 5 — Verificar

1. `pnpm start:dev` (ou `./node_modules/.bin/nest start --watch` se `pnpm start:dev` falhar por causa do `pnpm install` de dependências ignoradas)
2. `curl -s http://localhost:3000/docs-json | python3 -m json.tool` — confirme que o path aparece com todos os status codes esperados e que os `examples`/`example` batem com o que você escreveu
3. `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/docs` deve retornar `200`

Nunca declare a tarefa concluída sem rodar o passo 5.

---

## O que NÃO fazer

- Não adicione `class-validator` novo a um DTO só para "ficar mais completo" — isso é validação de runtime, fora do escopo desta skill (avise o usuário se notar a ausência).
- Não troque o status HTTP real do endpoint para "parecer melhor" na doc — a doc reflete o comportamento existente.
- Não documente endpoints que não existem ou parâmetros que o controller não aceita.
- Não crie uma tag nova por endpoint — tags são por módulo de negócio.
