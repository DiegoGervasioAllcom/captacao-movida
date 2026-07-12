---
name: vianuvem-import-job
description: >-
  Receita do job de importação de leads do ViaNuvem/Unico Auto (vianuvem-import/): login
  automatizado com Playwright, exportação via clique real na UI, mapeamento de campos,
  dedupe por placa, insert com service_role, imagem Docker própria (base Playwright),
  cron de hora em hora e a lista de gotchas reais de produção. Use ao mexer em
  importar.mjs, no Dockerfile/compose do job, no cron, ou ao depurar "lead não importou"
  / falha de login do importador.
---

# Job vianuvem-import (importação de leads)

Job standalone (fora do app Next.js), roda em produção de hora em hora via cron do root: `docker compose run --rm importer`. **Fonte da verdade operacional: `vianuvem-import/README.md`** — especialmente a lista "Problemas reais já encontrados e corrigidos" (comece por ela em qualquer debug).

## Como funciona (não "otimize" sem entender o porquê)
1. **Login via Playwright de verdade** (reCAPTCHA v3 invisível — não dá pra logar com HTTP puro). Geolocalização concedida programaticamente no contexto (o site trava esperando o popup). `waitUntil: "domcontentloaded"` (pixels de rastreamento impedem `networkidle` pra sempre).
2. **Exportação = clique real na UI** (`clicarExportarProcessos`), escutando a resposta que a SPA gera. Replicar a chamada com `fetch` + cookies devolve `fullSignedURL: ""` sem erro — o servidor exige contexto de navegação real. Resposta assíncrona: retry por até 2 min (`MAX_TENTATIVAS`).
3. Baixa o `.xlsx` e mapeia com `mapearLinha` — cuidado com colisão de cabeçalhos já vivida ("Estabelecimento" × "ID Estabelecimento"); valide contra relatório real.
4. **Dedupe por placa** (não por CPF): pula se a placa já existir em `captacoes`, de qualquer origem.
5. Insert com service_role (bypassa RLS): `vendedor_id: "vianuvem"`, `canal: "ViaNuvem"` (grafia exata — planilhas dependem), cpf/email preenchidos só aqui. O Database Webhook roteia pra planilha sozinho — o job não mexe nisso.

Se um vendedor depois cadastrar a mesma placa no portal, a linha é **reivindicada** (UPDATE via `registrar_captacao_vendedor`) — único jeito de uma captação `vianuvem` trocar de dono.

## Imagem Docker do job (regras próprias — NÃO é a receita do app)
- Base `mcr.microsoft.com/playwright:<versão>-jammy`, single-stage. A tag da base **tem que bater** com a versão do playwright **pinada sem `^`** no `package.json` do job — atualize os dois juntos.
- `npm install --omit=dev --ignore-scripts` (`--ignore-scripts` pula o postinstall `playwright install chromium`; a base já tem o Chromium).
- Compose: serviço `importer`, `env_file: .env`, volume `./debug:/app/debug` (screenshots sobrevivem ao `--rm`). **Sem ports, sem restart policy, sem `up -d`** — é job pontual.
- **Mudou o código → `docker compose build` antes do próximo cron.** `git pull` sozinho = imagem antiga rodando em silêncio (já causou `canal` null em produção).

## Cron e logs (servidor)
- Crontab do **root** (precisa do socket do Docker), caminho completo do docker (PATH do cron é curto): `0 * * * * cd /caminho/completo/.../vianuvem-import && /usr/bin/docker compose run --rm importer >> /var/log/vianuvem-import.log 2>&1`
- Ubuntu mínimo pode não ter cron/logrotate: `sudo apt install -y cron logrotate && sudo systemctl enable --now cron`.
- Logrotate diário com `copytruncate` (essencial — o cron reabre o mesmo arquivo com `>>`). Monitorar: `tail -50 /var/log/vianuvem-import.log`.

## .env do job (chmod 600 — credencial de produção)
`VIANUVEM_USUARIO`, `VIANUVEM_SENHA` (**valores com `#`/espaços entre aspas duplas** — dotenv trunca em silêncio no `#`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (a service_role de verdade — a anon no lugar dela dá "Invalid API key"). Opcional: `VIANUVEM_HEADLESS` (não definir em produção).

## Depurando falha de login
Screenshot em `vianuvem-import/debug/falha-login-*.png`. **Intermitente** = site lento em alguns horários (timeout de redirect já foi elevado a 30s). **Persistente** = possível bloqueio anti-bot: o script para e loga (não insiste); alternativas: cookie de sessão manual ou buscar API oficial (indício: categoria "TESTE API - USO EXCLUSIVO").

## LGPD
O job trata nome, telefone, placa, CPF e e-mail de titulares que nunca interagiram com o sistema (`LGPD.md` seção 4.1 — leia antes de mexer). Nunca logue dado pessoal em texto puro; placa só via `mascararPlaca` (`lib/normalizar.mjs`). Mudança nos dados coletados/logados → agente `lgpd-reviewer`.

## Teste manual
```bash
cd vianuvem-import && docker compose build && docker compose run --rm importer
```
Confirme "importado(s)" no log, depois a linha em `captacoes` e na planilha certa. Ainda não validado em produção: paginação de relatórios grandes e o caminho de resposta assíncrona real.
