-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create table if not exists monitoramento.hosts_saude (
  id             uuid primary key default gen_random_uuid(),
  ciclo_id       uuid        not null,
  coletado_em    timestamptz not null default now(),
  host           text        not null,
  papel          text,
  provedor       text,
  nivel          text        not null,
  motivo         text,
  cpu_pct        numeric,
  ram_pct        numeric,
  disco_pct      numeric,
  uptime_s       bigint,
  load_1         numeric,
  servicos       jsonb,
  servicos_ok    int,
  servicos_total int,
  bruto          jsonb,
  unique (ciclo_id, host)
);

create index if not exists hosts_saude_host_em
  on monitoramento.hosts_saude (host, coletado_em desc);

alter table monitoramento.hosts_saude enable row level security;

create or replace function monitoramento.registrar_host(
  p_ciclo uuid,
  p_host  jsonb
) returns int
language plpgsql
security definer
set search_path = monitoramento, pg_catalog
as $$
declare
  v_nome       text := p_host ->> 'host';
  v_nivel      text := p_host ->> 'nivel';
  v_assinatura text;
  v_ultimo     timestamptz;
  v_ult_niv    text;
  v_ult_assin  text;
begin
  insert into monitoramento.contatos (host, ultimo_contato)
  values (v_nome, now())
  on conflict (host) do update set ultimo_contato = excluded.ultimo_contato;

  select coalesce(string_agg((s ->> 'nome') || '=' || (s ->> 'ok'), ',' order by s ->> 'nome'), '')
    into v_assinatura
    from jsonb_array_elements(coalesce(p_host -> 'servicos', '[]'::jsonb)) s;

  select coletado_em, nivel,
         coalesce((select string_agg((x ->> 'nome') || '=' || (x ->> 'ok'), ',' order by x ->> 'nome')
                     from jsonb_array_elements(coalesce(servicos, '[]'::jsonb)) x), '')
    into v_ultimo, v_ult_niv, v_ult_assin
    from monitoramento.hosts_saude
   where host = v_nome
   order by coletado_em desc
   limit 1;

  if v_ultimo is null
     or v_ult_niv is distinct from v_nivel
     or v_ult_assin is distinct from v_assinatura
     or v_ultimo < now() - interval '1 hour'
  then
    insert into monitoramento.hosts_saude (
      ciclo_id, host, papel, provedor, nivel, motivo,
      cpu_pct, ram_pct, disco_pct, uptime_s, load_1,
      servicos, servicos_ok, servicos_total, bruto
    ) values (
      p_ciclo, v_nome, p_host ->> 'papel', p_host ->> 'provedor', v_nivel, p_host ->> 'motivo',
      (p_host ->> 'cpu_pct')::numeric,
      (p_host ->> 'ram_pct')::numeric,
      (p_host ->> 'disco_pct')::numeric,
      (p_host ->> 'uptime_s')::bigint,
      (p_host ->> 'load_1')::numeric,
      p_host -> 'servicos',
      (p_host ->> 'servicos_ok')::int,
      (p_host ->> 'servicos_total')::int,
      p_host -> 'bruto'
    )
    on conflict (ciclo_id, host) do nothing;
    return 1;
  end if;

  return 0;
end
$$;

create or replace function monitoramento.hosts_atual()
returns table (
  host text, papel text, provedor text, nivel text, motivo text,
  cpu_pct numeric, ram_pct numeric, disco_pct numeric,
  uptime_s bigint, load_1 numeric,
  servicos jsonb, servicos_ok int, servicos_total int,
  coletado_em timestamptz, ha_segundos int
)
language sql
security definer
set search_path = monitoramento, pg_catalog
as $$
  select distinct on (h.host)
         h.host, h.papel, h.provedor, h.nivel, h.motivo,
         h.cpu_pct, h.ram_pct, h.disco_pct, h.uptime_s, h.load_1,
         h.servicos, h.servicos_ok, h.servicos_total, h.coletado_em,
         extract(epoch from (now() - h.coletado_em))::int
    from monitoramento.hosts_saude h
   order by h.host, h.coletado_em desc;
$$;

create or replace function public.la_os_hosts()
returns table (
  host text, papel text, provedor text, nivel text, motivo text,
  cpu_pct numeric, ram_pct numeric, disco_pct numeric,
  uptime_s bigint, load_1 numeric,
  servicos jsonb, servicos_ok int, servicos_total int,
  coletado_em timestamptz, ha_segundos int
)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select * from monitoramento.hosts_atual();
$$;

create or replace function public.la_os_registrar_host(
  p_ciclo uuid,
  p_host  jsonb
) returns int
language sql
security definer
set search_path = public, pg_catalog
as $$
  select monitoramento.registrar_host(p_ciclo, p_host);
$$;

revoke execute on function monitoramento.registrar_host(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function monitoramento.hosts_atual()
  from public, anon, authenticated, service_role;
revoke all on function public.la_os_registrar_host(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.la_os_hosts()
  from public, anon, authenticated, service_role;

grant execute on function public.la_os_registrar_host(uuid, jsonb) to monitor_coletor;
grant execute on function public.la_os_hosts() to la_os_leitor;
