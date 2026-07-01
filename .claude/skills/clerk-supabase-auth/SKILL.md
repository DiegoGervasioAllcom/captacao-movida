---
name: clerk-supabase-auth
description: >-
  Receita exata da integração Clerk (auth) + Supabase (banco) deste projeto: claim
  app_role vs role, third-party auth nativo, accessToken no cliente e no servidor,
  customização do session token e o erro de BaseFetch do Clerk. Use ao mexer em login,
  papéis, sessão, token, middleware, ou ao integrar/depurar Clerk com Supabase.
---

# Integração Clerk + Supabase (Captação Movida)

Supabase é **só banco**; quem autentica é o Clerk. A ligação é o **third-party auth nativo** do Supabase: o session token do Clerk é injetado em cada request via `accessToken`.

## O gotcha mais importante: `app_role`, não `role`
- O claim `role` **pertence ao Supabase** (PostgREST) e precisa valer `authenticated`. Não o sobrescreva.
- O papel da aplicação (`vendedor`/`gestor`) vive em um claim **separado**: `app_role`.
- No painel do Clerk → **Sessions → Customize session token**:
  ```json
  { "app_role": "{{user.public_metadata.role}}" }
  ```
- Leia sempre via `roleFromClaims(sessionClaims)` (`src/lib/roles.ts`). Default sem papel = `vendedor`.
- Nas policies SQL: `auth.jwt()->>'app_role'`. Nunca `auth.jwt()->>'role'` para o papel.

## Padrão de cliente Supabase
- **Browser** (`src/lib/supabase.ts`):
  ```ts
  createClient(URL, ANON_KEY, { accessToken: async () => (await window.Clerk?.session?.getToken()) ?? null })
  ```
- **Server** (`src/lib/supabase-server.ts`): use `const { getToken } = await auth()` e o mesmo `accessToken`.
- Sem sessão → token `null` → request anônima → bloqueada pela RLS (comportamento esperado).

## Variáveis de ambiente (nunca no código)
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Rotas de login no `.env` apontam para `/`.

## Erro "BaseFetch" do Clerk
Veja `debug-clerk-basefetch-error.md` na raiz antes de depurar. Causas comuns: chaves ausentes/erradas no `.env.local`, domínio do Clerk não configurado no provider de third-party auth do Supabase, ou session token sem o claim `app_role`.

## Checklist ao alterar auth
1. O papel continua em `app_role`? 2. `role` intacto (= `authenticated`)? 3. Middleware e páginas server revalidam o papel? 4. `npm run typecheck` passa? 5. Docs oficiais conferidos se o painel mudou (links no README).
