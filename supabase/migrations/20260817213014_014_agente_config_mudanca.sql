-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Registro de mudanca de config de agente (LA-OS). Ver
-- migrations/014_agente_config_mudanca.sql no repo `fiscal mila` para o
-- cabecalho completo e a secao REVERTER.

create table if not exists monitoramento.agente_config_mudanca (
  id          uuid primary key default gen_random_uuid(),
  quando      timestamptz not null default now(),
  email       text not null,
  agente      text not null,
  perfil      text not null,
  campo       text not null,
  valor_de    text,
  valor_para  text not null
);

-- RLS ligada e SEM policy, de proposito: barra todo acesso direto. Quem
-- grava/le legitimamente passa pelas duas funcoes SECURITY DEFINER abaixo.
-- Mesma convencao de agentes_saude, contatos e hosts_saude.
alter table monitoramento.agente_config_mudanca enable row level security;

create index if not exists agente_config_mudanca_quando_idx
  on monitoramento.agente_config_mudanca (quando desc);

create or replace function public.la_os_registrar_mudanca(
  p_email text, p_agente text, p_perfil text,
  p_campo text, p_de text, p_para text
) returns uuid
language sql security definer set search_path = monitoramento, pg_catalog
as $$
  insert into monitoramento.agente_config_mudanca
    (email, agente, perfil, campo, valor_de, valor_para)
  values (p_email, p_agente, p_perfil, p_campo, p_de, p_para)
  returning id
$$;

create or replace function public.la_os_mudancas(p_limite int default 50)
returns table (quando timestamptz, email text, agente text, perfil text,
               campo text, valor_de text, valor_para text)
language sql stable security definer set search_path = monitoramento, pg_catalog
as $$
  select quando, email, agente, perfil, campo, valor_de, valor_para
  from monitoramento.agente_config_mudanca
  order by quando desc
  limit least(p_limite, 500)
$$;

-- ⚠️ O schema public deste projeto tem ALTER DEFAULT PRIVILEGES dando EXECUTE
-- a anon/authenticated/service_role em TODA funcao nova, e `revoke ... from
-- public` NAO cobre isso. Revoke explicito dos roles.
revoke all on function public.la_os_registrar_mudanca(text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.la_os_mudancas(int) from public, anon, authenticated, service_role;

grant execute on function public.la_os_registrar_mudanca(text, text, text, text, text, text)
  to service_role;
grant execute on function public.la_os_mudancas(int) to la_os_leitor;
