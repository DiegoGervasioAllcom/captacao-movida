---
name: clerk-supabase-auth
description: >-
  Receita exata da integração Clerk (auth) + Supabase (banco) deste projeto: claim
  app_role vs role, third-party auth nativo, accessToken no cliente e no servidor, login
  e autocadastro headless (useSignIn/useSignUp, unsafeMetadata → publicMetadata, tradução
  de erros, Smart CAPTCHA) e o erro de BaseFetch do Clerk. Use ao mexer em login,
  cadastro, papéis, sessão, token, middleware, ou ao integrar/depurar Clerk com Supabase.
---

# Integração Clerk + Supabase (Captação Movida)

Supabase é **só banco**; quem autentica é o Clerk. A ligação é o **third-party auth nativo** do Supabase: o session token do Clerk é injetado em cada request via `accessToken`.

## O gotcha mais importante: `app_role`, não `role`
- O claim `role` **pertence ao Supabase** (PostgREST) e precisa valer `authenticated`. Não o sobrescreva.
- O papel da aplicação (`vendedor`/`gestor`) vive em um claim **separado**: `app_role`. No painel do Clerk → Sessions → Customize session token: `{ "app_role": "{{user.public_metadata.role}}" }`.
- Leia sempre via `roleFromClaims(sessionClaims)` (`src/lib/roles.ts`). Default sem papel = `vendedor`.
- Nas policies SQL: `auth.jwt()->>'app_role'`. Nunca `auth.jwt()->>'role'` para o papel.

## Padrão de cliente Supabase
- **Browser** (`src/lib/supabase.ts`): `createClient(URL, ANON_KEY, { accessToken: async () => (await window.Clerk?.session?.getToken()) ?? null })`
- **Server** (`src/lib/supabase-server.ts`): `const { getToken } = await auth()` e o mesmo `accessToken`.
- Sem sessão → token `null` → request anônima → bloqueada pela RLS (esperado).

## Login e cadastro são HEADLESS (não são os componentes prontos do Clerk)
- O login real é a **raiz** (`src/app/page.tsx`: deslogado → `<LoginScreen />`; logado → redirect por papel). `/sign-in` e `/sign-up` são stubs que só fazem `redirect("/")`.
- `SignInForm` usa `useSignIn`: `signIn.create({ identifier, password })` → `status === "complete"` → `setActive(...)`. Reset de senha em 2 fases com strategy `reset_password_email_code` (`create` envia código; `attemptFirstFactor` redefine e entra).
- **Erros em pt-BR:** hooks headless retornam erro só em inglês (a `localization={ptBR}` do ClerkProvider vale só pra componentes prontos). Use sempre `clerkError(err)` (`src/components/login/clerkError.ts`): traduz pelo `code` via `ptBR.unstable__errors`, tentando primeiro a chave composta `${code}__${paramName}`; fallback "Não foi possível concluir. Tente novamente.". Exiba em `role="alert"`.
- O form de cadastro precisa do `<div id="clerk-captcha" />` (Smart CAPTCHA). Nunca remova.

## Autocadastro do vendedor (pipeline unsafeMetadata → publicMetadata)
1. `SignUpForm` chama `signUp.create({ firstName, lastName, emailAddress, password, unsafeMetadata: { loja, telefone } })` — `unsafeMetadata` é o **único** metadata que o cliente pode escrever.
2. **Ramifique pelo `res.status` do `create()`** (não assuma que sempre há etapa de código): se vier `"complete"` (verificação de e-mail DESLIGADA no painel do Clerk → conta já sai pronta com sessão), chame `setActive` e entre direto; senão (`"missing_requirements"`), `prepareEmailAddressVerification({ strategy: "email_code" })` → etapa "codigo" → `attemptEmailAddressVerification({ code })` → `status === "complete"` → `setActive`. ⚠️ Chamar `prepareEmailAddressVerification` quando o cadastro já está `complete` **lança erro** e deixa o usuário criado mas deslogado — foi bug real (11/07/2026). O helper `finalizarCadastro` centraliza `setActive` + POST perfil + `goHome` nos dois caminhos.
3. Best-effort: `fetch("/api/vendedor/perfil", { method: "POST" }).catch(() => {})` — se falhar, um admin define loja/telefone à mão no painel.
4. A rota (`src/app/api/vendedor/perfil/route.ts`) revalida no servidor: loja ∈ `LOJAS_DISPONIVEIS` (400 "Loja invalida."), `telefoneValido` (400 "Telefone invalido.") e grava `publicMetadata: { loja, telefone }` via `clerkClient`. **A rota nunca mexe em `role`** — sem papel o app já trata como vendedor.
- `loja`/`telefone` são lidos de `user.publicMetadata` via `lojaFromPublicMetadata`/`telefoneFromPublicMetadata` (`src/lib/loja.ts`, busca de chave case-insensitive — admins digitam à mão no painel). Não há claim customizado pra eles.
- `LOJAS_DISPONIVEIS` deve espelhar `LOJA_PARA_PLANILHA` do Apps Script (loja nova entra nos dois + reimplantação do Web App); "Campinas Shop Dom Pedro" é grafado assim de propósito (chave exata do mapa — não "embelezar").

## Variáveis de ambiente (nunca no código)
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, e as 4 rotas do Clerk apontando pra `/`: `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`.

## Erro "BaseFetch" do Clerk
Veja `debug-clerk-basefetch-error.md` na raiz. Causas comuns: chaves ausentes/erradas no `.env.local`, domínio do Clerk não configurado no provider third-party do Supabase, ou session token sem `app_role`.

## Checklist ao alterar auth
1. Papel continua em `app_role`? 2. `role` intacto (= `authenticated`)? 3. Middleware e páginas server revalidam? 4. Cliente só escreve `unsafeMetadata`; promoção é server-side? 5. Erros via `clerkError()`? 6. `npm run typecheck` passa? 7. Docs oficiais conferidos se o painel mudou (links no README).
