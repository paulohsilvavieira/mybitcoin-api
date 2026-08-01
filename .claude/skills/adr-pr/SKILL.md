---
name: adr-pr
description: Gate final + abertura de PR (estágio 5 do pipeline). Skill MANUAL — invoque DEPOIS que o /adr-reviewer deu APROVA e o humano aprovou o diff. Gatilhos válidos — (1) slash command /adr-pr; (2) usuário pede "abrir o PR", "finalizar o ADR", "subir o PR". Compõe título e corpo do PR a partir do ADR e abre o PR. PEDE CONFIRMAÇÃO antes de abrir (ação irreversível). NÃO invocar automaticamente.
---

# ADR PR — mybitcoin-api (gate final + PR)

Você abre o PR da implementação com corpo derivado do ADR. É a única etapa que toca o GitHub — por isso **confirma antes de abrir**.

## Regras de ouro

1. **pt-BR** no veredito. **Nunca use sub-agentes / Task tool.**
2. **Confirme antes de abrir** — PR é outward-facing. Nunca abra sem o "sim" explícito do usuário.
3. **Só com tudo aprovado:** ADR `Status: Aceito` + Validação APROVA + Reviewer APROVA. Se não tiver certeza, **pergunte** antes de seguir.
4. Não faça merge. PR fica para revisão/aprovação humana no GitHub.

---

## Passo 0 — Preflight

1. **ADR de `$ARGUMENTS`**. Leia: Contexto, Decisão, Plano de Implementação, Plano de Teste, Decisões do Usuário.
2. **Confirme os gates com o usuário:** "O `/adr-reviewer` deu APROVA?" Se não → PARE.
3. Verifique o branch atual e os commits desde `main`:
   ```bash
   git status
   git log main...HEAD --oneline
   git diff main...HEAD --stat
   ```

## Passo 1 — Preparar o PR (sem abrir ainda)

**Título:** `<tipo>(<contexto>): <resumo da decisão> (ADR-NNNN)`

Exemplos:
- `feat(financial): ledger com double-entry bookkeeping (ADR-0003)`
- `feat(account): schema de identidade e KYC (ADR-0002)`
- `refactor(database): padrão de transações atômicas (ADR-0001)`

**Corpo — sempre baseado em `.github/pull_request_template.md`.** Leia esse arquivo no início deste passo (não assuma a estrutura de memória — o template pode mudar) e preencha cada seção dele com o conteúdo do ADR. Não invente seções novas nem pule as existentes; se uma seção do template não se aplica (ex: "Link do Card" sem Jira neste projeto), preencha com `N/A` em vez de remover.

Mapeamento ADR → template (ajuste aos nomes reais das seções do arquivo lido):
- **Título** (`# [TÍTULO DA TAREFA FEITA]`) → `<tipo>(<contexto>): <resumo da decisão> (ADR-NNNN)`, igual ao título do PR.
- **Descrição da Tarefa** → resumo do Contexto + Decisão do ADR, e o que foi implementado (Plano de Implementação resumido — arquivos criados/alterados, bounded contexts afetados).
- **Tipo da Tarefa** → marque `[x]` no(s) tipo(s) certo(s) (Feature/Refactor/etc.) a partir da natureza do ADR.
- **Link do Card** → `N/A` se não houver Jira/card vinculado.
- **Evidências dos Testes** → marque os itens que rodaram de fato (unitários, integração, manual) com base no Plano de Teste do ADR e no que o `/adr-reviewer` confirmou; não marque o que não foi executado.
- **Considerações Importantes** → checklist de arquitetura (Regra de Dependência, bigint, erros tipados, UnitOfWork) + passos de ops do ADR (migration a rodar, env vars novas, dependências novas) + link para `docs/adr/<arquivo>.md`.

Feche o corpo com a mesma assinatura de sempre:
```
🤖 Gerado com [Claude Code](https://claude.com/claude-code)
```

## Passo 2 — Confirmar e abrir (gate outward-facing)

1. Mostre ao usuário: título, corpo e branch do PR.
2. **AskUserQuestion:** "Abrir o PR no GitHub agora?" (opções: Abrir / Só mostrar os comandos / Cancelar). Só prossiga com "Abrir".
3. Se não há commits ainda (o executor para antes do commit), commite você mesmo antes de abrir o PR, seguindo estas duas regras fixas para este projeto:
   - **Múltiplos commits agrupados por contexto** — nunca um commit único "catch-all". Agrupe por camada/responsabilidade (ex: domínio, aplicação/use cases, infraestrutura de persistência, infraestrutura compartilhada, presentation/wiring, docs, fixes fora do escopo do ADR). Cada commit deve ser compreensível isoladamente — a mensagem explica o que aquele grupo de arquivos faz, não "parte N de M".
   - **Nunca inclua trailer `Co-Authored-By`** nestes commits — diferente do padrão default do Claude Code, aqui essa assinatura foi explicitamente removida a pedido do usuário.

   Exemplo de sequência (não literal — adapte aos arquivos reais do diff):
   ```bash
   git add src/modules/<ctx>/domain/
   git commit -m "feat(<ctx>): <resumo do domínio> (ADR-NNNN)"

   git add src/modules/<ctx>/application/
   git commit -m "feat(<ctx>): <resumo dos use cases> (ADR-NNNN)"

   git add src/modules/<ctx>/infrastructure/
   git commit -m "feat(<ctx>): <resumo da persistência> (ADR-NNNN)"
   ```

   Rode a suíte de testes (`pnpm test`, com banco real de pé se o diff tiver teste de integração) antes de cada commit — o hook de pre-commit já bloqueia commits com testes vermelhos, mas é mais rápido saber antes de tentar.
4. Abra o PR:
   ```bash
   git push -u origin <branch>
   gh pr create --base main --title "<título>" --body "$(cat <<'EOF'
   <corpo>
   EOF
   )"
   ```

## Passo 3 — Atualizar o ADR

Após o PR aberto, atualize o status do ADR:
```markdown
**Status:** Em Progresso
**PR:** <url do PR>
```

## Passo 4 — Reportar

- URL do PR aberto.
- Lembre os **próximos passos de ops** que o ADR especifica (ex: rodar migration, configurar env vars).
- **Próximo passo:** revisão humana no GitHub → merge → deploy → atualizar ADR para `Implementado`.

---

## Limitações
- Requer `gh` autenticado e push permission. Se não tiver, mostre os comandos para o usuário rodar.
- Você não faz merge nem deploy. O pipeline termina aqui.
- Após o merge, atualize o ADR para `Status: Implementado` manualmente.
