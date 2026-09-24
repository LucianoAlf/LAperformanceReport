-- Cache server-side das RPCs pesadas das paginas Agenda, Administrativo,
-- Alunos e Professores — mesmo padrao do resto do repo (leitor renomeado
-- *_sem_cache_20260924 + wrapper VOLATILE no nome publico).
--
-- Por que: o aquecedor (dashboard_aquecer_caches_v1) so adianta se a RPC
-- guarda o compute em algum lugar. Medido frio como postgres:
--   agenda_dia_v2 ~10,4s | inadimplencia ~9,6s | prof_cadastro ~5,8s
--   financeiro_faturas ~4,8s | kpis_admin ~4,2s | tempo_permanencia >120s
--
-- Funcoes que filtram por usuario internamente (agenda, kpis_admin,
-- prof_cadastro) entram no cache pela lista de unidades visiveis
-- (escopo) — mesmo padrao da get_faturas_alunos_financeiro_v1: mesmo
-- escopo = mesmo payload, cache compartilhado sem vazar entre escopos.
--
-- TTL puro (sem fingerprint de sync): o sync completa ~17 runs/hora e
-- fingerprint-na-chave zerava o hit rate — a janela de frescor e o TTL.

create table if not exists public.paginas_rpc_cache (
  funcao text not null,
  cache_key text not null,
  payload jsonb not null,
  built_at timestamptz not null default now(),
  primary key (funcao, cache_key)
);

revoke all on public.paginas_rpc_cache from public, anon, authenticated;

comment on table public.paginas_rpc_cache is
  'Cache generico das RPCs pesadas de pagina (agenda, alunos, administrativo, professores). Chave = recorte logico (+escopo de unidades quando a funcao filtra por usuario). TTL na funcao wrapper. Criado em 2026-09-24.';

-- Escopo de unidades visiveis do chamador (mesmo recorte das funcoes
-- internas): entra na chave das RPCs que filtram por usuario.
create or replace function public.paginas_rpc_cache_escopo_v1()
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_escopo text;
begin
  select coalesce(string_agg(u.id::text, ',' order by u.id), 'nenhuma')
    into v_escopo
  from public.unidades u
  where u.ativo is true
    and (
      coalesce(auth.role(), '') = 'service_role'
      or public.is_admin()
      or u.id in (select public.get_user_unidade_ids())
    );
  return v_escopo;
end;
$function$;

-- ── Agenda ────────────────────────────────────────────────────────────
alter function public.get_agenda_dia_v2(date, uuid)
  rename to get_agenda_dia_v2_sem_cache_20260924;

