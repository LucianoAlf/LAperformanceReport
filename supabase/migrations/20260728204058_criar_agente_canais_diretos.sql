-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create table governanca.agente_canais_diretos (
  id          bigint generated always as identity primary key,
  telefone    text not null,
  agente      text not null,
  canal       text not null,
  ativo       boolean not null default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (telefone, agente, canal)
);

alter table governanca.agente_canais_diretos enable row level security;

create function governanca.consultor_permitido(p_telefone text, p_agente text, p_canal text)
returns boolean
language sql stable security definer
set search_path to 'governanca', 'pg_temp'
as $$
  select exists (
    select 1 from governanca.agente_canais_diretos
    where telefone = p_telefone and agente = p_agente and canal = p_canal and ativo = true
  );
$$;

grant usage on schema governanca to mila_acesso_restrito;
grant execute on function governanca.consultor_permitido(text, text, text) to mila_acesso_restrito;

insert into governanca.agente_canais_diretos (telefone, agente, canal) values
  ('5521984690143', 'mila', '147'),
  ('5521964171223', 'mila', '147'),
  ('5521964171223', 'mila', '155'),
  ('5521964171223', 'mila', '148'),
  ('553171422022',  'mila', '155'),
  ('5521990450802', 'mila', '148'),
  ('5521966875271', 'mila', '147'),
  ('5521966875271', 'mila', '155'),
  ('5521966875271', 'mila', '148')
on conflict (telefone, agente, canal) do nothing;
