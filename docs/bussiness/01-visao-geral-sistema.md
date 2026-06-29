# Visão Geral do Sistema

## 1. Objetivos

A Exchange Spot Educacional é uma plataforma destinada ao aprendizado dos conceitos operacionais, financeiros e tecnológicos envolvidos na negociação de ativos digitais em mercados spot.

### Objetivos Principais

| Objetivo                | Descrição                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Educação Financeira     | Permitir que usuários aprendam conceitos de negociação de criptomoedas.                  |
| Simulação de Mercado    | Reproduzir o funcionamento de uma exchange real com comportamento semelhante ao mercado. |
| Aprendizado Operacional | Demonstrar processos de cadastro, depósito, negociação e retirada.                       |
| Compreensão Tecnológica | Expor conceitos como Order Book, Matching Engine, Wallets e Liquidação.                  |
| Ambiente Seguro         | Possibilitar experimentação sem riscos financeiros reais.                                |

### Objetivos Técnicos

* Simular negociações spot.
* Gerenciar saldos e carteiras.
* Executar ordens através de um mecanismo de matching.
* Disponibilizar histórico de negociações.
* Permitir acompanhamento de preços em tempo real.
* Demonstrar conceitos de custódia de ativos digitais.

---

## 2. Escopo

O sistema contempla exclusivamente operações relacionadas ao mercado Spot.

### Funcionalidades Incluídas

| Domínio       | Funcionalidades                                        |
| ------------- | ------------------------------------------------------ |
| Usuários      | Cadastro, autenticação e gerenciamento de perfil       |
| Carteira      | Controle de saldo em moedas fiduciárias e criptomoedas |
| Mercado       | Visualização de pares de negociação                    |
| Negociação    | Criação e cancelamento de ordens                       |
| Matching      | Casamento de ordens de compra e venda                  |
| Market Data   | Book de ofertas, trades e ticker                       |
| Histórico     | Consultas de ordens e negociações executadas           |
| Administração | Cadastro de ativos e pares de negociação               |
| Auditoria     | Registro de eventos operacionais                       |

### Ativos Suportados

Exemplo:

| Tipo          | Exemplo       |
| ------------- | ------------- |
| Fiat Simulada | BRL           |
| Stablecoin    | USDT          |
| Criptomoeda   | BTC, ETH, SOL |

### Pares de Negociação

Exemplos:

| Par      | Descrição                      |
| -------- | ------------------------------ |
| BTC/BRL  | Bitcoin negociado contra Real  |
| ETH/BRL  | Ethereum negociado contra Real |
| BTC/USDT | Bitcoin negociado contra USDT  |
| SOL/USDT | Solana negociada contra USDT   |

---

## 3. Não Objetivos

A plataforma educacional não pretende reproduzir integralmente uma exchange comercial de produção.

### Fora do Escopo

| Item                                     | Motivo                                       |
| ---------------------------------------- | -------------------------------------------- |
| Trading com dinheiro real                | Foco educacional                             |
| Integração bancária real                 | Não necessária para aprendizado              |
| Mercado de Derivativos                   | Complexidade adicional                       |
| Futuros Perpétuos                        | Fora do escopo Spot                          |
| Opções                                   | Fora do escopo educacional inicial           |
| Lending e Staking                        | Não fazem parte do núcleo de negociação Spot |
| Custódia Blockchain Real                 | Pode ser simulada                            |
| Integração com redes blockchain públicas | Opcional para fins didáticos                 |
| Market Making Automatizado               | Não faz parte do escopo inicial              |
| Arbitragem Multi-Exchange                | Não contemplada                              |

---

## 4. Glossário

| Termo           | Definição                                                      |
| --------------- | -------------------------------------------------------------- |
| Exchange        | Plataforma para negociação de ativos financeiros ou digitais   |
| Spot Market     | Mercado onde a liquidação ocorre imediatamente após a execução |
| Asset           | Ativo negociável                                               |
| Pair            | Par de negociação                                              |
| Wallet          | Carteira para armazenamento de ativos                          |
| Order           | Instrução de compra ou venda                                   |
| Trade           | Negociação efetivamente executada                              |
| Order Book      | Livro de ofertas                                               |
| Matching Engine | Componente responsável por casar ordens                        |
| Bid             | Melhor oferta de compra                                        |
| Ask             | Melhor oferta de venda                                         |
| Spread          | Diferença entre melhor compra e melhor venda                   |
| Liquidez        | Facilidade de compra ou venda de um ativo                      |
| Market Data     | Informações de mercado em tempo real                           |
| Ticker          | Resumo dos dados de mercado                                    |
| Maker           | Usuário que adiciona liquidez                                  |
| Taker           | Usuário que remove liquidez                                    |

---

# 5. Conceitos Financeiros

## Ativo

Representa qualquer instrumento negociável dentro da exchange.

### Exemplos

| Ativo | Tipo             |
| ----- | ---------------- |
| BRL   | Moeda fiduciária |
| BTC   | Criptomoeda      |
| ETH   | Criptomoeda      |
| USDT  | Stablecoin       |

---

## Saldo Disponível

Valor que pode ser utilizado imediatamente para negociação.

### Exemplo

| Ativo | Saldo      |
| ----- | ---------- |
| BRL   | 10.000     |
| BTC   | 0,50000000 |

---

