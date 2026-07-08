# CLAUDE.md — Captação Movida

Plataforma de captação de leads: **vendedores** cadastram clientes; **gestores** veem tudo com busca e CSV.
Stack: **Next.js 15 (App Router) + React 19 + TypeScript**, **Clerk** (auth/papéis), **Supabase/Postgres** (só banco, com RLS), **Database Webhook** encaminha cada lead. Estilo: design tokens "Kinetic Harvest". Tudo em **pt-BR**.

## Comandos
```bash
npm run dev        # desenvolvimento (localhost:3000)
npm run build      # build de produção
npm run typecheck  # tsc --noEmit  (rode após mudanças de tipos)
npm run lint       # ESLint
```

## Regras de ouro (NÃO viole)

1. **Papel vive no claim `app_role`, nunca em `role`.** O claim `role` pertence ao Supabase e vale sempre `authenticated`. No Clerk, o session token tem `{ "app_role": "{{user.public_metadata.role}}" }`. Leia sempre via `roleFromClaims(sessionClaims)` (`src/lib/roles.ts`). Sem papel → default `vendedor` (menor privilégio).
2. **Supabase é APENAS banco.** Quem autentica é o Clerk (third-party auth nativo). O token é injetado via `accessToken`: browser usa `window.Clerk?.session?.getToken()` (`src/lib/supabase.ts`); server usa `auth().getToken()` (`src/lib/supabase-server.ts`).
3. **Segurança é a RLS.** Policies leem `auth.jwt()->>'sub'` (= `vendedor_id`) e `auth.jwt()->>'app_role'`. Toda tabela nova nasce com `enable row level security` + policies. Nunca use `role` para o papel nas policies.
4. **Fluxo do lead (não inverter):** INSERT em `captacoes` (fonte da verdade) → o **Database Webhook** do Supabase dispara o POST ao destino. O frontend **não** chama o webhook.
5. **Segredos só em env**, nunca no código. Veja `.env.example`. URL/segredo do webhook ficam fora do repositório.
6. **Server vs Client:** painel do gestor é SSR; área do vendedor e formulários são `"use client"`. Não troque sem motivo.
7. **Estilo:** use tokens CSS e classes `cm-*` de `src/app/globals.css`. Sem bibliotecas de UI nem cores hardcoded. Mobile-first + acessibilidade (labels, `aria-*`, `role="alert"`/`"status"`).
8. **Validação:** reaproveite `src/lib/validation.ts` (telefone 10/11 dígitos; placa Mercosul `ABC1D23` ou antiga `ABC1234`; máscaras). Não duplique regex.
9. **LGPD:** dados pessoais = nome, telefone, placa (formulário do vendedor) e também CPF/e-mail (só na importação automática do ViaNuvem, `vianuvem-import/`). Minimização, acesso por RLS, sem logar dado pessoal (placa mascarada em log quando necessário). Ver `LGPD.md`.

## Estrutura
- `src/app/` — `layout.tsx` (ClerkProvider), `page.tsx` (redirect por papel), `vendedor/` (client), `gestor/` (server), `sign-in`/`sign-up`.
- `src/components/` — `CapturaForm`, `GestorClient`, `AppHeader`, `Brand`, `AuthCard`.
- `src/lib/` — `supabase.ts`, `supabase-server.ts`, `roles.ts`, `validation.ts`, `format.ts`, `types.ts` (mantenha `Captacao`/`NovaCaptacao` em sincronia com o schema).
- `src/middleware.ts` — auth + autorização por papel.
- `supabase/schema.sql` — tabela `captacoes` + índice + policies RLS.
- `vianuvem-import/` — job standalone (fora do app, próprio `package.json`) que importa leads do ViaNuvem/Unico Auto de hora em hora via cron. Ver `vianuvem-import/README.md`.

## Agentes e skills deste projeto (`.claude/`)
Roteie a tarefa ao especialista, que aciona a skill correspondente:

| Área | Agente | Skills |
|------|--------|--------|
| Auth / Clerk / integração | `auth-integration` | `clerk-supabase-auth` |
| Banco / RLS / webhook | `supabase-db` | `supabase-rls` |
| Front-end / UI / validação | `frontend-ui` | `kinetic-harvest-ui`, `captacao-validation` |
| Privacidade | `lgpd-reviewer` | `lgpd-data-handling` |
| Docker / deploy / produção | `docker-devops` | `docker-nextjs` |

Mudança que toca dado pessoal → sempre passe pelo `lgpd-reviewer`. Mudança de papel/claim → alinhe `auth-integration` + `supabase-db`.

## Deploy (Docker)
Produção via Docker: `Dockerfile` (multi-stage + `output: "standalone"`) + `docker-compose.yml`. Fluxo e o gotcha das `NEXT_PUBLIC_*` (build-time E runtime) estão em `DOCKER.md`. Segredos (`CLERK_SECRET_KEY`) só em runtime, nunca na imagem.

## Notas
- Erro "BaseFetch" do Clerk: veja `debug-clerk-basefetch-error.md`. Causas comuns: chaves erradas no `.env.local`, domínio do Clerk não configurado no provider third-party do Supabase, ou token sem `app_role`.
- Os painéis do Clerk/Supabase mudam com frequência — confirme nos docs oficiais linkados no `README.md`.
