-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function monitoramento.eventos(
  p_desde  timestamptz default now() - interval '7 days',
  p_limite int         default 50
)
returns table (
  quando      timestamptz,
  agente      text,
  host        text,
  nivel       text,
  nivel_antes text,
  motivo      text
)
language sql
security definer
set search_path = monitoramento, pg_catalog
as $$
  with ordenado as (
    select s.coletado_em, s.agente, s.host, s.nivel, s.motivo,
           lag(s.nivel)       over (partition by s.agente order by s.coletado_em) as antes,
           lag(s.coletado_em) over (partition by s.agente order by s.coletado_em) as antes_em
      from monitoramento.agentes_saude s
     where s.coletado_em >= p_desde
  )
  select o.coletado_em, o.agente, o.host, o.nivel, o.antes, o.motivo
    from ordenado o
   where o.antes_em is not null
     and o.antes is distinct from o.nivel
   order by o.coletado_em desc
   limit p_limite;
$$;

create or replace function public.la_os_eventos(
  p_desde  timestamptz default now() - interval '7 days',
  p_limite int         default 50
)
returns table (
  quando      timestamptz,
  agente      text,
  host        text,
  nivel       text,
  nivel_antes text,
  motivo      text
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select * from monitoramento.eventos(p_desde, p_limite);
$$;

revoke execute on function monitoramento.eventos(timestamptz, int)
  from public, anon, authenticated, service_role;

revoke all on function public.la_os_eventos(timestamptz, int)
  from public, anon, authenticated, service_role;

grant execute on function public.la_os_eventos(timestamptz, int) to la_os_leitor;