## Saldo Bloqueado

Valor reservado para execução de ordens abertas.

### Exemplo

Um usuário possui:

* 10.000 BRL
* Cria uma ordem de compra de BTC no valor de 2.000 BRL

Resultado:

| Tipo       | Valor     |
| ---------- | --------- |
| Disponível | 8.000 BRL |
| Bloqueado  | 2.000 BRL |

---

## Liquidação

Processo de transferência dos ativos entre comprador e vendedor após a execução de uma negociação.

### Exemplo

Compra:

* 0,10 BTC
* Preço: 500.000 BRL

Liquidação:

| Participante | Recebe     |
| ------------ | ---------- |
| Comprador    | 0,10 BTC   |
| Vendedor     | 50.000 BRL |

---

## Taxa de Negociação

Valor cobrado pela exchange sobre operações executadas.

### Exemplo

| Operação   | Valor      |
| ---------- | ---------- |
| Compra BTC | 10.000 BRL |
| Taxa       | 0,1%       |
| Cobrança   | 10 BRL     |

---

# 6. Conceitos de Mercado

## Par de Negociação

Representa dois ativos negociados entre si.

### Estrutura

```text
ATIVO_BASE / ATIVO_COTAÇÃO
```

### Exemplo

```text
BTC/BRL
```

* Ativo Base: BTC
* Ativo Cotação: BRL

---

## Preço de Mercado

Último preço negociado para determinado ativo.

### Exemplo

| Par     | Último Preço |
| ------- | ------------ |
| BTC/BRL | 500.000 BRL  |

---

## Livro de Ofertas (Order Book)

Estrutura que contém todas as ordens abertas.

### Exemplo

| Compras (Bid) | Quantidade |
| ------------- | ---------- |
| 499.000       | 0,5 BTC    |
| 498.500       | 1,2 BTC    |

| Vendas (Ask) | Quantidade |
| ------------ | ---------- |
| 500.500      | 0,8 BTC    |
| 501.000      | 2,0 BTC    |

---

## Spread

Diferença entre a melhor oferta de compra e a melhor oferta de venda.

### Exemplo

| Melhor Compra | Melhor Venda |
| ------------- | ------------ |
| 499.000       | 500.500      |

```text
Spread = 1.500 BRL
```

---

## Liquidez

Capacidade de executar operações sem impactar significativamente o preço do ativo.

### Características

| Alta Liquidez   | Baixa Liquidez |
| --------------- | -------------- |
| Muitas ordens   | Poucas ordens  |
| Menor spread    | Maior spread   |
| Execução rápida | Execução lenta |

---

## Volume Negociado

Quantidade total negociada em determinado período.

### Exemplo

| Período | Volume BTC |
| ------- | ---------- |
| 24h     | 1.250 BTC  |

---

# 7. Conceitos de Exchange

## Wallet

Módulo responsável pelo gerenciamento dos saldos dos usuários.

### Responsabilidades

* Crédito de saldo.
* Débito de saldo.
* Bloqueio para ordens.
* Liberação de saldo.
* Histórico de movimentações.

---

## Matching Engine

Componente central da exchange responsável pelo casamento das ordens.

### Responsabilidades

| Função            | Descrição                       |
| ----------------- | ------------------------------- |
| Receber ordens    | Entrada de compra e venda       |
| Priorizar ofertas | Aplicação das regras de mercado |
| Executar trades   | Gerar negociações               |
| Atualizar livro   | Manter o Order Book consistente |

### Critério de Prioridade

1. Melhor preço.
2. Maior antiguidade da ordem.

---

## Ordem Limitada (Limit Order)

Permite definir o preço desejado para compra ou venda.

### Exemplo

```text
Comprar 0,10 BTC a 495.000 BRL
```

A ordem permanecerá aberta até encontrar contraparte.

---

## Ordem a Mercado (Market Order)

Executa imediatamente contra as melhores ofertas disponíveis.

### Exemplo

```text
Comprar 0,10 BTC ao melhor preço disponível.
```

---

## Maker e Taker

### Maker

Usuário que adiciona liquidez ao livro.

Exemplo:

```text
Ordem Limitada inserida no Book.
```

### Taker

Usuário que consome liquidez existente.

Exemplo:

```text
Ordem a Mercado executada imediatamente.
```

---

## Trade

Resultado do encontro entre uma ordem de compra e uma ordem de venda.

### Exemplo

| Campo            | Valor       |
| ---------------- | ----------- |
| Par              | BTC/BRL     |
| Quantidade       | 0,10 BTC    |
| Preço            | 500.000 BRL |
| Valor Financeiro | 50.000 BRL  |

---

## Ticker

Resumo das informações de mercado.

### Exemplo

| Campo        | Valor     |
| ------------ | --------- |
| Último Preço | 500.000   |
| Máxima 24h   | 510.000   |
| Mínima 24h   | 495.000   |
| Volume 24h   | 1.250 BTC |

---

## Fluxo Simplificado de Negociação

```text
Usuário
   │
   ▼
Criação da Ordem
   │
   ▼
Validação
   │
   ▼
Bloqueio de Saldo
   │
   ▼
Matching Engine
   │
   ├── Sem Match → Order Book
   │
   └── Com Match
          │
          ▼
       Trade
          │
          ▼
      Liquidação
          │
          ▼
 Atualização de Saldos
```
