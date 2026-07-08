# vianuvem-import

Job standalone (fora do app Next.js de propósito, para não colocar o Playwright
na imagem Docker de produção) que importa leads do **Unico Auto / ViaNuvem**
para a tabela `captacoes` do Captação Movida, uma vez por hora.

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

```bash
cd vianuvem-import
npm install                 # também baixa o Chromium do Playwright (postinstall)
cp .env.example .env
# preencha .env com o usuário/senha do ViaNuvem e as chaves do Supabase
```

Teste manual antes de agendar:

```bash
npm run importar
```

## Agendar (cron, 1x por hora)

```bash
crontab -e
```

Adicione:

```
0 * * * * cd /caminho/completo/para/captacao-movida/vianuvem-import && /usr/bin/node importar.mjs >> /var/log/vianuvem-import.log 2>&1
```

Ajuste `/caminho/completo/...` e o caminho do `node` (confira com `which node`).

## Calibrar no primeiro uso real

Este script foi escrito sem conseguir inspecionar um relatório exportado de
verdade (a URL assinada de download carrega token de acesso, então não dava
pra abrir com segurança durante o desenvolvimento). Depois da primeira
execução real, confira:

- **Nomes das colunas**: se o log mostrar avisos de "linha sem placa/nome/
  telefone", abra o arquivo baixado manualmente (pela própria tela do
  ViaNuvem, botão Exportar) e confira os cabeçalhos reais contra a lista em
  `COLUNAS` no topo de `importar.mjs` — ajuste os textos candidatos se
  necessário.
- **Paginação**: se "Processos que atuo" crescer muito (centenas), confirme
  se o relatório exportado traz tudo de uma vez ou se precisa paginar.
- **Resposta assíncrona**: se o log mostrar timeout esperando o relatório,
  o contrato real da API para pedidos assíncronos precisa ser investigado
  (a função `aguardarRelatorio` tem um retry simples que pode não bater com
  o comportamento real).

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
