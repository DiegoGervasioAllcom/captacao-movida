# vianuvem-import

Job separado do app Next.js de propósito (imagem Docker própria, não entra na
imagem de produção do app) que importa leads do **Unico Auto / ViaNuvem** para
a tabela `captacoes` do Captação Movida, uma vez por hora.

Roda em **Docker** (não precisa instalar Node.js no servidor): a imagem usa a
base oficial do Playwright, que já vem com o Chromium e todas as bibliotecas
de sistema necessárias — nada de `apt-get`/`sudo` no host.

## Como funciona

1. Abre o navegador (Playwright/Chromium) e faz login no ViaNuvem preenchendo
   usuário/senha na própria tela — é a única forma de passar pelo reCAPTCHA
   (invisível, v3), não dá pra fazer isso com uma chamada HTTP pura.
2. Com a sessão autenticada, clica em **Exportar > Processos** na própria
   página (`clicarExportarProcessos`) e escuta a resposta real que a SPA do
   ViaNuvem gera para aquele clique. Isso é proposital: uma versão anterior
   tentava replicar essa chamada por fora (extraindo cookies e usando
   `fetch` puro) e o endpoint voltava vazio (`fullSignedURL: ""`) sem erro —
   o servidor exige o contexto de uma navegação real da UI, não só os
   cookies. Se a resposta vier assíncrona, continua ouvindo a mesma tela por
   até 2 minutos (`MAX_TENTATIVAS`).
3. Baixa a planilha do `fullSignedURL` recebido e lê as linhas (`xlsx`).
4. Para cada processo: normaliza a placa e pula se ela **já existir em
   `captacoes`, de qualquer origem** (formulário do vendedor ou importação
   anterior) — evita duplicar lead do mesmo veículo.
5. Insere os novos com `vendedor_id = "vianuvem"` e `canal = "ViaNuvem"`
   (usado pela coluna CANAL nas planilhas). O Database Webhook do Supabase
   (já configurado) dispara sozinho e roteia para a planilha certa do
   Google Sheets — nada aqui mexe nisso.

Se um vendedor de verdade depois cadastrar "Nova Indicação" pelo portal
usando a mesma placa, essa linha é **atualizada** (não duplicada) para virar
indicação daquele vendedor — ver `registrar_captacao_vendedor` em
`supabase/schema.sql` e `CapturaForm.tsx`. Esse é o único jeito hoje de uma
captação `vianuvem` "trocar de dono".

Rodando em produção desde 08/07/2026, de hora em hora via cron — ver
`doc/` na raiz do projeto para o histórico completo de bugs reais
encontrados e corrigidos durante a construção deste job.

## Instalar no servidor

Pré-requisito: só o Docker que já está instalado (o mesmo que roda o app
principal). Nada de Node.js no host.

```bash
git pull                      # traz a pasta vianuvem-import/ pro servidor
cd vianuvem-import
cp .env.example .env
chmod 600 .env                # so o dono le - tem credencial de producao dentro
# preencha .env com o usuario/senha do ViaNuvem e as chaves do Supabase

docker compose build          # baixa a imagem base do Playwright (1a vez demora um pouco)
```

Teste manual antes de agendar (confirme no log que diz "importado(s)" e
depois confira se a linha realmente apareceu em `captacoes` e na planilha
certa):

```bash
docker compose run --rm importer
```

## Agendar (cron, 1x por hora)

Servidores Ubuntu mínimos podem não ter `cron` nem `logrotate` instalados
(aconteceu em produção) — instale antes de seguir:

```bash
sudo apt update
sudo apt install -y cron logrotate
sudo systemctl enable --now cron
```

Como o job roda com `docker compose` (precisa do socket do Docker), a
entrada vai no **crontab do root**:

```bash
sudo crontab -e
```

Adicione (ajuste o caminho completo para o real do seu servidor — confirme
com `pwd` dentro de `vianuvem-import`):

```
0 * * * * cd /caminho/completo/captacao-movida/vianuvem-import && /usr/bin/docker compose run --rm importer >> /var/log/vianuvem-import.log 2>&1
```

Confira o caminho do `docker` com `which docker` (cron roda com um `PATH`
bem mais curto que o seu shell interativo, então o caminho completo evita
"command not found" ali também).

### Girar o log (ele cresce pra sempre, 1x/hora)

```bash
sudo tee /etc/logrotate.d/vianuvem-import > /dev/null <<'EOF'
/var/log/vianuvem-import.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    copytruncate
}
EOF
```

`copytruncate` é essencial aqui: o cron sempre reabre o mesmo arquivo com
`>>`, então sem isso a rotação pode cortar um log no meio de uma execução.

### Ser avisado se o cron falhar

Adicione uma linha `MAILTO=seu-email@exemplo.com` no topo do `crontab -e`
(depende de um MTA local configurado no servidor - `sendmail`/`postfix`) ou,
mais simples, confira o log de vez em quando:

```bash
tail -50 /var/log/vianuvem-import.log
```

## O que já foi calibrado, e o que ainda não

