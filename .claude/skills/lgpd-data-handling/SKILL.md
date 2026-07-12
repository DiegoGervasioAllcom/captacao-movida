---
name: lgpd-data-handling
description: >-
  Princípios de tratamento de dados pessoais (LGPD) deste projeto: dados do cliente
  (nome, telefone, placa — e CPF/e-mail nas captações importadas do ViaNuvem), dados do
  próprio vendedor (autocadastro), minimização, finalidade por origem, controle de acesso
  por RLS, compartilhamento (webhook CRM + Google Sheets + CSV), logs e retenção. Use ao
  adicionar/expor/exportar/logar dados pessoais, novos campos, novos destinos de dados,
  ou ao tratar de privacidade/retenção/LGPD.
---

# Tratamento de dados pessoais (LGPD)

Documento de referência: `LGPD.md` (raiz) — seções 2 (inventário), 4.1, 4.2, 7, 8 e 9. Também: `vianuvem-import/README.md` (seção LGPD) e os comentários do `captacoes-to-google-sheets.gs`.

## Inventário (3 categorias, bases legais distintas)
1. **Cliente via formulário:** nome, telefone, placa.
2. **Cliente via importação ViaNuvem** (`vendedor_id = "vianuvem"`, `canal = "ViaNuvem"`): nome, telefone, placa **+ CPF e e-mail**. Titular nunca interagiu com o sistema; base legal = legítimo interesse (art. 7º, IX), LIA pendente — regime próprio (seção 4.1). Visível só ao gestor pela RLS até ser reivindicado.
3. **Vendedor (colaborador — autocadastro):** nome, e-mail e senha sob custódia do Clerk; telefone/loja em `publicMetadata`; `vendedor_telefone` espelhado em `captacoes`. Base legal = relação de trabalho/parceria.

Metadados: `canal` ("Indicação"/"ViaNuvem"), `loja` (roteia a planilha), `created_at`.

## Princípios a aplicar em toda mudança
1. **Minimização:** só colete o necessário à finalidade. Campo "bom de ter" → questione. (CPF hoje só alimenta a planilha gerencial; o dedupe é por placa.)
2. **Finalidade/base legal POR ORIGEM:** formulário ≠ ViaNuvem ≠ colaborador. Se a finalidade mudar, atualize `LGPD.md` junto com o código.
3. **Controle de acesso (RLS):** vendedor vê os próprios; gestor vê tudo; leads `vianuvem` só o gestor. A **reivindicação** (`registrar_captacao_vendedor`, seção 4.2) muda a visibilidade para "aquele vendedor + gestor" — trate como mudança de controle de acesso; nunca sobrescreve lead de outro vendedor real.
4. **Compartilhamento — dois destinos do Database Webhook:** (a) CRM principal; (b) Google Sheets via Apps Script (3 planilhas roteadas por `loja`, eventos Insert **e** Update). Planilhas **sem RLS**: compartilhamento deve espelhar a lista de gestores. Web App protegido só por `?secret=` (credencial de produção, fora do código; rotacionar se vazar); sempre responde HTTP 200 (sem confirmação de entrega). CSV: só gestor. Destino novo → registrar em `LGPD.md` seção 7 (art. 37).
5. **Logs:** nunca nome, telefone, CPF ou e-mail em texto puro — vale pro job `vianuvem-import` e pro log de erros do Apps Script (que grava só timestamp/mensagem/id técnico). Placa em log só mascarada (`mascararPlaca`, `vianuvem-import/lib/normalizar.mjs`).
6. **Retenção:** expurgo deve alcançar TODAS as cópias (Supabase + 3 planilhas — eliminar só no banco não atende o art. 18, IV). Leads `vianuvem` = retenção conservadora com revisão manual; CPF = prazo igual ou mais curto que os demais campos.

## Quando esta skill é gatilho de revisão
Novo campo pessoal, nova exibição/exportação, novo destino de envio, mudança em quem acessa o quê (inclusive reivindicação), ou qualquer log que possa conter dado de titular → parecer (✅/⚠️/❌) com correção. Para revisão formal, use o agente `lgpd-reviewer`.
