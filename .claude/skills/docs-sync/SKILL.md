---
name: docs-sync
description: >-
  Mapa da documentação viva do projeto e como mantê-la em sincronia com o código: qual
  documento atualizar para cada tipo de mudança (CLAUDE.md, README.md, LGPD.md,
  DOCKER.md, vianuvem-import/README.md, doc/documentacao-tecnica.html) e as convenções
  do histórico técnico em HTML (seções numeradas, TOC, badges de status, checagem de
  balanceamento de tags). Use ao concluir qualquer mudança relevante, ao auditar se a
  documentação está atualizada, ou ao adicionar seção no documentacao-tecnica.html.
---

# Sincronia de documentação

Este projeto tem cultura de documentação forte: **mudança relevante sem doc atualizada = tarefa incompleta**. Atualize a doc no mesmo commit da mudança.

## Qual documento atualizar (por tipo de mudança)
| Mudança | Documentos |
|---------|-----------|
| Regra de arquitetura, novo arquivo importante, novo agente/skill | `CLAUDE.md` (regras de ouro / Estrutura / tabela de agentes) |
| Schema, webhook, payload, fluxo do lead, setup | `README.md` (+ bloco de migração no fim de `supabase/schema.sql`) |
| Qualquer dado pessoal: campo, destino, acesso, log, retenção | `LGPD.md` (inventário seção 2; destinos seção 7; logs 8; retenção 9) |
| Deploy, Dockerfile, compose, variáveis de produção | `DOCKER.md` |
| Job de importação (código, cron, env, gotcha novo) | `vianuvem-import/README.md` (inclusive a lista "Problemas reais") |
| História: feature entregue, bug real de produção + correção, auditoria | `doc/documentacao-tecnica.html` (nova seção ou item) |
| Gotcha de trabalho pro Claude (receita, armadilha) | A skill correspondente em `.claude/skills/` |

## Convenções do `doc/documentacao-tecnica.html`
É o histórico técnico detalhado (o que foi construído, becos sem saída, bugs reais). Arquivo grande — **não leia inteiro**: localize por `grep` o id da seção ou o TOC.
- Estrutura: `<nav class="toc">` com `<ol>` de links → `<section id="kebab-case">` numeradas em sequência (hoje 18: `visao-geral`, `login`, `vendedor`, `sheets`, `infra`, `vianuvem`, `deploy`, `bugs`, `lgpd`, `auditoria`, `pendencias`, `referencias`, `autocadastro`, `canal-reivindicacao`, `sheets-update`, `bugs2`, `auditoria2`, `agentes-skills`).
- Seção nova = adicionar o `<section id="...">` **e** a entrada correspondente no TOC, com o próximo número da sequência.
- Badges de status em tabelas: `<span class="status ok">` e `<span class="status corrigido">` (siga as classes existentes; não invente cor inline).
- Pendências vivem na seção `pendencias` (lista `<li>`); quando resolver uma, remova o item e ajuste a linha da tabela de auditoria para `status corrigido`.
- **Sempre valide o balanceamento de tags após editar** (o arquivo já quebrou por tag solta):
```bash
python3 -c "
import re
h=open('doc/documentacao-tecnica.html').read()
for t in ('section','div','li'):
    print(t, len(re.findall(f'<{t}[ >]',h)), len(re.findall(f'</{t}>',h)))
"
```
Os pares abertos/fechados devem bater (li pode divergir se houver li implícito — confira manualmente nesse caso).

## Checklist de auditoria ("está tudo documentado?")
1. `git log` / diff recente → liste as mudanças de comportamento.
2. Para cada uma, confira a linha da tabela acima.
3. Confira também: `CLAUDE.md` seção Estrutura cita arquivos que ainda existem? Os agentes/skills de `.claude/` citam paths/funções que ainda existem? (`grep` pelos nomes).
4. Registre achados e correções numa seção de auditoria do `documentacao-tecnica.html`.
