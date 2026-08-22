-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function monitoramento.serie(p_dias int default 7)
returns table (
  agente        text,
  dia           date,
  tokens        bigint,
  teve_problema boolean
)
language sql
security definer
set search_path = monitoramento, pg_catalog
as $$
  select s.agente,
         (s.coletado_em at time zone 'America/Sao_Paulo')::date as dia,
         max(s.tokens_hoje) as tokens,
         bool_or(s.nivel in ('degradado','mudo','desconhecido')) as teve_problema
    from monitoramento.agentes_saude s
   where s.coletado_em >= (now() at time zone 'America/Sao_Paulo')::date
                          - make_interval(days => p_dias - 1)
   group by s.agente, (s.coletado_em at time zone 'America/Sao_Paulo')::date
   order by s.agente, dia;
$$;

create or replace function public.la_os_serie(p_dias int default 7)
returns table (
  agente        text,
  dia           date,
  tokens        bigint,
  teve_problema boolean
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select * from monitoramento.serie(p_dias);
$$;

revoke execute on function monitoramento.serie(int)
  from public, anon, authenticated, service_role;

revoke all on function public.la_os_serie(int)
  from public, anon, authenticated, service_role;

grant execute on function public.la_os_serie(int) to la_os_leitor;
