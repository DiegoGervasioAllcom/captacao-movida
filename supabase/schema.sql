-- =========================================================================
-- Captacao Movida - Schema do banco (Supabase / Postgres)
-- Execute no SQL Editor do Supabase:
--   https://supabase.com/dashboard/project/_/sql/new
--
-- O Supabase e usado APENAS como banco. A autenticacao e do Clerk, via
-- "third-party auth" nativo. As policies leem o token do Clerk:
--   auth.jwt()->>'sub'      = id do usuario no Clerk (vendedor_id)
--   auth.jwt()->>'app_role' = papel da aplicacao (vendedor | gestor)
--
-- ATENCAO: o claim `role` NAO serve para isso -- ele e usado pelo Supabase
-- e vale sempre "authenticated". O papel customizado vive em `app_role`,
-- montado no token do Clerk como "{{user.public_metadata.role}}".
-- =========================================================================

-- Tabela de captacoes (leads).
create table captacoes (
  id uuid primary key default gen_random_uuid(),
  vendedor_id text not null,
  vendedor_nome text,
  nome_cliente text not null,
  telefone text not null,
  placa text not null,
  created_at timestamptz not null default now()
);

-- Indice para acelerar a busca "minhas captacoes" por vendedor.
create index on captacoes (vendedor_id);

-- Habilita Row Level Security (RLS). Sem policy, ninguem acessa.
alter table captacoes enable row level security;

-- O vendedor le apenas as proprias captacoes.
create policy "vendedor le as proprias"
on captacoes
for select
using ( auth.jwt()->>'sub' = vendedor_id );

-- O vendedor insere apenas captacoes vinculadas a si mesmo.
create policy "vendedor insere as proprias"
on captacoes
for insert
with check ( auth.jwt()->>'sub' = vendedor_id );

-- O gestor le TODAS as captacoes.
create policy "gestor le tudo"
on captacoes
for select
using ( (auth.jwt()->>'app_role') = 'gestor' );
