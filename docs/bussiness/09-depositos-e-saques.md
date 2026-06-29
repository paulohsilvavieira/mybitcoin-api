# Depósitos e Saques

## 1. Visão Geral

Os módulos de Depósitos e Saques são responsáveis pela movimentação de ativos entre ambientes externos e as carteiras internas da Exchange.

Seu objetivo é garantir:

* Integridade dos saldos.
* Rastreabilidade das movimentações.
* Controle de risco operacional.
* Conciliação financeira.
* Experiência consistente para o usuário.

---

# 2. Depósitos

## 2.1 Objetivo

Permitir que usuários adicionem ativos à sua conta para utilização em negociações.

Os depósitos podem ocorrer para:

| Tipo             | Exemplo       |
| ---------------- | ------------- |
| Moeda Fiduciária | BRL           |
| Stablecoin       | USDT          |
| Criptomoeda      | BTC, ETH, SOL |

---

## 2.2 Fluxo de Depósito

### Fluxo Simplificado

```text
Usuário
    │
    ▼
Solicita Endereço de Depósito
    │
    ▼
Recebe Endereço Wallet
    │
    ▼
Transfere Ativo
    │
    ▼
Monitoramento
    │
    ▼
Validação
    │
    ▼
Confirmações
    │
    ▼
Crédito em Conta
    │
    ▼
Saldo Disponível
```

---

## 2.3 Estados do Depósito

| Estado           | Descrição                          |
| ---------------- | ---------------------------------- |
| CREATED          | Solicitação criada                 |
| WAITING_TRANSFER | Aguardando envio do ativo          |
| DETECTED         | Transferência identificada         |
| VALIDATING       | Processo de validação em andamento |
| CONFIRMING       | Aguardando confirmações            |
| COMPLETED        | Crédito realizado                  |
| REJECTED         | Depósito rejeitado                 |
| EXPIRED          | Solicitação expirada               |
| FAILED           | Falha operacional                  |

### Máquina de Estados

```text
CREATED
   │
   ▼
WAITING_TRANSFER
   │
   ▼
DETECTED
   │
   ▼
VALIDATING
   │
   ▼
CONFIRMING
   │
   ▼
COMPLETED
```

Fluxos alternativos:

```text
VALIDATING
   │
   └──► REJECTED

CONFIRMING
   │
   └──► FAILED

WAITING_TRANSFER
   │
   └──► EXPIRED
```

---

## 2.4 Validações de Depósito

### Validações Gerais

| Validação        | Descrição                      |
| ---------------- | ------------------------------ |
| Usuário ativo    | Conta habilitada               |
| Ativo habilitado | Ativo disponível para depósito |
| Endereço válido  | Formato correto                |
| Rede suportada   | Rede compatível                |
| Valor mínimo     | Acima do mínimo permitido      |
| Transação única  | Evita duplicidade              |
| Compliance       | Regras de segurança            |

---

### Validações Blockchain

| Validação            | Objetivo                         |
| -------------------- | -------------------------------- |
| Hash válido          | Garantir existência da transação |
| Rede correta         | Evitar ativos perdidos           |
| Quantidade correta   | Conferência do valor             |
| Confirmações mínimas | Segurança da liquidação          |
| Endereço de destino  | Validar propriedade              |

---

## 2.5 Confirmações

Cada ativo pode exigir um número mínimo de confirmações.

### Exemplo

| Ativo        | Confirmações |
| ------------ | ------------ |
| BTC          | 3            |
| ETH          | 12           |
| SOL          | 32           |
| USDT (TRC20) | 20           |

---

## 2.6 Limites de Depósito

### Exemplo

| Nível         | Mínimo | Máximo Diário |
| ------------- | ------ | ------------- |
| Básico        | 10 BRL | 10.000 BRL    |
| Intermediário | 10 BRL | 100.000 BRL   |
| Avançado      | 10 BRL | 1.000.000 BRL |

---

## 2.7 Casos de Falha

### Depósito Duplicado

**Descrição**

Mesma transação enviada mais de uma vez.

**Ação**

* Ignorar processamento duplicado.
* Registrar evento de auditoria.

---

### Rede Incorreta

**Exemplo**

Usuário envia USDT ERC20 para endereço TRC20.

**Resultado**

```text
REJECTED
```

---

### Quantidade Abaixo do Mínimo

**Exemplo**

Mínimo permitido:

```text
0,001 BTC
```

Recebido:

```text
0,0001 BTC
```

**Resultado**

* Rejeição automática.
* Registro de inconsistência.

---

### Falha de Monitoramento

**Descrição**

Serviço de monitoramento indisponível.

**Resultado**

```text
FAILED
```

**Tratamento**

* Reprocessamento automático.
* Alertas operacionais.

---

# 3. Saques

## 3.1 Objetivo

Permitir a retirada de ativos da Exchange para sistemas externos.

---

## 3.2 Fluxo de Saque

### Fluxo Simplificado

```text
Usuário
    │
    ▼
Solicita Saque
    │
    ▼
Validações
    │
    ▼
Bloqueio de Saldo
    │
    ▼
Aprovação
    │
    ▼
Processamento
    │
    ▼
Transferência
    │
    ▼
Confirmação
    │
    ▼
Conclusão
```

