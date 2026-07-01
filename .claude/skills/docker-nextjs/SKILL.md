---
name: docker-nextjs
description: >-
  Receita de containerização deste projeto Next.js 15: Dockerfile multi-stage com output
  standalone (imagem mínima), o gotcha das variáveis NEXT_PUBLIC_* (build-time + runtime) vs
  segredos de runtime, e o docker-compose de produção. Use ao criar/alterar Dockerfile,
  docker-compose, .dockerignore, deploy, ou ao depurar build/tamanho de imagem.
---

# Docker para o Next.js (Captação Movida)

Imagem enxuta = **multi-stage** + **`output: "standalone"`** (em `next.config.mjs`). O standalone gera `.next/standalone/server.js` com só o necessário para rodar.

## Estrutura do Dockerfile (3 stages)
1. **deps** (`node:22-alpine`): `COPY package*.json` + `npm ci`.
2. **builder**: copia `node_modules` do deps + o código; recebe as `NEXT_PUBLIC_*` como **ARG** e as expõe como **ENV**; `npm run build`.
3. **runner** (`node:22-alpine`): usuário não-root; copia só `public/`, `.next/standalone` (na raiz) e `.next/static` (em `.next/static`); `CMD ["node","server.js"]`. Env de runtime: `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0`.

## O gotcha central: `NEXT_PUBLIC_*`
- São **embutidas no bundle no momento do `next build`** → precisam existir no **builder** (via `ARG` → `ENV`).
- O servidor também as lê em **runtime** (ex.: `createServerSupabaseClient` lê `process.env.NEXT_PUBLIC_SUPABASE_URL`) → precisam estar também no runtime (`env_file`/`environment`).
- Logo: passe cada `NEXT_PUBLIC_*` como **build arg E runtime env**.
- Mudou uma `NEXT_PUBLIC_*`? Só reiniciar não basta — precisa **rebuild** da imagem.

Variáveis do projeto: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_CLERK_SIGN_*_URL`.

## Segredos (só runtime)
`CLERK_SECRET_KEY` — nunca em build arg nem na imagem; só via `env_file: .env` / `environment` no compose. `.env` fica no `.dockerignore`.

## docker-compose (produção)
- Serviço `web`: `build.args` com as `NEXT_PUBLIC_*` (`${VAR}` vem do `.env`), `image`, `restart: unless-stopped`, `ports: 3000:3000`, `env_file: .env`, `healthcheck` batendo em `http://localhost:3000/`.
- Fluxo: `cp .env.production.example .env` → preencher → `docker compose build` → `docker compose up -d`.

## Dicas
- `.dockerignore` deve excluir `node_modules`, `.next`, `.git`, `.env*` (menos os `*.example`), `.claude`, `*.md` — contexto pequeno e sem segredos.
- Imagem final típica: dezenas de MB (alpine + standalone), não centenas. Cheque com `docker images captacao-movida`.
- Coloque proxy/HTTPS (Nginx/Traefik/Caddy) na frente; o container só expõe HTTP na 3000.
- Após atualizar: `docker compose build && docker compose up -d && docker image prune -f`.
