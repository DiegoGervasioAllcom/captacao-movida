---
name: supabase-rls
description: >-
  Como escrever e alterar policies de Row Level Security (RLS) e schema da tabela
  captacoes neste projeto, lendo os claims do token Clerk (sub e app_role). Use ao criar
  tabelas, mexer em supabase/schema.sql, adicionar/alterar policies, índices, ou depurar
  "não consigo ler/inserir" / erros de permissão no Supabase.
---

# RLS e schema (Captação Movida)

A segurança dos dados é a **RLS**. Toda tabela nasce com RLS habilitada e policies explícitas.

## Claims usados nas policies
- `auth.jwt()->>'sub'` → id do usuário no Clerk (= coluna `vendedor_id`).
- `auth.jwt()->>'app_role'` → papel (`vendedor` | `gestor`).
- ⚠️ **Nunca** use `auth.jwt()->>'role'` (é do Supabase, vale `authenticated`).

## Policies atuais de `captacoes`
```sql
alter table captacoes enable row level security;

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

## Regras ao mexer
1. Habilite RLS em qualquer tabela nova: `alter table X enable row level security;` — sem policy, ninguém acessa.
2. `select`/`insert`/`update`/`delete` precisam de policy própria; não existe "insert" sem `with check`.
3. Vincule ownership por `vendedor_id = auth.jwt()->>'sub'`. Acesso amplo só para `app_role = 'gestor'`.
4. SQL idempotente e pronto para colar no SQL Editor do Supabase.
5. Índice em colunas de filtro frequente (já existe `create index on captacoes (vendedor_id)`).
6. Se adicionar coluna, atualize `src/lib/types.ts` (`Captacao`/`NovaCaptacao`).

## Fluxo do lead (não inverter)
INSERT em `captacoes` (fonte da verdade) → **Database Webhook** dispara POST ao destino. O frontend NÃO chama o webhook diretamente.

## Depurando "não consigo ler/inserir"
Quase sempre é: token sem `sub`/`app_role`, policy faltando para a operação, ou uso indevido de `role` no lugar de `app_role`. Cheque também a skill `clerk-supabase-auth`.
