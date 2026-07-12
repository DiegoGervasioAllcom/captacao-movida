---
name: docker-nextjs
description: >-
  Receita de containerização da imagem do APP Next.js 15 deste projeto: Dockerfile
  multi-stage com output standalone + outputFileTracingRoot, o gotcha das variáveis
  NEXT_PUBLIC_* (build-time + runtime) vs segredos de runtime, docker-compose de
  produção, a regra "git pull exige rebuild" e o playbook de disco cheio no servidor.
  Use ao criar/alterar Dockerfile, docker-compose, .dockerignore, deploy, ou ao depurar
  build/tamanho de imagem. (Para a imagem do job de importação, use a skill
  vianuvem-import-job.)
---

# Docker para o app Next.js (Captação Movida)

Este projeto tem **duas** imagens: a do app (esta skill) e a do job `vianuvem-import/` (base Playwright, regras próprias — skill `vianuvem-import-job`). Não aplique a receita alpine/multi-stage no importer.

## Estrutura do Dockerfile do app (3 stages, `node:22-alpine`)
1. **deps**: `COPY package*.json` + `npm ci`.
2. **builder**: copia `node_modules` do deps + o código; recebe as `NEXT_PUBLIC_*` como **ARG** → **ENV**; `npm run build`.
3. **runner**: usuário não-root (`nextjs`); copia só `public/`, `.next/standalone` (na raiz) e `.next/static`; `CMD ["node","server.js"]`. Env: `NODE_ENV=production`, `PORT=3000`, `HOSTNAME=0.0.0.0`.

**Pré-requisito no `next.config.mjs` — são DOIS ajustes:** `output: "standalone"` **e** `outputFileTracingRoot: __dirname`. Sem o segundo, o Next detecta o `package-lock.json` de `vianuvem-import/` e aninha o standalone em subpastas, quebrando o `COPY` do Dockerfile.

## O gotcha central: `NEXT_PUBLIC_*`
- Embutidas no bundle no `next build` → precisam existir no **builder** (ARG → ENV) **e** no runtime (`env_file`) — o server também as lê (ex.: `createServerSupabaseClient`).
- Mudou uma `NEXT_PUBLIC_*`? Reiniciar não basta — **rebuild**.
- São 7 ARGs: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (obrigatórias no `.env`) + as 4 rotas do Clerk (`NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `SIGN_UP_URL`, `SIGN_IN_FALLBACK_REDIRECT_URL`, `SIGN_UP_FALLBACK_REDIRECT_URL`), com default `/` no Dockerfile e `${VAR:-/}` no compose.

## Segredos (só runtime)
`CLERK_SECRET_KEY` — nunca em build arg nem na imagem; só via `env_file: .env` no compose. `.env` fica no `.dockerignore`.

## docker-compose (produção)
Serviço `web`: `build.args` com as `NEXT_PUBLIC_*`, `image: captacao-movida:latest`, `restart: unless-stopped`, `ports: 3000:3000`, `env_file: .env`, healthcheck via `node -e` + `http.get` na porta 3000.
Fluxo inicial: `cp .env.production.example .env` → preencher → `docker compose build` → `docker compose up -d`.

## Atualização em produção — git pull EXIGE rebuild
O código é **copiado na imagem** (`COPY . .`), não é volume: `git pull` sozinho deixa o container rodando a versão antiga **sem nenhum erro** (o sintoma é silencioso — já aconteceu 2x neste projeto). Sempre:
```bash
git pull && docker compose build && docker compose up -d
```
(No importer: `git pull && cd vianuvem-import && docker compose build` antes do próximo cron.)

## Disco cheio no servidor (recorrente — playbook seguro)
1. Diagnostique: `df -h` e `docker system df` (cache de build vs imagens vs volumes).
2. `docker builder prune -f` — maior ganho comprovado aqui (~1GB de cache).
3. `docker image prune -f` — **pode liberar 0B** (dangling compartilhando layers com a tag em uso). Não conclua que está limpo.
4. Remoção dirigida: `docker images` → `docker rmi <imagem-antiga>` (foi o que resolveu o 2º incidente: imagens antigas do vianuvem-import, ~2GB).
5. **NUNCA** `docker volume prune` / `system prune --volumes` às cegas em produção.

## Dicas
- `.dockerignore`: `node_modules`, `.next`, `.git`, `.env*` (menos `*.example`), `.claude`, `*.md`.
- Imagem final do app: dezenas de MB. Cheque com `docker images captacao-movida`.
- Proxy/HTTPS (Nginx/Traefik/Caddy) na frente; o container só expõe HTTP na 3000.
