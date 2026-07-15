---
name: frontend-guard
description: Valida se o código frontend respeita as convenções, invariantes e padrões de qualidade definidos no mybitcoin-front. Skill MANUAL — invoque após implementar código frontend. Gatilhos válidos — (1) slash command /frontend-guard; (2) usuário pede "validar o frontend", "checar o front", "verificar invariantes frontend". Lê as convenções do CLAUDE.md do frontend e os invariantes definidos em invariants.ts, analisa o código e reporta cada violação com evidência. NÃO altera código. NÃO invocar automaticamente.
---

# Frontend Guard — cross-project

Você valida se o código frontend implementado respeita as convenções, invariantes e padrões de qualidade do mybitcoin-front.

## Configuração

Leia `.pipeline-config.json` na raiz do mybitcoin-api para obter o path do frontend.

```typescript
const FRONTEND_PATH = '<path from .pipeline-config.json>'
```

## Regras de ouro

1. **NUNCA confie no código revisado.** Re-derive a validação a partir das convenções.
2. **pt-BR** em toda a comunicação.
3. **NÃO altera código.** Apenas reporta violações com evidência `arquivo:linha`.
4. **Severity:** CRÍTICO (bloqueante), ALTO (deve corrigir), MÉDIO (recomendado), BAIXO (sugestão).

## Passo 0 — Carregar contexto

1. Leia `CLAUDE.md` do frontend para entender todas as convenções.
2. Leia `src/invariants.ts` para as invariantes frontend (FIN-xxx, UI-xxx, DATA-xxx, SEC-xxx).
3. Leia o diff ou os arquivos criados/modificados.

## Passo 1 — Executar checks automáticos

### 1.1 — Build e Lint

```bash
cd <FRONTEND_PATH>
pnpm build
pnpm lint
```

Se houver erros → reporte e PARE. Build/lint são gate absoluto.

### 1.2 — Verificações de invariantes

```bash
# FIN-001: Nenhum Number() em valores monetários
grep -rn "Number(.*satoshi\|Number(.*amount\|Number(.*balance\|Number(.*price" <FRONTEND_PATH>/src/

# FIN-002: formatSatoshi é o único path para exibir satoshi
grep -rn "\.toFixed.*BTC\|\/ 1e8\|\/ 100_000_000" <FRONTEND_PATH>/src/

# SEC-002: Nenhum localStorage.setItem com token
grep -rn "localStorage.*token\|localStorage.*jwt\|localStorage.*auth\|localStorage.*password" <FRONTEND_PATH>/src/

# SEC-003: Valores monetários não interpolados em URLs
grep -rn "\`.*satoshi.*\`\|\".*satoshi.*\"" <FRONTEND_PATH>/src/ | grep -i "url\|href\|api\|fetch"

# UI-004: Componentes não excedem 150 linhas
wc -l <FRONTEND_PATH>/src/components/**/*.tsx | sort -rn | head -20
```

### 1.3 — Verificações de organização

```bash
# God components: arquivos com mais de 150 linhas
find <FRONTEND_PATH>/src/components -name "*.tsx" -exec sh -c 'lines=$(wc -l < "$1"); if [ "$lines" -gt 150 ]; then echo "$1: $lines linhas"; fi' _ {} \;

# God components: arquivos com mais de 5 exports
grep -rn "^export " <FRONTEND_PATH>/src/components/ | awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -10
```

## Passo 2 — Revisão manual (seguindo component-reviewer)

Execute as 8 categorias do `component-reviewer` do frontend:

| Critério | O que verifica |
|----------|---------------|
| C1 — Responsabilidade | Componente faz uma coisa bem? ≤ 150 linhas? |
| C2 — Valores monetários | Nenhum `Number()` em satoshi? Usa `formatSatoshi()`? |
| C3 — shadcn e tokens | Tokens semânticos? `gap-*`? `size-*`? `cn()`? |
| C4 — Mobile-first | Base < 768px? Touch targets ≥ 44px? `min-w-0`? |
| C5 — Acessibilidade | `aria-label`? `<Label>` com `htmlFor`? `<button>` semântico? |
| C6 — Estado e hooks | TanStack Query para server state? `useState` para local? |
| C7 — Props e TypeScript | Sem `any`? Props agrupadas? ≤ 5 props? |
| C8 — Estados da UI | Loading tratado? Error tratado? Empty tratado? |

## Passo 3 — Revisão shadcn (se aplicável)

Se houver componentes shadcn ou customizados, execute as verificações do `shadcn-component-review`:

| Check | O que verifica |
|-------|---------------|
| Estrutura | `data-slot` presente? Composição limpa? |
| Spacing | `gap-*` (não `space-y-*`)? Escala padrão? |
| Tokens | `text-foreground`, `bg-muted` (não `text-gray-500`)? |
| Composability | `className` via `cn()`? Variante CVA? |
| Responsive/a11y | Mobile-first? Touch targets? `focus-visible:`? |

## Passo 4 — Formulários (se aplicável)

Se houver formulários, verifique:

| Check | O que verifica |
|-------|---------------|
| Schema zod | Validação definida com zod? |
| react-hook-form | Usando `useForm` + `zodResolver`? |
| shadcn Form | Usando `<FormField>`, `<FormItem>`, `<FormLabel>`? |
| Erros da API | `form.setError('root', ...)` para erros de backend? |

## Passo 5 — Error Handling (se aplicável)

| Check | O que verifica |
|-------|---------------|
| Error Boundary | Rota tem `<ErrorBoundary>`? |
| API errors | Usando `handleApiError()` de `@/lib/api-errors`? |
| Loading states | `Skeleton` ou equivalente durante carregamento? |
| Empty states | Mensagem quando não há dados? |

## Formato de resposta

### Tudo OK:
```
CONFORME

Build: PASS
Lint: PASS
Invariantes: PASS (FIN-001 ✓, FIN-002 ✓, UI-004 ✓, SEC-002 ✓, SEC-003 ✓)
Componentes: PASS
shadcn: PASS (se aplicável)
Formulários: PASS (se aplicável)
Error Handling: PASS (se aplicável)
```

### Com problemas:
```
VIOLAÇÃO

Build: PASS
Lint: PASS

FIN-001: VIOLAÇÃO
  src/components/wallet/balance-card.tsx:23 — Number(amount_satoshi) perde precisão

UI-004: VIOLAÇÃO
  src/pages/wallet/WalletPage.tsx — 234 linhas (limite: 150)

SEC-002: VIOLAÇÃO
  src/services/auth.service.ts:15 — localStorage.setItem('token', ...) — tokens devem ficar em httpOnly cookies

C3: MÉDIO
  src/components/wallet/transaction-table.tsx:45 — text-gray-500 hardcoded, use text-muted-foreground
```

**Severidade:**

| Nível | Critério |
|-------|---------|
| CRÍTICO | FIN-001 (Number em satoshi), SEC-002 (token em localStorage), build com erro |
| ALTO | UI-001 (sem error state), UI-003 (input sem label), UI-004 (>150 linhas), C1 (god component), C5 (a11y bloqueante) |
| MÉDIO | C3 (token hardcoded), C4 (mobile quebrado), C6 (Zustand para local), formulário sem zod |
| BAIXO | C3 (space-y em flex), C4 (touch target pequeno), naming genérico |

**Regras:**
- Máximo 8 issues por arquivo — priorize os mais graves
- Não invente problemas
- `src/components/ui/` (shadcn gerado) — não revisar
- Build/lint com erro = CRÍTICO, bloqueia avanço
