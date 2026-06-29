# Cenários BDD - Exchange Spot Educacional

## Usuários

### Cenário 01 - Cadastro de usuário com sucesso

**Dado** que o visitante não possui cadastro na plataforma
**Quando** informar nome, e-mail e senha válidos
**Então** o usuário deve ser criado com status ativo

---

### Cenário 02 - Cadastro com e-mail já utilizado

**Dado** que existe um usuário cadastrado com determinado e-mail
**Quando** um novo cadastro utilizar o mesmo e-mail
**Então** o sistema deve rejeitar o cadastro

---

### Cenário 03 - Login com credenciais válidas

**Dado** que o usuário possui cadastro ativo
**Quando** informar e-mail e senha corretos
**Então** o sistema deve autenticar o usuário

---

### Cenário 04 - Login com senha inválida

**Dado** que o usuário está cadastrado
**Quando** informar senha incorreta
**Então** o acesso deve ser negado

---

### Cenário 05 - Recuperação de senha

**Dado** que o usuário esqueceu sua senha
**Quando** solicitar recuperação de acesso
**Então** o sistema deve gerar processo de redefinição

---

### Cenário 06 - Atualização de perfil

**Dado** que o usuário está autenticado
**Quando** alterar seus dados cadastrais permitidos
**Então** o sistema deve salvar as alterações

---

### Cenário 07 - Consulta de perfil

**Dado** que o usuário está autenticado
**Quando** acessar sua área de perfil
**Então** os dados cadastrados devem ser exibidos

---

### Cenário 08 - Bloqueio de usuário

**Dado** que um usuário foi bloqueado pela administração
**Quando** tentar realizar login
**Então** o acesso deve ser recusado

---

## Wallets

### Cenário 09 - Criação automática de wallet

**Dado** que um usuário foi criado
**Quando** o cadastro for concluído
**Então** as wallets dos ativos suportados devem ser criadas

---

### Cenário 10 - Consulta de saldo

**Dado** que o usuário possui ativos em carteira
**Quando** consultar sua wallet
**Então** os saldos devem ser exibidos

---

### Cenário 11 - Saldo inicial zerado

**Dado** que uma wallet foi criada
**Quando** nenhum depósito tiver ocorrido
**Então** o saldo deve ser zero

---

### Cenário 12 - Exibição de saldo disponível

**Dado** que o usuário possui saldo livre
**Quando** consultar a wallet
**Então** o saldo disponível deve ser apresentado

---

### Cenário 13 - Exibição de saldo bloqueado

**Dado** que existe uma ordem aberta
**Quando** consultar a wallet
**Então** o saldo bloqueado deve ser exibido

---

### Cenário 14 - Liberação de saldo após cancelamento

**Dado** que existe saldo bloqueado por uma ordem
**Quando** a ordem for cancelada
**Então** o saldo deve retornar para disponível

---

### Cenário 15 - Histórico de movimentações

**Dado** que ocorreram operações financeiras
**Quando** o usuário consultar movimentações
**Então** o histórico deve ser exibido

---

## Depósitos

### Cenário 16 - Depósito em BRL

**Dado** que o usuário possui wallet BRL
**Quando** um depósito for confirmado
**Então** o saldo deve ser creditado

---

### Cenário 17 - Depósito em BTC

**Dado** que o usuário possui wallet BTC
**Quando** um depósito for confirmado
**Então** o saldo BTC deve ser atualizado

---

### Cenário 18 - Depósito pendente

**Dado** que o depósito foi solicitado
**Quando** ainda não houver confirmação
**Então** o valor não deve ser disponibilizado

---

### Cenário 19 - Consulta de depósito

**Dado** que existe um depósito registrado
**Quando** o usuário consultar seu histórico
**Então** o depósito deve ser exibido

---

### Cenário 20 - Depósito rejeitado

**Dado** que um depósito foi invalidado
**Quando** o processamento for concluído
**Então** nenhum saldo deve ser creditado

---

### Cenário 21 - Múltiplos depósitos

**Dado** que o usuário realizou diversos depósitos
**Quando** consultar o saldo
**Então** o valor acumulado deve ser exibido

---

## Saques

### Cenário 22 - Saque de BRL com saldo suficiente

**Dado** que o usuário possui saldo disponível
**Quando** solicitar saque dentro do limite disponível
**Então** a solicitação deve ser criada

---

### Cenário 23 - Saque com saldo insuficiente

**Dado** que o saldo disponível é menor que o valor solicitado
**Quando** solicitar saque
**Então** o saque deve ser rejeitado

---

### Cenário 24 - Saque de BTC

**Dado** que existe saldo BTC disponível
**Quando** solicitar saque de BTC
**Então** o valor deve ser bloqueado para processamento

---

### Cenário 25 - Cancelamento de saque pendente

**Dado** que existe saque pendente
**Quando** o saque for cancelado
**Então** o saldo deve retornar para disponível

---

### Cenário 26 - Consulta de saque

**Dado** que existe saque registrado
**Quando** o usuário consultar movimentações
**Então** o saque deve ser exibido

---

### Cenário 27 - Saque processado

**Dado** que o saque foi aprovado
**Quando** o processamento finalizar
**Então** o status deve ser atualizado para concluído

---

### Cenário 28 - Saque rejeitado

**Dado** que o saque foi recusado
**Quando** a análise terminar
**Então** o saldo deve ser devolvido

---

## Ordens

### Cenário 29 - Criação de ordem de compra limitada

**Dado** que o usuário possui saldo suficiente
**Quando** criar uma ordem limitada de compra
**Então** a ordem deve ser registrada

---

### Cenário 30 - Criação de ordem de venda limitada

**Dado** que o usuário possui o ativo necessário
**Quando** criar uma ordem limitada de venda
**Então** a ordem deve ser registrada