Já validado em produção, rodando de hora em hora desde 08/07/2026: login
real via Playwright, exportação via clique na UI, mapeamento de campos
(`mapearLinha`) contra relatórios reais (nome, CPF, e-mail, telefone, placa,
loja todos extraídos corretamente, incluindo a correção de "Estabelecimento"
colidindo com "ID Estabelecimento"), dedupe por placa e insert no Supabase
com o Database Webhook roteando pra planilha certa.

O que **ainda não** foi validado:

- **Paginação**: se "Processos que atuo" crescer muito (centenas), confirmar
  se o relatório exportado continua trazendo tudo de uma vez.
- **Resposta assíncrona real**: os testes até agora vieram com `async: false`
  direto; o retry (`MAX_TENTATIVAS`, 2 min) existe pro caso assíncrono mas
  nunca foi exercitado de verdade.

## Problemas reais já encontrados e corrigidos (histórico)

Registrado aqui porque cada um desses custou uma rodada de debug ao vivo —
se algo parecido acontecer de novo, comece por esta lista:

- **Timeout de rede em `networkidle`**: o site carrega pixels de rastreamento
  (Facebook, LinkedIn Ads, LaunchDarkly) que nunca param, então a rede nunca
  fica "idle" de verdade. Corrigido usando `waitUntil: "domcontentloaded"`.
- **Popup nativo de permissão de geolocalização**: o ViaNuvem pede
  geolocalização como parte do login; sem ninguém pra clicar "Permitir", a
  página travava esperando pra sempre. Corrigido concedendo a permissão
  programaticamente no contexto do Playwright (`permissions: ["geolocation"]`
  + coordenada fixa de São Paulo) antes de navegar.
- **Senha com `#` truncada em silêncio**: sem aspas, o `dotenv` trata tudo
  depois de um `#` no `.env` como comentário e corta a senha — sem erro
  nenhum, só autenticava com uma senha incompleta. Sempre envolva valores
  com `#`, espaços ou aspas em aspas duplas no `.env`
  (`VIANUVEM_SENHA="minha#senha"`).
- **`Invalid API key` do Supabase**: a chave colocada em
  `SUPABASE_SERVICE_ROLE_KEY` era, na verdade, a chave `anon` (decodificando
  o JWT dava `"role": "anon"`). A chave certa é a `service_role`, em Project
  Settings > API no painel do Supabase.
- **Exportação retornando vazia (`fullSignedURL: ""`, sem erro)**: a primeira
  versão fazia login com Playwright, extraía os cookies, fechava o navegador
  e replicava a chamada da API de exportação com `fetch` puro. O endpoint
  aceitava a chamada mas devolvia vazio — o servidor exige contexto de uma
  navegação real (clique na UI), não só os cookies. Corrigido fazendo o
  próprio Playwright clicar em "Exportar > Processos" na página autenticada
  e escutando a resposta real (`clicarExportarProcessos`).
- **Login intermitente ("ainda na tela de login") em produção via cron, mas
  funcionando manual**: não era ambiente/cron — era o site respondendo mais
  devagar em alguns horários, estourando o prazo de 10s de espera pelo
  redirecionamento pós-login. Aumentado para 30s.
- **Campo novo (`canal`) ficando `null` mesmo com o código certo no
  repositório**: o Dockerfile copia o código pra dentro da imagem (não é
  volume ao vivo) — `git pull` sozinho não muda o container em produção.
  Depois de qualquer mudança em `importar.mjs`, sempre rode
  `docker compose build` de novo antes do próximo cron, senão ele continua
  rodando a imagem antiga em silêncio (sem erro nenhum, só faltando o
  campo novo).

## Quando a sessão parar de funcionar

Se o login começar a falhar de forma **persistente** (não intermitente —
ver item acima sobre timeout), pode ser o ViaNuvem passando a exigir
verificação adicional por perceber login automatizado toda hora. O script
para e loga o erro (com screenshot em `debug/falha-login-*.png`); ele
**não** insiste tentando de novo sem parar. Nesse caso, a alternativa é
trocar o login automático por um cookie de sessão extraído manualmente de
tempos em tempos, ou (melhor, ver seção abaixo) buscar acesso oficial de
API com o ViaNuvem.

## LGPD

Este job trata dado pessoal (nome, telefone, placa, CPF, e-mail) de titulares
que nunca interagiram diretamente com o Captação Movida — os dados vêm de um
processo de financiamento já em andamento em outro sistema. Isso tem base
legal e riscos próprios, diferentes do formulário do vendedor. Antes de
mexer neste job ou usar o CPF para algo além de deduplicação, leia
`LGPD.md` seção 4.1. Nunca logue nome, telefone, CPF ou e-mail em texto
puro — use `mascararPlaca` (`lib/normalizar.mjs`) como referência para
qualquer log que precise de um identificador.

## Melhor solução a médio prazo

Vale abrir um chamado com o suporte do ViaNuvem/Unico Auto perguntando por um
acesso de API oficial — a conta já tem uma categoria de processo chamada
"TESTE API - USO EXCLUSIVO", o que sugere que pode já existir (ou dar pra
habilitar) uma integração documentada, eliminando de vez a dependência do
login automatizado.
