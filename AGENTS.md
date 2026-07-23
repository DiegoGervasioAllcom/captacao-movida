# AGENTS.md — Captação Movida

Este é o arquivo de contexto nativo do Codex para este repositório.

## Fonte de verdade do projeto

Antes de analisar, alterar ou revisar o projeto, leia `CLAUDE.md` completamente. Ele contém:

- arquitetura e stack;
- comandos de desenvolvimento e validação;
- regras de segurança, autenticação, RLS, LGPD e webhook;
- fluxo de captação e reivindicação de leads;
- estrutura atual do repositório;
- matriz dos especialistas e workflows do projeto.

As regras de `CLAUDE.md` são obrigatórias também no Codex. Em caso de divergência entre este
arquivo e `CLAUDE.md`, prevalece a regra mais específica e mais segura.

## Skills do Codex

As skills nativas deste projeto ficam em `.agents/skills/`:

- `captacao-validation`
- `clerk-supabase-auth`
- `docker-nextjs`
- `docs-sync`
- `kinetic-harvest-ui`
- `lgpd-data-handling`
- `sheets-webhook`
- `supabase-rls`
- `vianuvem-import-job`

Use uma skill quando a tarefa corresponder à descrição dela. Leia o `SKILL.md` completamente
antes de agir e siga as referências indicadas nele.

## Agentes especializados do Codex

Os agentes nativos ficam em `.codex/agents/`:

- `auth-integration`
- `docker-devops`
- `frontend-ui`
- `lgpd-reviewer`
- `supabase-db`
- `vianuvem-importer`

Use esses agentes quando o usuário pedir delegação, subagentes ou trabalho paralelo, ou quando
uma instrução aplicável exigir explicitamente um especialista. Não delegue apenas por rotina.

## Compatibilidade Claude ↔ Codex

O conteúdo original continua em `.claude/`. Ao atualizar uma regra, agente ou skill:

1. mantenha o equivalente de `.claude/` e do Codex em sincronia;
2. atualize `CLAUDE.md` e `AGENTS.md` quando a mudança afetar instruções persistentes;
3. aplique a skill `docs-sync` em mudanças relevantes;
4. não remova os arquivos de uma plataforma ao atualizar a outra.

## Validação mínima

Após mudanças de código, execute os comandos aplicáveis descritos em `CLAUDE.md`, normalmente:

```bash
npm run typecheck
npm run lint
npm run build
```

Preserve alterações não relacionadas que já estejam no worktree.
