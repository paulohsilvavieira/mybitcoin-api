---
name: frontend-executor
description: Implementa código frontend (React) no repositório mybitcoin-front. Skill MANUAL — invoque para implementar uma feature frontend já planejada. Gatilhos válidos — (1) slash command /frontend-executor; (2) usuário pede "implementar o frontend", "criar as telas", "codar o front". Implementa na ordem correta (types → services → stores → hooks → components → pages), segue padrões shadcn/Zustand/TanStack Query, e PARA no gate humano antes de commitar. NÃO invocar automaticamente.
---

# Frontend Executor — cross-project

Você implementa código **frontend** no repositório mybitcoin-front, orquestrado pela pipeline unificada do mybitcoin-api.

## Configuração

Leia `.pipeline-config.json` na raiz do mybitcoin-api para obter o path do frontend.

```typescript
const FRONTEND_PATH = '<path from .pipeline-config.json>'
```

Todas as operações de arquivo usam `FRONTEND_PATH` como base.

## Regras de ouro

1. **Só executa após plano aprovado** (task-planner ou ADR).
2. **Ordem obrigatória:** types → services → stores → hooks → components → pages.
3. **Valores monetários nunca são `number`.** String da API → `BigInt` para cálculo → `formatSatoshi()` para exibição.
4. **shadcn antes de criar componente customizado.** Verifique se existe primeiro.
5. **Mobile-first.** Todo layout começa para < 768px.
6. **Componentes ≤ 150 linhas.** Se maior, extrair sub-componentes ou hooks.
7. **Nunca crie god components.** 1 componente por arquivo, ≤ 5 props.
8. **Error Boundary em toda rota.**
9. **Valores monetários sempre com `BigInt`** — nunca `Number()` em frontend.
10. **Você PARA no gate.** NÃO commita.

## Passo 0 — Preflight

1. Leia o plano aprovado (task-planner output ou ADR).
2. Confirme que o path do frontend existe e está acessível.
3. Leia `CLAUDE.md` do frontend para entender convenções atuais.
4. Leia o código existente nas áreas afetadas antes de criar qualquer arquivo.

## Passo 1 — Implementar na ordem correta

### 1. Tipos (`<frontend>/src/types/`)

Para cada interface do plano:
- Crie tipos de request, response e modelos de UI separados.
- Valores monetários: `amount_satoshi: string` (nunca `number`).
- Use tipos discriminados para estados de UI quando útil.
- **GATE 1.1:** "Tipos criados. <arquivos>. Aprova para services?"

### 2. Services (`<frontend>/src/services/`)

Para cada endpoint do plano:
- Funções axios que retornam o tipo correto.
- Hooks TanStack Query wrappando cada função:
  - `useQuery` para leitura com `queryKey` estável e `staleTime` intencional.
  - `useMutation` para escrita com `onSuccess` invalidando queries relacionadas.
  - Erros da API mapeados via `handleApiError()` de `@/lib/api-errors`.

```typescript
// Padrão de service
export const walletService = {
  getBalance: (userId: string): Promise<BalanceResponse> =>
    api.get(`/wallets/${userId}/balance`).then(r => r.data),
}

// Padrão de hook query
export function useBalance(userId: string) {
  return useQuery({
    queryKey: ['balance', userId],
    queryFn: () => walletService.getBalance(userId),
    staleTime: 30_000,
  })
}
```

- **GATE 1.2:** "Services criados. <arquivos>. Aprova para stores?"

### 3. Store (`<frontend>/src/stores/`) — só se estado global

- Um arquivo por domínio: `useAuthStore.ts`, `useWalletStore.ts`.
- Estado mínimo — só o que não pode viver em TanStack Query.
- Seletores granulares para evitar re-renders desnecessários.

```typescript
// Padrão de store Zustand
interface AuthState {
  user: User | null
  setUser: (user: User | null) => void
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}))
```

- **GATE 1.3:** "Store criada. <arquivo>. Aprova para hooks?"

### 4. Hooks (`<frontend>/src/hooks/`)

Para lógica reutilizável extraída de componentes:
- Nome: `use<NomeDescritivo>.ts`
- Encapsula queries, stores e lógica local
- Retorna o que o componente precisa, não mais
- **GATE 1.4:** "Hooks criados. <arquivos>. Aprova para componentes?"

### 5. Componentes (`<frontend>/src/components/<domínio>/`)

Para componentes compartilhados:
- Mobile-first obrigatório
- `data-slot` em sub-elementos semânticos
- `className` aceito via `cn()`
- Variantes via CVA quando houver variação
- Estados de loading/erro/vazio tratados (Skeleton, Alert, EmptyState)
- Acessibilidade: `aria-label`, `<Label>` com `htmlFor`, `focus-visible:`
- **Máximo 150 linhas por componente**
- **Máximo 5 props por componente** (senão, usar objeto)
- **Máximo 1 componente export por arquivo**
- **GATE 1.5:** "Componentes criados. <arquivos>. Aprova para página?"

### 6. Página (`<frontend>/src/pages/<rota>/`)

- Compõe os componentes menores
- Lida com loading/erro no nível de página (Suspense ou condicional)
- Sem lógica de negócio inline — tudo em hooks
- Envolta em `<ErrorBoundary>`
- Lazy loaded com `React.lazy()`
- **GATE 1.6:** "Página criada. <arquivo>. Aprova para build/lint?"

## Passo 2 — Auto-verificação

1. Rode `pnpm build` no frontend — deve passar sem erros de TypeScript.
2. Rode `pnpm lint` no frontend — sem erros de lint.
3. Verifique visualmente no browser (`pnpm dev`) os estados: loading, erro, vazio, sucesso.
4. Verifique mobile: redimensione para 375px e confirme que o layout não quebra.

## Passo 3 — Verificar invariantes

Execute as verificações automáticas:

```bash
# FIN-001: Nenhum Number() em valores monetários
grep -rn "Number(.*satoshi\|Number(.*amount\|Number(.*balance" <frontend>/src/

# FIN-002: formatSatoshi é o único path para exibir satoshi
grep -rn "\.toFixed.*BTC\|\/ 1e8\|\/ 100_000_000" <frontend>/src/

# UI-004: Componentes não excedem 150 linhas
wc -l <frontend>/src/components/**/*.tsx

# SEC-002: Nenhum localStorage.setItem com token
grep -rn "localStorage.*token\|localStorage.*jwt\|localStorage.*auth" <frontend>/src/
```

## Passo 4 — Reportar e PARAR (gate humano)

Responda em pt-BR, sem commitar:
- **Frontend implementado** e quais passos do plano foram implementados.
- **Arquivos criados/alterados** — um bullet por arquivo com o que faz.
- **Build/lint:** resultado.
- **Verificação visual:** o que foi testado no browser.
- **Invariantes:** resultado da verificação.
- **Desvios:** qualquer diferença entre o plano e o que foi implementado.
- **Próximo passo:** "Revise o diff. Após aprovar, execute `/frontend-guard`."

## Limitações

- Se o plano estiver ambíguo, **PARE** e devolva para `/task-planner` — não preencha lacunas com suposição.
- Se a implementação exigir endpoint que ainda não existe na API, sinalize — é dependência bloqueante.
- Nunca edite arquivos em `src/components/ui/` (shadcn gerado).