create function public.get_agenda_dia_v2(p_data date, p_unidade_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '60s'
as $function$
declare
  v_key text;
  v_cached jsonb;
begin
  -- Guarda minima: bloqueia so PostgREST-anon. Papeis de banco (postgres,
  -- maria_lareport_rpc, sol_acesso_restrito, cron) seguem livres — o guard
  -- fino mora no leitor interno e o escopo ja entra na chave.
  if session_user::text in ('anon', 'authenticated')
     and coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'papel nao autorizado' using errcode = '42501';
  end if;

  v_key := md5(concat_ws('|',
    p_data, coalesce(p_unidade_id::text, 'todas'),
    public.paginas_rpc_cache_escopo_v1()
  ));

  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'agenda_dia_v2' and c.cache_key = v_key
    and c.built_at > now() - interval '5 minutes';
  if v_cached is not null then return v_cached; end if;

  perform pg_advisory_xact_lock(hashtext('paginas|agenda_dia_v2|' || v_key));
  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'agenda_dia_v2' and c.cache_key = v_key
    and c.built_at > now() - interval '5 minutes';
  if v_cached is not null then return v_cached; end if;

  v_cached := public.get_agenda_dia_v2_sem_cache_20260924(p_data, p_unidade_id);

  insert into public.paginas_rpc_cache (funcao, cache_key, payload)
  values ('agenda_dia_v2', v_key, coalesce(v_cached, 'null'::jsonb))
  on conflict (funcao, cache_key) do update
    set payload = excluded.payload, built_at = now();

  return v_cached;
end;
$function$;

-- ── KPIs admin (Administrativo + Alunos) ──────────────────────────────
alter function public.get_kpis_alunos_admin_operacional(uuid, integer, integer)
  rename to kpis_alunos_admin_operacional_sem_cache_20260924;

create function public.get_kpis_alunos_admin_operacional(
  p_unidade_id uuid default null,
  p_ano integer default extract(year from now() at time zone 'America/Sao_Paulo')::integer,
  p_mes integer default extract(month from now() at time zone 'America/Sao_Paulo')::integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '60s'
as $function$
declare
  v_key text;
  v_cached jsonb;
begin
  -- Guarda minima: bloqueia so PostgREST-anon. Papeis de banco (postgres,
  -- maria_lareport_rpc, sol_acesso_restrito, cron) seguem livres — o guard
  -- fino mora no leitor interno e o escopo ja entra na chave.
  if session_user::text in ('anon', 'authenticated')
     and coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'papel nao autorizado' using errcode = '42501';
  end if;

  v_key := md5(concat_ws('|',
    coalesce(p_unidade_id::text, 'consolidado'), p_ano, p_mes,
    (now() at time zone 'America/Sao_Paulo')::date,
    public.paginas_rpc_cache_escopo_v1()
  ));

  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'kpis_admin_operacional' and c.cache_key = v_key
    and c.built_at > now() - interval '15 minutes';
  if v_cached is not null then return v_cached; end if;

  perform pg_advisory_xact_lock(hashtext('paginas|kpis_admin_operacional|' || v_key));
  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'kpis_admin_operacional' and c.cache_key = v_key
    and c.built_at > now() - interval '15 minutes';
  if v_cached is not null then return v_cached; end if;

  v_cached := public.kpis_alunos_admin_operacional_sem_cache_20260924(p_unidade_id, p_ano, p_mes);

  insert into public.paginas_rpc_cache (funcao, cache_key, payload)
  values ('kpis_admin_operacional', v_key, coalesce(v_cached, 'null'::jsonb))
  on conflict (funcao, cache_key) do update
    set payload = excluded.payload, built_at = now();

  return v_cached;
end;
$function$;

-- ── Tempo de permanencia / LTV (Alunos) — o mais caro (>120s) ─────────
alter function public.get_tempo_permanencia(uuid, integer, integer)
  rename to get_tempo_permanencia_sem_cache_20260924;

create function public.get_tempo_permanencia(
  p_unidade_id uuid default null,
  p_ano integer default null,
  p_mes integer default null
)
returns table(unidade_id uuid, unidade_nome text, tempo_permanencia_medio numeric,
              total_evasoes_elegiveis integer, soma_meses integer)
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '300s'
as $function$
declare
  v_key text;
  v_cached jsonb;
begin
  -- Guarda minima: bloqueia so PostgREST-anon. Papeis de banco (postgres,
  -- maria_lareport_rpc, sol_acesso_restrito, cron) seguem livres — o guard
  -- fino mora no leitor interno e o escopo ja entra na chave.
  if session_user::text in ('anon', 'authenticated')
     and coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'papel nao autorizado' using errcode = '42501';
  end if;

  -- Dado historico consolidado por pessoa: muda devagar, TTL de 1h.
  v_key := md5(concat_ws('|',
    coalesce(p_unidade_id::text, 'consolidado'),
    coalesce(p_ano::text, '-'), coalesce(p_mes::text, '-')
  ));

  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'tempo_permanencia' and c.cache_key = v_key
    and c.built_at > now() - interval '1 hour';
  if v_cached is not null then
    return query select * from jsonb_to_recordset(v_cached)
      as t(unidade_id uuid, unidade_nome text, tempo_permanencia_medio numeric,
           total_evasoes_elegiveis integer, soma_meses integer);
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('paginas|tempo_permanencia|' || v_key));
  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'tempo_permanencia' and c.cache_key = v_key
    and c.built_at > now() - interval '1 hour';
  if v_cached is not null then
    return query select * from jsonb_to_recordset(v_cached)
      as t(unidade_id uuid, unidade_nome text, tempo_permanencia_medio numeric,
           total_evasoes_elegiveis integer, soma_meses integer);
    return;
  end if;

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_cached
  from public.get_tempo_permanencia_sem_cache_20260924(p_unidade_id, p_ano, p_mes) r;

  insert into public.paginas_rpc_cache (funcao, cache_key, payload)
  values ('tempo_permanencia', v_key, v_cached)
  on conflict (funcao, cache_key) do update
    set payload = excluded.payload, built_at = now();

  return query select * from jsonb_to_recordset(v_cached)
    as t(unidade_id uuid, unidade_nome text, tempo_permanencia_medio numeric,
         total_evasoes_elegiveis integer, soma_meses integer);
end;
$function$;

-- ── KPIs cadastro de professores (aba Cadastro da pagina Professores) ──
alter function public.get_kpis_professores_cadastro_canonicos_v1(integer, integer, uuid, date, date)
  rename to kpis_prof_cadastro_sem_cache_20260924;

create function public.get_kpis_professores_cadastro_canonicos_v1(
  p_ano integer, p_mes integer,
  p_unidade_id uuid default null,
  p_data_inicio date default null,
  p_data_fim date default null
)
returns table(professor_id integer, unidade_id uuid, carteira_alunos integer,
              total_turmas integer, alunos_via_turmas integer,
              turmas_elegiveis_media integer, media_alunos_turma numeric)
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '60s'
as $function$
declare
  v_key text;
  v_cached jsonb;
begin
  -- Guarda minima: bloqueia so PostgREST-anon. Papeis de banco (postgres,
  -- maria_lareport_rpc, sol_acesso_restrito, cron) seguem livres — o guard
  -- fino mora no leitor interno e o escopo ja entra na chave.
  if session_user::text in ('anon', 'authenticated')
     and coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'papel nao autorizado' using errcode = '42501';
  end if;

  v_key := md5(concat_ws('|',
    p_ano, p_mes, coalesce(p_unidade_id::text, 'consolidado'),
    coalesce(p_data_inicio::text, '-'), coalesce(p_data_fim::text, '-'),
    public.paginas_rpc_cache_escopo_v1()
  ));

  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'kpis_prof_cadastro' and c.cache_key = v_key
    and c.built_at > now() - interval '15 minutes';
  if v_cached is not null then
    return query select * from jsonb_to_recordset(v_cached)
      as t(professor_id integer, unidade_id uuid, carteira_alunos integer,
           total_turmas integer, alunos_via_turmas integer,
           turmas_elegiveis_media integer, media_alunos_turma numeric);
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('paginas|kpis_prof_cadastro|' || v_key));
  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'kpis_prof_cadastro' and c.cache_key = v_key
    and c.built_at > now() - interval '15 minutes';
  if v_cached is not null then
    return query select * from jsonb_to_recordset(v_cached)
      as t(professor_id integer, unidade_id uuid, carteira_alunos integer,
           total_turmas integer, alunos_via_turmas integer,
           turmas_elegiveis_media integer, media_alunos_turma numeric);
    return;
  end if;

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_cached
  from public.kpis_prof_cadastro_sem_cache_20260924(p_ano, p_mes, p_unidade_id, p_data_inicio, p_data_fim) r;

  insert into public.paginas_rpc_cache (funcao, cache_key, payload)
  values ('kpis_prof_cadastro', v_key, v_cached)
  on conflict (funcao, cache_key) do update
    set payload = excluded.payload, built_at = now();

  return query select * from jsonb_to_recordset(v_cached)
    as t(professor_id integer, unidade_id uuid, carteira_alunos integer,
         total_turmas integer, alunos_via_turmas integer,
         turmas_elegiveis_media integer, media_alunos_turma numeric);
