# CLAUDE.md — Captação Movida

Plataforma de captação de leads: **vendedores** cadastram clientes; **gestores** veem tudo com busca e CSV.
Stack: **Next.js 15 (App Router) + React 19 + TypeScript**, **Clerk** (auth/papéis), **Supabase/Postgres** (só banco, com RLS), **Database Webhook** encaminha cada lead. Estilo: design tokens "Kinetic Harvest". Tudo em **pt-BR**.

## Comandos
```bash
npm run dev        # desenvolvimento (localhost:3000)
npm run build      # build de produção
npm run typecheck  # tsc --noEmit  (rode após mudanças de tipos)
npm run lint       # ESLint
npm run usuarios-por-loja  # relatório: quantos vendedores por loja + nomes (lê o Clerk; gera CSV)
```

## Regras de ouro (NÃO viole)

1. **Papel vive no claim `app_role`, nunca em `role`.** O claim `role` pertence ao Supabase e vale sempre `authenticated`. No Clerk, o session token tem `{ "app_role": "{{user.public_metadata.role}}" }`. Leia sempre via `roleFromClaims(sessionClaims)` (`src/lib/roles.ts`). Sem papel → default `vendedor` (menor privilégio).
2. **Supabase é APENAS banco.** Quem autentica é o Clerk (third-party auth nativo). O token é injetado via `accessToken`: browser usa `window.Clerk?.session?.getToken()` (`src/lib/supabase.ts`); server usa `auth().getToken()` (`src/lib/supabase-server.ts`).
3. **Segurança é a RLS.** Policies leem `auth.jwt()->>'sub'` (= `vendedor_id`) e `auth.jwt()->>'app_role'`. Toda tabela nova nasce com `enable row level security` + policies. Nunca use `role` para o papel nas policies.
4. **Fluxo do lead (não inverter):** INSERT em `captacoes` (fonte da verdade) → o **Database Webhook** do Supabase dispara o POST ao destino. O frontend **não** chama o webhook.
5. **Segredos só em env**, nunca no código. Veja `.env.example`. URL/segredo do webhook ficam fora do repositório.
6. **Server vs Client:** painel do gestor é SSR; área do vendedor e formulários são `"use client"`. Não troque sem motivo.
7. **Estilo — dois regimes, não misture:** painel do gestor/AppHeader/Brand usam tokens CSS e classes `cm-*` de `src/app/globals.css` (sem cores hardcoded); tela de login e área do vendedor usam CSS Modules fiéis ao Figma "Supper Certo" (`login.module.css`, `indicacao.module.css`), onde as cores fixas da marca são **intencionais** — não converta pra tokens. Sem bibliotecas de UI. Mobile-first + acessibilidade (labels, `aria-*`, `role="alert"`/`"status"`) nos dois regimes.
8. **Validação:** reaproveite `src/lib/validation.ts` (telefone 10/11 dígitos; placa Mercosul `ABC1D23` ou antiga `ABC1234`; máscaras). Não duplique regex.
9. **LGPD:** dados pessoais = nome, telefone, placa (formulário do vendedor) e também CPF/e-mail (só na importação automática do ViaNuvem, `vianuvem-import/`). O próprio vendedor também tem dado pessoal coletado no autocadastro (nome, e-mail, telefone, senha — Clerk cuida da autenticação, `vendedor_telefone` fica em `captacoes`). Minimização, acesso por RLS, sem logar dado pessoal (placa mascarada em log quando necessário). Ver `LGPD.md`.
10. **Cadastro de indicação nunca é INSERT puro.** `CapturaForm` chama a função `registrar_captacao_vendedor` (RPC, `supabase/schema.sql`) em vez de inserir direto: se a placa já existir vinda do ViaNuvem (`vendedor_id = "vianuvem"`), a função **atualiza** a linha pra virar indicação do vendedor (dispara `UPDATE` no Database Webhook — por isso ele precisa estar ligado pra Insert **e** Update); se a placa já for de outro vendedor de verdade, bloqueia. Nunca volte a fazer `supabase.from("captacoes").insert(...)` direto nesse formulário.

