# Quando Usar Clean Architecture

**Objetivo:** Definir o critério que determina se um fluxo usa Clean Architecture completa ou uma abordagem mais simples.

Clean Architecture tem um custo real: interfaces de repositório, use cases, inversão de dependência, injeção via módulo NestJS. Esse custo só se justifica quando a complexidade de negócio é real o suficiente para precisar de isolamento e testabilidade profunda.

---

## O critério

**Um fluxo usa Clean Architecture se qualquer uma das condições abaixo for verdadeira:**

- Toca saldo, ledger ou qualquer movimentação financeira
- Executa ou valida regra de negócio do domínio (invariantes, transições de estado, cálculos)
- Envolve segurança: autenticação, autorização, KYC, tokens
- Toca Bitcoin: transações on-chain, endereços, confirmações
- Pode afetar múltiplos usuários ou produzir efeito colateral auditável

**Um fluxo pode usar abordagem simples se todas as condições abaixo forem verdadeiras:**

- É CRUD puro sem regra de negócio (criar, listar, editar, remover)
- Não afeta saldo, ledger, segurança ou Bitcoin
- É operação administrativa ou de configuração do sistema
- Falha nesse fluxo não compromete integridade financeira ou de acesso

---

## Exemplos

| Fluxo | Abordagem | Motivo |
|-------|-----------|--------|
| Cadastrar nova moeda (BTC, ETH, USDT) | Simples | CRUD administrativo, sem regra de negócio |
| Criar par de mercado (BTC/USDT) | Simples | Configuração do sistema |
| Listar moedas disponíveis | Simples | Leitura pura, sem lógica |
| Depositar Bitcoin | Clean Architecture | Toca ledger, segurança, on-chain |
| Solicitar saque | Clean Architecture | Toca saldo, ledger, regras de negócio |
| Criar ordem de compra | Clean Architecture | Toca saldo bloqueado, invariantes de ordem |
| Submeter KYC | Clean Architecture | Envolve segurança e regras de identidade |
| Login / autenticação | Clean Architecture | Segurança |
| Listar ordens do usuário | Clean Architecture | Dados financeiros do usuário autenticado |
| Configurar taxa de transação | Simples ou CA | Depende: se muda taxa de ordens já existentes → CA; se é apenas configuração futura → Simples |

---

## Estrutura de pastas

### Fluxos com Clean Architecture
Seguem a estrutura definida em `03-estrutura-projeto.md`:

```
src/modules/<contexto>/
├── domain/              ← entidades, value objects, interfaces de repositório
├── application/         ← use cases
├── infrastructure/      ← implementações (banco, RPC, storage)
│   └── persistence/
└── presentation/        ← controllers, DTOs, módulo NestJS
```

### Fluxos simples (CRUD administrativo)
Ficam dentro do módulo correspondente, mas com camadas simplificadas — sem abstract repository, sem use case separado:

```
src/modules/<contexto>/
├── application/         ← service direto (sem use case pattern)
├── infrastructure/      ← SQL direto no service ou repositório simples
└── presentation/        ← controller, DTOs, módulo NestJS
```

---

## A linha vermelha

A pergunta que decide: **"se esse código falhar ou tiver um bug, pode haver perda ou criação indevida de valor financeiro, ou comprometimento de acesso de um usuário?"**

- Sim → Clean Architecture
- Não → Abordagem simples é suficiente

Dúvida → Clean Architecture. O custo de adicionar a abstração depois é menor que o custo de um bug financeiro.

---

## Use cases de leitura pura (evitar boilerplate dentro da própria CA)

Escolher Clean Architecture para um fluxo (por cair na linha vermelha) não dá carta branca para empilhar indireção sem função. Um problema recorrente identificado no projeto (ex: `GetBalancesUseCase`, `GetCurrentUser`, `ListActiveSessions`): o use case é `find + map` puro, sem nenhuma validação, decisão ou orquestração — existe só porque "toda operação tem um use case".

**Regra:** a camada `presentation` sempre chama um use case (nunca um repositório diretamente — mantém `controller → application → infrastructure`). Mas o use case de leitura pura deve:

- Retornar a entidade de domínio direto (`Promise<Wallet[]>`), não recriar um DTO/interface própria (`BalanceResult`) que só duplica os campos da entidade — esse mapeamento intermediário não tem função e obriga a presentation a mapear duas vezes o mesmo dado.
- Existir mesmo sem lógica hoje, se lógica futura é esperada (ex: filtro por saldo mínimo, paginação, agregação) — mas isso deve estar dito no ADR ou num comentário, não implícito.

A conversão de tipo para a borda HTTP (`bigint` → `string`) continua sendo responsabilidade exclusiva do `presentation` (DTO), nunca do use case.
