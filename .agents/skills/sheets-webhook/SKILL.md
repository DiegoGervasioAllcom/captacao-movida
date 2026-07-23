---
name: sheets-webhook
description: >-
  Receita do destino Google Sheets do Database Webhook
  (supabase/webhooks/captacoes-to-google-sheets.gs): roteamento por loja para 3
  planilhas, contrato de colunas A–J (CANAL na B), INSERT vs UPDATE (reivindicação de
  lead atualiza a linha por placa, sem duplicar), log de erros sem dado pessoal e passos
  de reimplantação do Apps Script. Use ao mexer no .gs, adicionar coluna que vá pra
  planilha, depurar "lead não apareceu na planilha" ou "preencheu na coluna errada".
---

# Destino Google Sheets (Apps Script)

`supabase/webhooks/captacoes-to-google-sheets.gs` é o **segundo** destino do Database Webhook de `captacoes` (o primeiro é o CRM). Projeto Apps Script **standalone**, publicado como Web App.

## Configuração no Supabase (não esquecer)
O webhook do Sheets precisa dos eventos **Insert E Update** (as duas caixas): a reivindicação de lead via `registrar_captacao_vendedor` dispara UPDATE — só Insert = reivindicação some da planilha. URL do destino: `<web-app>/exec?secret=<WEBHOOK_SECRET>`.

## Contrato de colunas (aba "Página1", cabeçalho na linha 2, dados a partir da linha 3)
| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| DATA | CANAL | VENDEDOR | LOJA | NOME | CELULAR | E-MAIL | CPF | PLACA | STATUS |

- CANAL = `record.canal` ("Indicação"/"ViaNuvem"). STATUS fica em branco (preenchimento manual do gestor).
- O script escreve **por posição** — se alguém inserir/mover coluna na planilha, tudo desalinha (já aconteceu: coluna CANAL externa deslocou 8 linhas). Mudou a estrutura da planilha → mude o `.gs` junto e confira as 3 planilhas célula a célula.

## Roteamento e fluxo
- `LOJA_PARA_PLANILHA` (mapa normalizado) roteia `record.loja` → planilha 'everton' | 'wesley' | 'william'. Deve ficar em sincronia com `LOJAS_DISPONIVEIS` de `src/lib/loja.ts` ("Campinas Shop Dom Pedro" é a grafia-chave, de propósito).
- **INSERT** → `appendRow` com A–I preenchidas (J em branco).
- **UPDATE** → `encontrarLinhaPorPlaca` varre a coluna I a partir da linha 3 e reescreve B–I **in-place** (não toca DATA nem STATUS). Placa não achada na planilha daquela loja → registra no log de erros, **não** duplica nem move entre planilhas (limitação conhecida: reivindicação por vendedor de loja que roteia pra OUTRA planilha fica só no log).

## Leitura das vendas de seguro
O `doGet` usado pelas rotas gestor-only inclui toda linha com **DATA DA VENDA** preenchida, mesmo
que **STATUS DA VENDA** esteja vazio. Essa data é a fonte de verdade das métricas de transmissões
do dia/mês. O relatório mensal aplica separadamente o filtro `status_venda = "Emitida"` para
calcular seguros fechados.

## Modos de falha (por design)
- O Web App **sempre responde HTTP 200** — o Supabase nunca re-tenta e não vê erro. Toda depuração começa na aba de log de erros (`registrarErro`, na planilha do William).
- `registrarErro` grava **só** timestamp, mensagem e id técnico — nunca dado pessoal (LGPD). Mantenha assim.
- Autenticação = só o `?secret=` na query string (Script Properties → `WEBHOOK_SECRET`). É credencial de produção: fora do código, rotacionar se vazar.

## Reimplantação (mudou o .gs → precisa REPUBLICAR)
Salvar o arquivo não basta: no editor do Apps Script → Implantar → **Gerenciar implantações** → editar a implantação ativa → Nova versão → Implantar (mantém a mesma URL). Só criar "Nova implantação" se quiser URL nova (aí tem que trocar no webhook do Supabase).

## Checklist ao adicionar coluna no fluxo
1. Coluna no schema (`supabase/schema.sql` + bloco de migração) e em `types.ts` — skill `supabase-rls`.
2. Inserir a coluna **nas 3 planilhas** na mesma posição.
3. Atualizar os arrays de INSERT e UPDATE no `.gs` (mesma ordem das colunas) e o `encontrarLinhaPorPlaca` se a coluna da placa mudar de posição.
4. Reimplantar o Apps Script e testar com um lead real (INSERT) e uma reivindicação (UPDATE).