## Estrutura
- `src/app/` — `layout.tsx` (ClerkProvider), `page.tsx` (redirect por papel / tela de login na raiz), `vendedor/` (client), `gestor/` (server, tabela paginada e filtrada no banco via `searchParams` `pagina`/`busca`; métricas "Transmissões do dia/mês" consultam `seguros_indicacao_movida` pela `data_venda`, independentemente do status), `api/vendedor/perfil/` (promove loja/telefone do autocadastro pra `publicMetadata`), `api/gestor/relatorio-seguros/` (gestor-only, sincroniza as planilhas, cruza `seguros_indicacao_movida` x `captacoes` por placa e devolve `.xlsx` mensal por loja), `api/gestor/relatorio-desempenho/` (gestor-only, `.xlsx` de desempenho por loja **e vendedor**: indicações via Nuvem x do vendedor, status das negociações via `status_negociacao`, vendas pendentes/emitidas), `api/gestor/sincronizar-seguros/` (POST gestor-only, reutiliza a mesma sincronização completa do relatório, sem gerar arquivo, e retorna a contagem por dia/mês), `api/gestor/captacoes-export/` (gestor-only, devolve todas as captações que batem com a busca, sem paginação, pro CSV), `sign-in`/`sign-up` (redirecionam pra `/`, o login real é a raiz).
- `src/components/` — `CapturaForm`, `GestorClient` (busca/CSV + download dos dois relatórios .xlsx + botões que sincronizam e atualizam as métricas), `AppHeader`, `Brand` (estes dois só no gestor), `login/` (`LoginScreen`, `LoginHero`, `SignInForm`, `SignUpForm`, `clerkError.ts`, `icons.tsx`, `login.module.css`), `vendedor/` (`IndicacaoHeader`, `indicacao.module.css`).
- `src/lib/` — `supabase.ts`, `supabase-server.ts`, `sincronizar-seguros.ts` (sincronização planilhas → banco compartilhada pelos dois relatórios e pelos cards; grava também `status_negociacao` e faz upsert em lotes), `xlsx-estilo.ts` (estilos/cores/mês compartilhados dos `.xlsx`), `roles.ts` (claim `app_role`), `loja.ts` (loja/telefone do `publicMetadata`, `LOJAS_DISPONIVEIS`, `lojaOficial()` reconcilia o texto livre de loja das planilhas de seguro), `validation.ts`, `format.ts`, `types.ts` (mantenha `Captacao`/`NovaCaptacao` em sincronia com o schema).
- `src/middleware.ts` — auth + autorização por papel (`/gestor(.*)` e `/api/gestor(.*)` exigem `app_role = gestor`).
- `supabase/schema.sql` — tabelas `captacoes` (índices + policies RLS + função `registrar_captacao_vendedor`) e `seguros_indicacao_movida` (RLS gestor-only, sincronizada a partir das planilhas via o `doGet` do Apps Script). Atenção: ela é o **espelho por placa** das planilhas, não só das vendas — tem linha para toda placa, com `status_negociacao` (coluna J STATUS, que **não** existe em `captacoes`) e as colunas de seguro nulas quando não houve venda; nunca use `count(*)` dela como "vendas".
- `supabase/webhooks/captacoes-to-google-sheets.gs` — destino Google Sheets do Database Webhook (`doPost`, precisa estar configurado para Insert **e** Update) + endpoint de leitura `doGet` (relatório de seguros, protegido por `SEGUROS_READ_SECRET` separado do `WEBHOOK_SECRET`).
- `vianuvem-import/` — job standalone (fora do app, imagem Docker própria baseada em `mcr.microsoft.com/playwright`) que importa leads do ViaNuvem/Unico Auto a cada 20 minutos via cron (`docker compose run --rm importer`). Ver `vianuvem-import/README.md`.
- `scripts/` — utilitários administrativos standalone. `usuarios-por-loja.mjs`: lista os vendedores por loja (lê o Clerk pela `CLERK_SECRET_KEY`, agrupa por `publicMetadata.loja` porque o Clerk não filtra por metadata; imprime relatório + gera CSV gitignorado). Rode com `npm run usuarios-por-loja`.
- `doc/documentacao-tecnica.html` — histórico técnico detalhado do que foi construído (login, cadastro, ViaNuvem, bugs reais e correções).

## Agentes e skills deste projeto (Claude + Codex)

Os arquivos originais do Claude ficam em `.claude/`. Os equivalentes nativos do Codex ficam
em `.codex/agents/`, `.agents/skills/` e `AGENTS.md`. Mantenha as duas versões sincronizadas.

Roteie a tarefa ao especialista, que aciona a skill correspondente:

| Área | Agente | Skills |
|------|--------|--------|
| Auth / Clerk / login / autocadastro | `auth-integration` | `clerk-supabase-auth` |
| Banco / RLS / RPC / webhooks / planilhas | `supabase-db` | `supabase-rls`, `sheets-webhook` |
| Front-end / UI / validação | `frontend-ui` | `kinetic-harvest-ui`, `captacao-validation` |
| Privacidade | `lgpd-reviewer` | `lgpd-data-handling` |
| Docker / deploy / produção / disco | `docker-devops` | `docker-nextjs`, `vianuvem-import-job` |
| Importação ViaNuvem (job/Playwright) | `vianuvem-importer` | `vianuvem-import-job` |

Mudança que toca dado pessoal → sempre passe pelo `lgpd-reviewer`. Mudança de papel/claim → alinhe `auth-integration` + `supabase-db`. Ao concluir qualquer mudança relevante, a skill `docs-sync` diz qual documento atualizar (vale para todos os agentes).

## Deploy (Docker)
Produção via Docker: `Dockerfile` (multi-stage + `output: "standalone"`) + `docker-compose.yml`. Fluxo e o gotcha das `NEXT_PUBLIC_*` (build-time E runtime) estão em `DOCKER.md`. Segredos (`CLERK_SECRET_KEY`) só em runtime, nunca na imagem.

## Notas
- Erro "BaseFetch" do Clerk: veja `debug-clerk-basefetch-error.md`. Causas comuns: chaves erradas no `.env.local`, domínio do Clerk não configurado no provider third-party do Supabase, ou token sem `app_role`.
- Os painéis do Clerk/Supabase mudam com frequência — confirme nos docs oficiais linkados no `README.md`.
