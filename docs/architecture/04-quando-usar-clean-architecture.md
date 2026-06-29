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
src/
├── domain/           ← entidades, value objects, interfaces de repositório
├── application/      ← use cases
├── infrastructure/   ← implementações (banco, RPC, storage)
└── interface-adapters/
    └── http/         ← controllers, DTOs, módulos NestJS
```

### Fluxos simples (CRUD administrativo)
Ficam em `src/admin/`, organizados por recurso:

```
src/
└── admin/
    ├── currency/
    │   ├── currency.controller.ts   ← recebe request, chama service, retorna response
    │   ├── currency.service.ts      ← lógica trivial, chama DatabaseService diretamente
    │   ├── currency.dto.ts          ← validação de entrada com class-validator
    │   └── currency.module.ts
    ├── market/
    │   ├── market.controller.ts
    │   ├── market.service.ts
    │   ├── market.dto.ts
    │   └── market.module.ts
    └── admin.module.ts
```

**Regras para `src/admin/`:**
- Controller → Service → `DatabaseService` (do `database.module.ts`)
- Sem interface de repositório, sem use case separado
- SQL nomeado em constantes no próprio arquivo de service ou em `queries/` dentro do módulo
- DTO com `class-validator` obrigatório na entrada
- `DatabaseService` injetado via construtor (não diretamente o pool)
- Se a complexidade crescer e o fluxo começar a tocar regras de negócio → migrar para Clean Architecture

---

## A linha vermelha

A pergunta que decide: **"se esse código falhar ou tiver um bug, pode haver perda ou criação indevida de valor financeiro, ou comprometimento de acesso de um usuário?"**

- Sim → Clean Architecture
- Não → Abordagem simples é suficiente

Dúvida → Clean Architecture. O custo de adicionar a abstração depois é menor que o custo de um bug financeiro.
