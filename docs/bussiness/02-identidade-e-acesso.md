# Funcionalidades de Identidade e Acesso

---

# 1. Cadastro

## Objetivo

Permitir que um novo usuário crie uma conta na plataforma para acessar funcionalidades da exchange.

---

## Regras

| ID      | Regra                                                                  |
| ------- | ---------------------------------------------------------------------- |
| CAD-001 | O e-mail deve ser único na plataforma.                                 |
| CAD-002 | O e-mail deve possuir formato válido.                                  |
| CAD-003 | A senha deve atender aos requisitos mínimos de segurança.              |
| CAD-004 | O usuário deve aceitar os Termos de Uso e Política de Privacidade.     |
| CAD-005 | A conta é criada inicialmente com status `PENDING_EMAIL_VERIFICATION`. |
| CAD-006 | O sistema deve registrar data e IP do cadastro.                        |
| CAD-007 | Não é permitido cadastro duplicado para o mesmo e-mail.                |

### Política de Senha

* Mínimo de 8 caracteres.
* Pelo menos:

  * 1 letra maiúscula.
  * 1 letra minúscula.
  * 1 número.
  * 1 caractere especial.

---

## Fluxo Principal

```text
Usuário informa:
- Nome
- E-mail
- Senha

→ Sistema valida dados
→ Sistema cria conta
→ Sistema envia e-mail de verificação
→ Conta criada com status pendente
```

---

## Edge Cases

| Cenário                          | Comportamento                     |
| -------------------------------- | --------------------------------- |
| E-mail já cadastrado             | Retornar erro de duplicidade      |
| Senha fraca                      | Rejeitar cadastro                 |
| E-mail inválido                  | Rejeitar cadastro                 |
| Falha no envio do e-mail         | Conta criada e reenvio disponível |
| Múltiplas tentativas simultâneas | Garantir unicidade por transação  |

---

## Critérios de Aceite

### CA-CAD-01

**Dado** um e-mail válido não cadastrado

**Quando** o usuário concluir o cadastro

**Então** uma nova conta deve ser criada.

---

### CA-CAD-02

**Dado** um e-mail já existente

**Quando** o usuário tentar cadastrar

**Então** o sistema deve impedir a operação.

---

### CA-CAD-03

**Dado** um cadastro realizado

**Quando** a conta for criada

**Então** um e-mail de verificação deve ser enviado.

---

# 2. Login

## Objetivo

Autenticar usuários previamente cadastrados.

---

## Regras

| ID      | Regra                                                              |
| ------- | ------------------------------------------------------------------ |
| LOG-001 | Apenas contas ativas podem autenticar.                             |
| LOG-002 | E-mail deve estar verificado.                                      |
| LOG-003 | Credenciais inválidas não devem revelar qual campo está incorreto. |
| LOG-004 | MFA deve ser exigido quando habilitado.                            |
| LOG-005 | Todas as tentativas devem ser auditadas.                           |
| LOG-006 | Bloqueio temporário após excesso de falhas.                        |

---

## Fluxo Principal

```text
Usuário informa:
- E-mail
- Senha

→ Validação de credenciais
→ Verificação MFA (se habilitado)
→ Criação da sessão
→ Login concluído
```

---

## Edge Cases

| Cenário               | Comportamento      |
| --------------------- | ------------------ |
| Senha incorreta       | Negar acesso       |
| E-mail não verificado | Impedir login      |
| Conta bloqueada       | Impedir login      |
| MFA inválido          | Negar autenticação |
| Usuário excluído      | Negar autenticação |

---

## Critérios de Aceite

### CA-LOG-01

Credenciais válidas devem permitir acesso.

### CA-LOG-02

Credenciais inválidas devem gerar erro genérico.

### CA-LOG-03

Contas sem verificação de e-mail não devem acessar o sistema.

---

# 3. Logout

## Objetivo

Encerrar uma sessão autenticada.

---

## Regras

| ID      | Regra                                        |
| ------- | -------------------------------------------- |
| OUT-001 | Logout invalida a sessão atual.              |
| OUT-002 | Logout global invalida todas as sessões.     |
| OUT-003 | Tokens revogados não podem ser reutilizados. |

---

## Fluxo Principal

```text
Usuário seleciona Logout
→ Sessão invalidada
→ Tokens revogados
→ Redirecionamento para Login
```

---

## Edge Cases

| Cenário            | Comportamento                |
| ------------------ | ---------------------------- |
| Sessão já expirada | Retornar sucesso idempotente |
| Logout duplicado   | Não gerar erro               |
| Token inválido     | Ignorar operação             |

---

## Critérios de Aceite

### CA-OUT-01

Logout deve invalidar imediatamente a sessão.

### CA-OUT-02

Usuário não deve acessar recursos protegidos após logout.

---

# 4. Recuperação de Senha

## Objetivo

Permitir redefinição segura de senha.

---

## Regras

| ID      | Regra                                                    |
| ------- | -------------------------------------------------------- |
| REC-001 | Solicitação baseada em e-mail.                           |
| REC-002 | Token único e temporário.                                |
| REC-003 | Token possui expiração.                                  |
| REC-004 | Token pode ser utilizado apenas uma vez.                 |
| REC-005 | Nova senha deve respeitar política de senha.             |
| REC-006 | Sessões existentes devem ser revogadas após redefinição. |

---

## Fluxo Principal

```text
Usuário solicita recuperação

→ Sistema gera token
→ Sistema envia e-mail
→ Usuário acessa link
→ Informa nova senha
→ Senha atualizada
→ Sessões revogadas
```

---

## Edge Cases

