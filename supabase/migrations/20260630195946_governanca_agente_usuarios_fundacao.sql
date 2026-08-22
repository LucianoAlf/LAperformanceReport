-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Camada de permissão dos agentes — fundação (Fase 1, aditivo)
-- Schema dedicado, fora do public, não exposto à API REST.

create schema if not exists governanca;

create table governanca.agente_usuarios (
  id             bigint generated always as identity primary key,
  telefone       text not null unique,                          -- chave que o agente recebe (só dígitos, com DDI)
  nome           text not null,
  departamento   text not null,                                 -- comercial|financeiro|pedagogico|rh|marketing|administrativo|diretoria
  nivel          text not null default 'colaborador',           -- colaborador|lider|diretoria
  unidade_id     uuid references public.unidades(id),           -- null = todas
  pode_editar    boolean not null default false,
  colaborador_id integer references public.colaboradores(id),   -- vínculo opcional ao cadastro existente
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint agente_usuarios_departamento_chk
    check (departamento in ('comercial','financeiro','pedagogico','rh','marketing','administrativo','diretoria')),
  constraint agente_usuarios_nivel_chk
    check (nivel in ('colaborador','lider','diretoria'))
);

comment on table governanca.agente_usuarios is
  'Fonte única de identidade/papel das pessoas que falam com os agentes IA. Consultada via governanca.quem_eh(). Fase 1: só colaboradores internos.';

-- RLS habilitado sem policies: nega acesso direto de roles normais (anon/authenticated).
-- Acesso de leitura é só via a função SECURITY DEFINER abaixo.
alter table governanca.agente_usuarios enable row level security;

-- updated_at automático
create or replace function governanca.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_agente_usuarios_updated_at
  before update on governanca.agente_usuarios
  for each row execute function governanca.set_updated_at();

-- Identidade: o agente pergunta "quem é este telefone?" e recebe o crachá (ou nada).
-- SECURITY DEFINER + search_path fixo: o role do agente recebe só EXECUTE,
-- NÃO precisa (nem deve ter) SELECT direto na tabela. Pergunta, não navega.
create function governanca.quem_eh(p_telefone text)
returns table (nome text, departamento text, nivel text,
               unidade_id uuid, pode_editar boolean)
language sql
stable
security definer
set search_path = governanca, pg_temp
as $$
  select nome, departamento, nivel, unidade_id, pode_editar
  from governanca.agente_usuarios
  where telefone = p_telefone and ativo = true;
$$;

comment on function governanca.quem_eh(text) is
  'Retorna o crachá da pessoa pelo telefone (ativo=true). Zero linhas = desconhecido. Camada de IDENTIDADE, não de contenção.';
