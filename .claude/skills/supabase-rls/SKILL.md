---
name: supabase-rls
description: >-
  Como escrever e alterar policies de Row Level Security (RLS), funções SECURITY DEFINER
  e o schema da tabela captacoes neste projeto, lendo os claims do token Clerk (sub e
  app_role). Use ao criar tabelas, mexer em supabase/schema.sql, adicionar/alterar
  policies, índices, funções SQL/RPC, ou depurar "não consigo ler/inserir" / erros de
  permissão no Supabase.
---

# RLS e schema (Captação Movida)

A segurança dos dados é a **RLS**. Toda tabela nasce com RLS habilitada e policies explícitas.

## Claims usados nas policies
- `auth.jwt()->>'sub'` → id do usuário no Clerk (= coluna `vendedor_id`).
- `auth.jwt()->>'app_role'` → papel (`vendedor` | `gestor`).
- ⚠️ **Nunca** use `auth.jwt()->>'role'` (é do Supabase, vale `authenticated`).

## Retrato de segurança atual de `captacoes`
Exatamente 3 policies (batem com `supabase/schema.sql`):
```sql
-- vendedor lê só as próprias
create policy "vendedor le as proprias" on captacoes
  for select using ( auth.jwt()->>'sub' = vendedor_id );

-- vendedor insere só vinculadas a si
create policy "vendedor insere as proprias" on captacoes
  for insert with check ( auth.jwt()->>'sub' = vendedor_id );

-- gestor lê tudo
create policy "gestor le tudo" on captacoes
  for select using ( (auth.jwt()->>'app_role') = 'gestor' );
```
**Não há policy de UPDATE/DELETE de propósito.** O único UPDATE permitido acontece dentro da função SECURITY DEFINER `registrar_captacao_vendedor` (abaixo). O job `vianuvem-import` grava com a service_role key (bypassa RLS, fora do app).

## registrar_captacao_vendedor — a única via de gravação da indicação
Regra 10 do CLAUDE.md: o formulário **nunca** faz INSERT direto. Assinatura:
`registrar_captacao_vendedor(p_vendedor_nome, p_vendedor_telefone, p_loja, p_nome_cliente, p_telefone, p_placa) returns captacoes` — `security definer set search_path = public`.
Lógica: lê `v_vendedor_id := auth.jwt()->>'sub'` (null → `raise exception 'NAO_AUTENTICADO'`); busca a placa; se existir com `vendedor_id not in ('vianuvem', v_vendedor_id)` → `raise exception 'PLACA_DE_OUTRO_VENDEDOR'`; se existir (do sentinel `vianuvem` ou do próprio) → **UPDATE** (reivindicação: troca dono e `canal = 'Indicação'`; não toca placa/created_at/cpf/email); senão → INSERT com `canal = 'Indicação'`. Grant: `to authenticated`.

### Padrão SECURITY DEFINER — quando a RLS não dá conta
Use quando a regra exige enxergar linhas de outros donos (a RLS esconde a linha e o client não distingue "não existe" de "não é minha"). Sempre:
1. `set search_path = public` (obrigatório em security definer).
2. Identidade lida de `auth.jwt()->>'sub'` **dentro** da função — nunca como parâmetro (evita spoofing).
3. Erros de negócio via `raise exception 'CODIGO_EM_CAIXA_ALTA'` para o client tratar por regex em `error.message`.
4. Libere só com `grant execute ... to authenticated`.

## Convenções do schema
- Colunas de `captacoes`: id, vendedor_id, vendedor_nome, vendedor_telefone, loja, nome_cliente, telefone, placa, cpf, email, canal, created_at.
- `vendedor_id = 'vianuvem'` = sentinel de lead importado sem dono (único caso reivindicável). `cpf`/`email` só vêm da importação.
- `canal` tem só dois valores: `'Indicação'` (com acento) e `'ViaNuvem'` — as planilhas dependem da grafia.
- **Dois** índices: `(vendedor_id)` ("minhas captações") e `(placa)` (dedupe do import + lookup da função).
- Coluna nova → atualizar `src/lib/types.ts` (`Captacao`/`NovaCaptacao`) e avaliar o `.gs` do Sheets (skill `sheets-webhook`).
- SQL idempotente pronto pro SQL Editor **+ bloco de migração de produção** no fim do `schema.sql` (produção não re-roda o `create table`; roda só os `alter table` e o bloco da função, que é `create or replace` = seguro repetir).

## Fluxo do lead (não inverter)
RPC `registrar_captacao_vendedor` (nunca INSERT direto no formulário) faz INSERT **ou** UPDATE em `captacoes` → Database Webhooks disparam POST aos destinos. O webhook do Google Sheets precisa dos eventos **Insert E Update** (a reivindicação é UPDATE). O frontend NÃO chama webhook.

## Depurando
- "Não consigo ler/inserir": token sem `sub`/`app_role`, policy faltando pra operação, ou `role` no lugar de `app_role`. Cheque a skill `clerk-supabase-auth`.
- Indicação salvou mas a planilha não atualizou (placa veio do ViaNuvem): webhook do Sheets sem o evento Update marcado, ou erro no Apps Script (ele sempre responde 200 — veja a aba de log de erros).
- `PLACA_DE_OUTRO_VENDEDOR` não é bug: é a função protegendo o lead de um colega.
