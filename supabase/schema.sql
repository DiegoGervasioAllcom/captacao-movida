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
  -- Telefone do VENDEDOR (publicMetadata.telefone no Clerk, informado no
  -- autocadastro), nao do cliente. Nulo para vendedores cadastrados antes
  -- desse campo existir, ou para a importacao do ViaNuvem.
  vendedor_telefone text,
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
  -- Canal de origem do lead: "Indicacao" (formulario do vendedor) ou
  -- "ViaNuvem" (importacao automatica). Espelhado na coluna CANAL das 3
  -- planilhas do Google Sheets (ver captacoes-to-google-sheets.gs).
  canal text,
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
-- Cadastro de indicacao pelo vendedor (formulario "Nova Indicacao"): usa
-- esta funcao em vez de INSERT direto, porque precisa de uma regra que a
-- RLS sozinha nao da conta - se a placa ja existir na tabela:
--   - vendedor_id = 'vianuvem' (importacao automatica, ninguem "dono"
--     ainda) -> a linha e ATUALIZADA para virar indicacao deste vendedor.
--   - vendedor_id de OUTRO vendedor de verdade -> bloqueia (erro
--     'PLACA_DE_OUTRO_VENDEDOR'), nunca sobrescreve o lead de um colega.
--   - nao existe -> insere normalmente.
-- SECURITY DEFINER e necessario porque, pela RLS normal, o vendedor nem
-- consegue "ver" uma linha que nao e dele (nem pra saber que existe) -
-- por isso o client nao teria como decidir sozinho entre esses 3 casos.
-- O vendedor_id usado e sempre lido do token (auth.jwt()->>'sub') aqui
-- dentro, nunca aceito como parametro do cliente - evita spoofing.
create or replace function registrar_captacao_vendedor(
  p_vendedor_nome text,
  p_vendedor_telefone text,
  p_loja text,
  p_nome_cliente text,
  p_telefone text,
  p_placa text
) returns captacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendedor_id text := auth.jwt()->>'sub';
  v_existente captacoes;
  v_resultado captacoes;
begin
  if v_vendedor_id is null then
    raise exception 'NAO_AUTENTICADO';
  end if;

  select * into v_existente from captacoes where placa = p_placa limit 1;

  if v_existente.id is not null and v_existente.vendedor_id not in ('vianuvem', v_vendedor_id) then
    raise exception 'PLACA_DE_OUTRO_VENDEDOR';
  end if;

  if v_existente.id is not null then
    update captacoes set
      vendedor_id = v_vendedor_id,
      vendedor_nome = p_vendedor_nome,
      vendedor_telefone = p_vendedor_telefone,
      loja = p_loja,
      nome_cliente = p_nome_cliente,
      telefone = p_telefone,
      canal = 'Indicação'
    where id = v_existente.id
    returning * into v_resultado;
  else
    insert into captacoes (
      vendedor_id, vendedor_nome, vendedor_telefone, loja,
      nome_cliente, telefone, placa, canal
    ) values (
      v_vendedor_id, p_vendedor_nome, p_vendedor_telefone, p_loja,
      p_nome_cliente, p_telefone, p_placa, 'Indicação'
    )
    returning * into v_resultado;
  end if;

  return v_resultado;
end;
$$;

grant execute on function registrar_captacao_vendedor to authenticated;

-- =========================================================================
-- Migracao: se a tabela `captacoes` ja existir em producao (dados reais ja
-- rodando), NAO rode o `create table` acima de novo - rode so isto:
--
--   alter table captacoes add column loja text;
--   alter table captacoes add column cpf text;
--   alter table captacoes add column email text;
--   alter table captacoes add column vendedor_telefone text;
--   alter table captacoes add column canal text;
--   create index on captacoes (placa);
--
-- Linhas antigas ficam com loja/cpf/email/vendedor_telefone/canal = null;
-- nao precisa de RLS nova (as policies ja sao por vendedor_id/app_role,
-- independente dessas colunas).
--
-- A funcao `registrar_captacao_vendedor` (e o `grant execute` logo apos)
-- e nova - copie e rode o bloco inteiro dela tambem em producao. E
-- seguro rodar de novo no futuro (`create or replace function`).
-- =========================================================================
