# Docker — Captação Movida (produção)

Imagem enxuta de Next.js 15 usando **multi-stage** + output **`standalone`** (só o runtime necessário). Usuário não-root, healthcheck incluído.

## Arquivos
- `Dockerfile` — build multi-stage (`deps` → `builder` → `runner`).
- `docker-compose.yml` — serviço de produção `web` na porta 3000.
- `.dockerignore` — mantém o contexto pequeno e evita vazar `.env`.
- `.env.production.example` — modelo das variáveis (copie para `.env`).

## Subir em produção
```bash
# 1. No servidor, na raiz do projeto:
cp .env.production.example .env      # e preencha com as chaves de PRODUÇÃO

# 2. Build + subir
docker compose build
docker compose up -d

# 3. Acompanhar
docker compose logs -f web
docker compose ps
```
App em `http://<servidor>:3000` (coloque um proxy/HTTPS na frente — Nginx/Traefik/Caddy).

## Ponto crítico: variáveis `NEXT_PUBLIC_*`
No Next.js elas são **embutidas no bundle durante o `next build`**. Por isso:
- vão como **build args** no `docker compose build` (lidas do `.env`);
- e também no **runtime** (`env_file: .env`), porque o servidor as lê (ex.: painel do gestor).

`CLERK_SECRET_KEY` é **só runtime** (segredo) — nunca entra na imagem.
Se trocar qualquer `NEXT_PUBLIC_*`, é preciso **rebuild** (`docker compose build`) — mudar só o runtime não basta.

## Atualizar versão
```bash
git pull
docker compose build
docker compose up -d
docker image prune -f      # remove camadas antigas
```

## Tamanho / limpeza
- Base `node:22-alpine`; a imagem final copia apenas `.next/standalone`, `.next/static` e `public/`.
- Verifique o tamanho: `docker images captacao-movida`.