---

## 3.3 Estados do Saque

| Estado             | Descrição            |
| ------------------ | -------------------- |
| CREATED            | Solicitação criada   |
| PENDING_VALIDATION | Em validação         |
| PENDING_APPROVAL   | Aguardando aprovação |
| APPROVED           | Aprovado             |
| PROCESSING         | Em processamento     |
| SENT               | Enviado              |
| CONFIRMED          | Confirmado           |
| COMPLETED          | Finalizado           |
| REJECTED           | Rejeitado            |
| CANCELLED          | Cancelado            |
| FAILED             | Falha operacional    |

---

### Máquina de Estados

```text
CREATED
   │
   ▼
PENDING_VALIDATION
   │
   ▼
PENDING_APPROVAL
   │
   ▼
APPROVED
   │
   ▼
PROCESSING
   │
   ▼
SENT
   │
   ▼
CONFIRMED
   │
   ▼
COMPLETED
```

Fluxos alternativos:

```text
PENDING_VALIDATION
   │
   └──► REJECTED

PENDING_APPROVAL
   │
   └──► CANCELLED

PROCESSING
   │
   └──► FAILED
```

---

## 3.4 Validações de Saque

### Validações Financeiras

| Validação          | Descrição               |
| ------------------ | ----------------------- |
| Saldo suficiente   | Cobrir valor e taxa     |
| Saldo desbloqueado | Não utilizado em ordens |
| Limite diário      | Dentro do permitido     |
| Limite mensal      | Dentro do permitido     |
| Ativo habilitado   | Saque disponível        |

---

### Validações de Segurança

| Validação             | Objetivo               |
| --------------------- | ---------------------- |
| MFA                   | Autenticação adicional |
| Dispositivo confiável | Mitigação de fraude    |
| E-mail de confirmação | Confirmação do usuário |
| Lista de bloqueio     | Endereços proibidos    |
| Avaliação de risco    | Detecção de anomalias  |

---

### Validações Blockchain

| Validação       | Objetivo               |
| --------------- | ---------------------- |
| Endereço válido | Integridade do destino |
| Rede correta    | Compatibilidade        |
| Valor mínimo    | Evitar poeira (dust)   |
| Taxa disponível | Garantir processamento |

---

## 3.5 Limites de Saque

### Exemplo

| Nível         | Limite Diário |
| ------------- | ------------- |
| Básico        | 5.000 BRL     |
| Intermediário | 50.000 BRL    |
| Avançado      | 500.000 BRL   |

---

## 3.6 Taxas

### Exemplo

| Ativo | Taxa       |
| ----- | ---------- |
| BTC   | 0,0002 BTC |
| ETH   | 0,003 ETH  |
| SOL   | 0,01 SOL   |
| USDT  | 1 USDT     |

---

## 3.7 Bloqueio de Saldo

Após a criação do saque:

```text
Saldo Disponível
      ↓
Saldo Bloqueado
```

Exemplo:

| Tipo                | Valor   |
| ------------------- | ------- |
| Disponível          | 1 BTC   |
| Solicitação         | 0,5 BTC |
| Bloqueado           | 0,5 BTC |
| Disponível Restante | 0,5 BTC |

---

## 3.8 Casos de Falha

### Saldo Insuficiente

**Causa**

Valor solicitado superior ao saldo disponível.

**Resultado**

```text
REJECTED
```

---

### Endereço Inválido

**Causa**

Formato incompatível com a rede.

**Resultado**

```text
REJECTED
```

---

### Falha de Assinatura

**Causa**

Erro na geração da transação.

**Resultado**

```text
FAILED
```

---

### Falha de Broadcast

**Causa**

Transação não aceita pela rede.

**Resultado**

```text
FAILED
```

---

### Expiração da Aprovação

**Causa**

Usuário não confirma o saque.

**Resultado**

```text
CANCELLED
```

---

### Congestionamento de Rede

**Causa**

Rede blockchain indisponível ou congestionada.

**Resultado**

```text
PROCESSING
```

A solicitação permanece em fila até que a rede aceite a transação.

---

# 4. Eventos Auditáveis

Todos os eventos devem gerar registros imutáveis de auditoria.

| Evento                | Auditável |
| --------------------- | --------- |
| Criação de depósito   | Sim       |
| Crédito de depósito   | Sim       |
| Rejeição de depósito  | Sim       |
| Criação de saque      | Sim       |
| Aprovação de saque    | Sim       |
| Cancelamento de saque | Sim       |
| Envio para blockchain | Sim       |
| Conclusão do saque    | Sim       |
| Falha operacional     | Sim       |

---

# 5. Regras Gerais

1. Nenhum depósito pode gerar crédito antes da validação completa.
2. Nenhum saque pode ser processado sem bloqueio prévio do saldo.
3. Toda movimentação deve possuir rastreabilidade completa.
4. Operações devem ser idempotentes.
5. Eventos financeiros devem ser auditáveis.
6. Créditos e débitos devem ser executados de forma transacional.
7. Falhas devem permitir reprocessamento seguro sem duplicidade financeira.