---

### Cenário 31 - Criação de ordem a mercado de compra

**Dado** que existe liquidez disponível
**Quando** criar uma ordem de compra a mercado
**Então** ela deve ser enviada para execução

---

### Cenário 32 - Criação de ordem a mercado de venda

**Dado** que existe liquidez disponível
**Quando** criar uma ordem de venda a mercado
**Então** ela deve ser enviada para execução

---

### Cenário 33 - Ordem com saldo insuficiente

**Dado** que o usuário não possui saldo suficiente
**Quando** criar uma ordem
**Então** a ordem deve ser rejeitada

---

### Cenário 34 - Ordem com quantidade inválida

**Dado** que a quantidade informada é inválida
**Quando** enviar a ordem
**Então** a ordem deve ser rejeitada

---

### Cenário 35 - Ordem com preço inválido

**Dado** que o preço informado é inválido
**Quando** enviar a ordem
**Então** a ordem deve ser rejeitada

---

### Cenário 36 - Cancelamento de ordem aberta

**Dado** que existe uma ordem aberta
**Quando** o usuário solicitar cancelamento
**Então** a ordem deve ser cancelada

---

### Cenário 37 - Consulta de ordens abertas

**Dado** que existem ordens abertas
**Quando** o usuário consultar suas ordens
**Então** todas as ordens abertas devem ser exibidas

---

### Cenário 38 - Consulta de histórico de ordens

**Dado** que existem ordens encerradas
**Quando** o usuário consultar o histórico
**Então** as ordens encerradas devem ser exibidas

---

## Matching Engine

### Cenário 39 - Match completo

**Dado** que existe uma ordem de compra compatível
**E** existe uma ordem de venda compatível
**Quando** o matching engine processar o livro
**Então** as ordens devem ser executadas integralmente

---

### Cenário 40 - Match parcial da compra

**Dado** que a quantidade da compra é maior que a venda
**Quando** ocorrer o casamento
**Então** parte da ordem de compra deve permanecer aberta

---

### Cenário 41 - Match parcial da venda

**Dado** que a quantidade da venda é maior que a compra
**Quando** ocorrer o casamento
**Então** parte da ordem de venda deve permanecer aberta

---

### Cenário 42 - Sem contraparte

**Dado** que não existe ordem compatível
**Quando** a ordem for criada
**Então** ela deve permanecer no book

---

### Cenário 43 - Prioridade por preço

**Dado** que existem múltiplas ofertas
**Quando** o matching ocorrer
**Então** a melhor oferta de preço deve ser executada primeiro

---

### Cenário 44 - Prioridade temporal

**Dado** que existem ofertas com o mesmo preço
**Quando** o matching ocorrer
**Então** a ordem mais antiga deve possuir prioridade

---

### Cenário 45 - Atualização do book após execução

**Dado** que uma ordem foi executada
**Quando** o trade for concluído
**Então** o order book deve ser atualizado

---

### Cenário 46 - Remoção de ordem totalmente executada

**Dado** que uma ordem foi executada integralmente
**Quando** o matching finalizar
**Então** ela deve ser removida do book

---

## Trades

### Cenário 47 - Geração de trade

**Dado** que ocorreu um match
**Quando** a execução for concluída
**Então** um trade deve ser registrado

---

### Cenário 48 - Atualização de saldos após trade

**Dado** que um trade foi executado
**Quando** a liquidação ocorrer
**Então** os saldos das partes devem ser atualizados

---

### Cenário 49 - Registro do preço executado

**Dado** que um trade ocorreu
**Quando** o registro for criado
**Então** o preço executado deve ser armazenado

---

### Cenário 50 - Registro da quantidade executada

**Dado** que um trade ocorreu
**Quando** o registro for criado
**Então** a quantidade negociada deve ser armazenada

---

### Cenário 51 - Atualização do último preço

**Dado** que um novo trade foi executado
**Quando** o ticker for atualizado
**Então** o último preço negociado deve refletir o trade

---

### Cenário 52 - Atualização do volume negociado

**Dado** que ocorreu uma execução
**Quando** o trade for registrado
**Então** o volume do período deve ser atualizado

---

### Cenário 53 - Histórico de trades do usuário

**Dado** que o usuário realizou negociações
**Quando** consultar o histórico
**Então** seus trades devem ser exibidos

---

### Cenário 54 - Histórico público de mercado

**Dado** que trades ocorreram no mercado
**Quando** consultar negociações recentes
**Então** os trades públicos devem ser exibidos

---

### Cenário 55 - Cobrança de taxa do trade

**Dado** que a exchange possui taxa configurada
**Quando** um trade for executado
**Então** a taxa deve ser calculada e aplicada

---

### Cenário 56 - Liquidação de trade parcial

**Dado** que ocorreu execução parcial
**Quando** o trade for registrado
**Então** somente a quantidade executada deve ser liquidada

---

### Cenário 57 - Múltiplos trades para uma ordem

**Dado** que uma ordem grande encontra várias contrapartes
**Quando** o matching ocorrer
**Então** múltiplos trades devem ser gerados

---

### Cenário 58 - Atualização de status da ordem após execução total

**Dado** que a ordem foi totalmente executada
**Quando** a liquidação terminar
**Então** a ordem deve ser marcada como preenchida

---

### Cenário 59 - Atualização de status da ordem após execução parcial

**Dado** que apenas parte da ordem foi executada
**Quando** a liquidação terminar
**Então** a ordem deve permanecer parcialmente preenchida

---

### Cenário 60 - Consistência financeira da liquidação

**Dado** que um trade foi executado
**Quando** a liquidação ocorrer
**Então** a soma dos débitos e créditos deve permanecer consistente