| Cenário                | Comportamento            |
| ---------------------- | ------------------------ |
| Token expirado         | Rejeitar operação        |
| Token reutilizado      | Rejeitar operação        |
| E-mail inexistente     | Retornar resposta neutra |
| Senha igual à anterior | Opcionalmente bloquear   |

---

## Critérios de Aceite

### CA-REC-01

Token válido deve permitir redefinição.

### CA-REC-02

Token expirado deve ser recusado.

### CA-REC-03

Após redefinição todas as sessões devem ser encerradas.

---

# 5. Sessões

## Objetivo

Controlar sessões autenticadas dos usuários.

---

## Regras

| ID      | Regra                                           |
| ------- | ----------------------------------------------- |
| SES-001 | Cada login gera uma nova sessão.                |
| SES-002 | Sessões possuem expiração.                      |
| SES-003 | Sessões inativas podem expirar antecipadamente. |
| SES-004 | Sessões devem registrar dispositivo e IP.       |
| SES-005 | Usuário pode visualizar sessões ativas.         |

---

## Fluxo Principal

```text
Login
→ Criação da sessão
→ Uso normal da plataforma
→ Renovação automática
→ Expiração ou Logout
```

---

## Edge Cases

| Cenário                    | Comportamento                |
| -------------------------- | ---------------------------- |
| Expiração durante operação | Solicitar novo login         |
| Múltiplos dispositivos     | Permitir sessões paralelas   |
| Sessão comprometida        | Permitir encerramento remoto |

---

## Critérios de Aceite

### CA-SES-01

Sessão válida deve acessar recursos protegidos.

### CA-SES-02

Sessão expirada deve exigir autenticação.

### CA-SES-03

Usuário deve visualizar sessões ativas.

---

# 6. Verificação de E-mail

## Objetivo

Confirmar que o endereço de e-mail pertence ao usuário.

---

## Regras

| ID      | Regra                                     |
| ------- | ----------------------------------------- |
| VER-001 | Token único por solicitação.              |
| VER-002 | Token deve expirar.                       |
| VER-003 | Conta permanece pendente até confirmação. |
| VER-004 | Reenvio de e-mail deve ser permitido.     |

---

## Fluxo Principal

```text
Cadastro
→ Geração de token
→ Envio de e-mail
→ Clique no link
→ Validação
→ Conta ativada
```

---

## Edge Cases

| Cenário             | Comportamento        |
| ------------------- | -------------------- |
| Token expirado      | Solicitar novo envio |
| Token inválido      | Rejeitar validação   |
| Conta já verificada | Retornar sucesso     |

---

## Critérios de Aceite

### CA-VER-01

Usuário deve conseguir validar o e-mail.

### CA-VER-02

Conta validada deve mudar para status ativo.

---

# 7. KYC Básico

## Objetivo

Identificar minimamente o usuário para utilização da plataforma.

---

## Regras

| ID      | Regra                                                  |
| ------- | ------------------------------------------------------ |
| KYC-001 | KYC é obrigatório para desbloqueio de funcionalidades. |
| KYC-002 | Nome completo deve ser informado.                      |
| KYC-003 | CPF deve ser válido.                                   |
| KYC-004 | Data de nascimento deve ser válida.                    |
| KYC-005 | Usuário deve ser maior de idade (configurável).        |
| KYC-006 | Dados submetidos devem ser auditados.                  |

---

## Dados Coletados

| Campo              |
| ------------------ |
| Nome Completo      |
| CPF                |
| Data de Nascimento |
| Nacionalidade      |

---

## Fluxo Principal

```text
Usuário acessa KYC
→ Preenche dados
→ Sistema valida
→ Aprovação automática
→ Status KYC atualizado
```

---

## Edge Cases

| Cenário           | Comportamento             |
| ----------------- | ------------------------- |
| CPF inválido      | Rejeitar envio            |
| Menor de idade    | Rejeitar aprovação        |
| Dados incompletos | Rejeitar envio            |
| CPF duplicado     | Sinalizar possível fraude |

---

## Critérios de Aceite

### CA-KYC-01

CPF válido deve ser aceito.

### CA-KYC-02

Dados completos devem permitir aprovação.

### CA-KYC-03

Dados inválidos devem impedir aprovação.

---

# 8. MFA / 2FA

## Objetivo

Adicionar uma camada extra de segurança ao processo de autenticação.

---

## Regras

| ID      | Regra                                     |
| ------- | ----------------------------------------- |
| MFA-001 | MFA é opcional para ambiente educacional. |
| MFA-002 | Suporte a aplicativos TOTP.               |
| MFA-003 | Códigos de recuperação devem ser gerados. |
| MFA-004 | Alterações críticas podem exigir MFA.     |
| MFA-005 | MFA deve ser validado após senha correta. |

---

## Fluxo Principal

```text
Usuário habilita MFA

→ Geração de segredo TOTP
→ Exibição do QR Code
→ Confirmação do código
→ MFA habilitado

Login

→ E-mail
→ Senha
→ Código MFA
→ Acesso liberado
```

---

## Edge Cases

| Cenário                   | Comportamento          |
| ------------------------- | ---------------------- |
| Código expirado           | Solicitar novo código  |
| Código inválido           | Negar acesso           |
| Perda do dispositivo      | Utilizar recovery code |
| Recovery code reutilizado | Rejeitar uso           |

---

## Critérios de Aceite

### CA-MFA-01

Código TOTP válido deve autenticar.

### CA-MFA-02

Código inválido deve impedir acesso.

### CA-MFA-03

Recovery code válido deve permitir recuperação.

### CA-MFA-04

Recovery code utilizado deve ser invalidado.
