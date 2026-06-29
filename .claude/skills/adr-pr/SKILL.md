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

**Corpo:**
```markdown
## Contexto
<resumo do Contexto do ADR>

## O que muda
<Plano de Implementação resumido — arquivos criados/alterados>

## Bounded contexts afetados
<tabela do ADR>

## Testes
<itens do Plano de Teste cobertos>

## Checklist de arquitetura
- [ ] Regra de Dependência respeitada (grep vazio em domain/ e application/)
- [ ] Valores monetários em `bigint` / `BIGINT`
- [ ] Erros tipados como subclasses de `DomainError`
- [ ] Operações multi-tabela com `UnitOfWork`

## ADR
docs/adr/<arquivo>.md — Decisões do usuário registradas no ADR.

🤖 Gerado com [Claude Code](https://claude.com/claude-code)
```

## Passo 2 — Confirmar e abrir (gate outward-facing)

1. Mostre ao usuário: título, corpo e branch do PR.
2. **AskUserQuestion:** "Abrir o PR no GitHub agora?" (opções: Abrir / Só mostrar os comandos / Cancelar). Só prossiga com "Abrir".
3. Se não há commits ainda (o executor para antes do commit), peça ao usuário para commitar antes:
   ```bash
   git add <arquivos específicos>
   git commit -m "feat(<contexto>): <resumo> (ADR-NNNN)"
   ```
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
