# vianuvem-import

Job separado do app Next.js de propósito (imagem Docker própria, não entra na
imagem de produção do app) que importa leads do **Unico Auto / ViaNuvem** para
a tabela `captacoes` do Captação Movida, uma vez por hora.

Roda em **Docker** (não precisa instalar Node.js no servidor): a imagem usa a
base oficial do Playwright, que já vem com o Chromium e todas as bibliotecas
de sistema necessárias — nada de `apt-get`/`sudo` no host.

## Como funciona

1. Faz login no ViaNuvem com Playwright (é a única forma de passar pela tela de
   login, que tem reCAPTCHA — não dá pra fazer isso com uma chamada HTTP pura).
2. Pega os cookies de sessão e a partir daí só usa chamadas HTTP diretas na API
   interna do ViaNuvem (mais rápido, sem precisar do navegador para o resto).
3. Pede o relatório de "Processos que atuo", baixa a planilha exportada.
4. Para cada processo: normaliza a placa e pula se ela **já existir em
   `captacoes`, de qualquer origem** (formulário do vendedor ou importação
   anterior) — evita duplicar lead do mesmo veículo.
5. Insere os novos com `vendedor_id = "vianuvem"`. O Database Webhook do
   Supabase (já configurado) dispara sozinho e roteia para a planilha certa do
   Google Sheets — nada aqui mexe nisso.

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

```bash
crontab -e
```

Adicione (ajuste o caminho completo para o real do seu servidor):

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
  weekly
  rotate 8
  compress
  missingok
  notifempty
}
EOF
```

### Ser avisado se o cron falhar

Adicione uma linha `MAILTO=seu-email@exemplo.com` no topo do `crontab -e`
(depende de um MTA local configurado no servidor - `sendmail`/`postfix`) ou,
mais simples, confira o log de vez em quando:

```bash
tail -50 /var/log/vianuvem-import.log
```

## O que já foi calibrado, e o que ainda não

Já testei o mapeamento de campos (`mapearLinha`) contra um relatório real
exportado da tela — todos os campos (nome, CPF, e-mail, telefone, placa,
loja) foram extraídos corretamente, e a correção de um bug real (coluna
"Estabelecimento" colidindo com "ID Estabelecimento") já está aplicada. O
que **ainda não** foi validado, porque só dá pra testar com o cron rodando
de verdade contra o login:

- **Paginação**: se "Processos que atuo" crescer muito (centenas), confirme
  se o relatório exportado continua trazendo tudo de uma vez.
- **Resposta assíncrona**: o teste real veio com `async: false` direto; se
  algum dia a API responder de forma assíncrona, o retry simples em
  `aguardarRelatorio` pode não bater com o contrato real.
- **O próprio login via Playwright**: a lógica de detectar sucesso/falha
  (checar se a URL ainda tem `/login`) nunca rodou com usuário/senha reais.

## Quando a sessão parar de funcionar

Se o login começar a falhar de forma persistente (ex.: o ViaNuvem passar a
exigir verificação adicional por perceber login automatizado toda hora), o
script para e loga o erro — ele **não** insiste tentando de novo sem parar.
Nesse caso, a alternativa é trocar o login automático por um cookie de sessão
extraído manualmente de tempos em tempos (ver histórico da conversa/memória
do projeto para o desenho dessa alternativa).

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
