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
  -- Loja do vendedor no momento da captacao (publicMetadata.loja no Clerk,
  -- definida por um admin - o vendedor nao escolhe). Nula se o admin ainda
  -- nao configurou a loja daquele vendedor.
  loja text,
  nome_cliente text not null,
  telefone text not null,
  placa text not null,
  -- CPF e e-mail: vem da importacao automatica do ViaNuvem/Unico Auto
  -- (vendedor_id = 'vianuvem'), nao do formulario de captacao. Nulos para
  -- captacoes feitas por um vendedor.
  cpf text,
  email text,
  created_at timestamptz not null default now()
);

-- Indice para acelerar a busca "minhas captacoes" por vendedor.
create index on captacoes (vendedor_id);

-- Indice para o job de importacao do ViaNuvem checar rapido se uma placa
-- ja foi capturada antes (por qualquer origem), evitando lead duplicado.
create index on captacoes (placa);

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

-- =========================================================================
-- Migracao: se a tabela `captacoes` ja existir em producao (dados reais ja
-- rodando), NAO rode o `create table` acima de novo - rode so isto:
--
--   alter table captacoes add column loja text;
--   alter table captacoes add column cpf text;
--   alter table captacoes add column email text;
--   create index on captacoes (placa);
--
-- Linhas antigas ficam com loja/cpf/email = null; nao precisa de RLS nova
-- (as policies ja sao por vendedor_id/app_role, independente dessas colunas).
-- =========================================================================
