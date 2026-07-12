# Docker — Captação Movida (produção)

Imagem enxuta de Next.js 15 usando **multi-stage** + output **`standalone`** (só o runtime necessário). Usuário não-root, healthcheck incluído.

> O projeto tem **duas** imagens Docker: esta (o app web) e a do job de
> importação `vianuvem-import/` (base Playwright, cron de hora em hora,
> regras próprias) — ver `vianuvem-import/README.md`.

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

## Atualizar versão — `git pull` sozinho NÃO basta
O código é **copiado para dentro da imagem** no build (`COPY . .`) — não é
volume. `git pull` sem rebuild deixa o container rodando a versão antiga
**sem nenhum erro**: o sintoma é silencioso (ex.: uma coluna nova do banco
gravando `null`). Já aconteceu duas vezes neste projeto.

```bash
git pull
docker compose build       # OBRIGATÓRIO, não é otimização
docker compose up -d
docker image prune -f      # remove camadas antigas (pode liberar 0B, ver abaixo)
```

O mesmo vale para o importer: `git pull && cd vianuvem-import && docker compose build`
antes do próximo disparo do cron.

## Disco cheio no servidor (recorrente — playbook seguro)
O servidor tem disco pequeno (9.8GB) e o erro `no space left on device` /
`ResourceExhausted` no build já ocorreu mais de uma vez. Na ordem:

1. **Diagnostique antes de apagar:** `df -h` e `docker system df` (mostra
   onde o espaço está: cache de build × imagens × volumes).
2. `docker builder prune -f` — maior ganho comprovado aqui (~1GB de cache
   de build no primeiro incidente).
3. `docker image prune -f` — **pode liberar 0B**: quando as imagens
   dangling compartilham camadas com a imagem taggeada em uso, não há nada
   exclusivo para remover. Não conclua que o disco está limpo por isso.
4. Remoção dirigida: `docker images` e `docker rmi <imagem-antiga>` — foi o
   que resolveu o segundo incidente (imagens antigas do `vianuvem-import`,
   ~2GB cada).
5. **NUNCA** rode `docker volume prune` (nem `docker system prune --volumes`)
   às cegas em produção — volumes podem guardar dados que não voltam.
6. Médio prazo: aumentar o volume do servidor ou automatizar uma limpeza
   periódica.

## Tamanho
- Base `node:22-alpine`; a imagem final copia apenas `.next/standalone`, `.next/static` e `public/`.
- Verifique o tamanho: `docker images captacao-movida`.