end;
$function$;

-- ── Inadimplencia canonica (Administrativo / Alunos) ──────────────────
alter function public.get_inadimplencia_canonica(uuid, date)
  rename to get_inadimplencia_canonica_sem_cache_20260924;

create function public.get_inadimplencia_canonica(
  p_unidade_id uuid default null,
  p_as_of_date date default (now() at time zone 'America/Sao_Paulo')::date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '60s'
as $function$
declare
  v_key text;
  v_cached jsonb;
begin
  -- Guarda minima: bloqueia so PostgREST-anon. Papeis de banco (postgres,
  -- maria_lareport_rpc, sol_acesso_restrito, cron) seguem livres — o guard
  -- fino mora no leitor interno e o escopo ja entra na chave.
  if session_user::text in ('anon', 'authenticated')
     and coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'papel nao autorizado' using errcode = '42501';
  end if;

  v_key := md5(concat_ws('|',
    coalesce(p_unidade_id::text, 'consolidado'), p_as_of_date
  ));

  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'inadimplencia' and c.cache_key = v_key
    and c.built_at > now() - interval '10 minutes';
  if v_cached is not null then return v_cached; end if;

  perform pg_advisory_xact_lock(hashtext('paginas|inadimplencia|' || v_key));
  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'inadimplencia' and c.cache_key = v_key
    and c.built_at > now() - interval '10 minutes';
  if v_cached is not null then return v_cached; end if;

  v_cached := public.get_inadimplencia_canonica_sem_cache_20260924(p_unidade_id, p_as_of_date);

  insert into public.paginas_rpc_cache (funcao, cache_key, payload)
  values ('inadimplencia', v_key, coalesce(v_cached, 'null'::jsonb))
  on conflict (funcao, cache_key) do update
    set payload = excluded.payload, built_at = now();

  return v_cached;
end;
$function$;

-- ── Faturas Emusys (modal Administrativo / Alunos) ────────────────────
alter function public.get_financeiro_faturas_emusys(uuid, integer, integer)
  rename to get_financeiro_faturas_emusys_sem_cache_20260924;

create function public.get_financeiro_faturas_emusys(
  p_unidade_id uuid default null,
  p_ano integer default extract(year from now() at time zone 'America/Sao_Paulo')::integer,
  p_mes integer default extract(month from now() at time zone 'America/Sao_Paulo')::integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '60s'
as $function$
declare
  v_key text;
  v_cached jsonb;
begin
  -- Guarda minima: bloqueia so PostgREST-anon. Papeis de banco (postgres,
  -- maria_lareport_rpc, sol_acesso_restrito, cron) seguem livres — o guard
  -- fino mora no leitor interno e o escopo ja entra na chave.
  if session_user::text in ('anon', 'authenticated')
     and coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'papel nao autorizado' using errcode = '42501';
  end if;

  v_key := md5(concat_ws('|',
    coalesce(p_unidade_id::text, 'consolidado'), p_ano, p_mes
  ));

  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'financeiro_faturas_emusys' and c.cache_key = v_key
    and c.built_at > now() - interval '10 minutes';
  if v_cached is not null then return v_cached; end if;

  perform pg_advisory_xact_lock(hashtext('paginas|financeiro_faturas_emusys|' || v_key));
  select c.payload into v_cached
  from public.paginas_rpc_cache c
  where c.funcao = 'financeiro_faturas_emusys' and c.cache_key = v_key
    and c.built_at > now() - interval '10 minutes';
  if v_cached is not null then return v_cached; end if;

  v_cached := public.get_financeiro_faturas_emusys_sem_cache_20260924(p_unidade_id, p_ano, p_mes);

  insert into public.paginas_rpc_cache (funcao, cache_key, payload)
  values ('financeiro_faturas_emusys', v_key, coalesce(v_cached, 'null'::jsonb))
  on conflict (funcao, cache_key) do update
    set payload = excluded.payload, built_at = now();

  return v_cached;
end;
$function$;

-- Grants: revogar o default PUBLIC e repor exatamente os papeis das
-- originais (inclui sol_acesso_restrito e maria_lareport_rpc).
revoke all on function public.get_agenda_dia_v2(date, uuid) from public, anon;
grant execute on function public.get_agenda_dia_v2(date, uuid) to authenticated, service_role;

revoke all on function public.get_kpis_alunos_admin_operacional(uuid, integer, integer) from public, anon;
grant execute on function public.get_kpis_alunos_admin_operacional(uuid, integer, integer) to authenticated, service_role, sol_acesso_restrito;

revoke all on function public.get_tempo_permanencia(uuid, integer, integer) from public, anon;
grant execute on function public.get_tempo_permanencia(uuid, integer, integer) to authenticated, service_role, maria_lareport_rpc;

revoke all on function public.get_kpis_professores_cadastro_canonicos_v1(integer, integer, uuid, date, date) from public, anon;
grant execute on function public.get_kpis_professores_cadastro_canonicos_v1(integer, integer, uuid, date, date) to authenticated, service_role;

revoke all on function public.get_inadimplencia_canonica(uuid, date) from public, anon;
grant execute on function public.get_inadimplencia_canonica(uuid, date) to authenticated, service_role;

revoke all on function public.get_financeiro_faturas_emusys(uuid, integer, integer) from public, anon;
grant execute on function public.get_financeiro_faturas_emusys(uuid, integer, integer) to authenticated, service_role;

-- Leitores renomeados nao podem ser chamados pela API (so pelo wrapper).
revoke all on function public.get_agenda_dia_v2_sem_cache_20260924(date, uuid) from public, anon, authenticated;
revoke all on function public.kpis_alunos_admin_operacional_sem_cache_20260924(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.get_tempo_permanencia_sem_cache_20260924(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.kpis_prof_cadastro_sem_cache_20260924(integer, integer, uuid, date, date) from public, anon, authenticated;
revoke all on function public.get_inadimplencia_canonica_sem_cache_20260924(uuid, date) from public, anon, authenticated;
revoke all on function public.get_financeiro_faturas_emusys_sem_cache_20260924(uuid, integer, integer) from public, anon, authenticated;
