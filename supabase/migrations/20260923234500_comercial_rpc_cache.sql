-- 23/09/2026 — Dashboard abre 24 RPCs pesadas em paralelo: 12x
-- get_kpis_comercial_canonicos_v2 (uma por mes) + 12x
-- get_conciliacao_experimentais_v2. Sob carga elas competem entre si e
-- morrem em 57014. Mesmo padrao de 20260923233000: nome publico vira
-- wrapper VOLATILE com cache jsonb, fingerprint leve e single-flight por
-- advisory lock — a rajada fria computa 1x por chave; as demais esperam o
-- lock e releem o cache.
--
-- Fingerprint: pg_stat_user_tables (n_tup_ins+upd+del, custo ~zero) nas
-- mesas quentes de sync (aulas_emusys 67k, aluno_presenca 61k,
-- emusys_experimentais_raw 253k) + count/max(updated_at) nas demais.
-- pg_stat so' zera em reset de stats — nesse caso o fingerprint MUDA e o
-- cache simplesmente invalida (direcao segura).
--
-- A chave inclui a data corrente (America/Sao_Paulo): mes vigente tem
-- dia-corte movel; cache nunca atravessa meia-noite.
--
-- get_conciliacao_experimentais_v2 resolve auth por dentro: o bloco de
-- autorizacao e' copiado VERBATIM para o wrapper e roda ANTES do cache —
-- cache nunca pula autenticacao/escopo (padrao dash_prof_resumo_cache).

-- ============ get_kpis_comercial_canonicos_v2 ============

alter function public.get_kpis_comercial_canonicos_v2(uuid, integer, integer, text, date)
  rename to kpis_comercial_v2_sem_cache_20260923;

create table if not exists public.kpis_comercial_v2_cache (
  cache_key text primary key,
  payload jsonb not null,
  built_at timestamptz not null default now()
);

comment on table public.kpis_comercial_v2_cache is
  'Cache de get_kpis_comercial_canonicos_v2 (jsonb). Chave = md5(params+dia+fingerprint das fontes). TTL 30min. Lido/escrito apenas via SECURITY DEFINER.';

revoke all on table public.kpis_comercial_v2_cache from public, anon, authenticated;

create or replace function public.get_kpis_comercial_canonicos_v2(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodo text default 'mensal'::text,
  p_data date default null::date
)
 returns jsonb
 language plpgsql
 VOLATILE
 SECURITY DEFINER
 set search_path to 'public', 'pg_temp'
 set statement_timeout to '35s'
as $function$
declare
  v_fingerprint text;
  v_key text;
  v_cached jsonb;
begin
  select concat_ws(':',
      (select n_tup_ins + n_tup_upd + n_tup_del from pg_stat_user_tables
        where schemaname='public' and relname='aulas_emusys'),
      (select n_tup_ins + n_tup_upd + n_tup_del from pg_stat_user_tables
        where schemaname='public' and relname='aluno_presenca'),
      (select count(*) from public.leads),
      (select coalesce(max(updated_at)::text, 'vazio') from public.leads),
      (select count(*) from public.lead_experimentais),
      (select coalesce(max(updated_at)::text, 'vazio') from public.lead_experimentais),
      (select count(*) from public.alunos),
      (select coalesce(max(updated_at)::text, 'vazio') from public.alunos),
      (select count(*) from public.visitas),
      (select coalesce(max(updated_at)::text, 'vazio') from public.visitas),
      (select count(*) from public.unidades),
      (select count(*) from public.canais_origem),
      (select count(*) from public.cursos),
      (select coalesce(max(updated_at)::text, 'vazio') from public.cursos),
      (select count(*) from public.tipos_matricula)
    ) into v_fingerprint;

  v_key := md5(concat_ws('|',
    coalesce(p_unidade_id::text, 'consolidado'),
    coalesce(p_ano::text, 'null'),
    coalesce(p_mes::text, 'null'),
    coalesce(p_periodo, 'null'),
    coalesce(p_data::text, 'null'),
    (now() at time zone 'America/Sao_Paulo')::date,
    v_fingerprint
  ));

  select c.payload into v_cached
  from public.kpis_comercial_v2_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '30 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select c.payload into v_cached
  from public.kpis_comercial_v2_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '30 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  -- Leitor pode devolver NULL (mes sem dados): jsonb 'null' preserva o contrato.
  v_cached := coalesce(
    public.kpis_comercial_v2_sem_cache_20260923(
      p_unidade_id, p_ano, p_mes, p_periodo, p_data
    ),
    'null'::jsonb
  );

  insert into public.kpis_comercial_v2_cache (cache_key, payload)
  values (v_key, v_cached)
  on conflict (cache_key) do update
    set payload = excluded.payload,
        built_at = now();

  delete from public.kpis_comercial_v2_cache
  where built_at < now() - interval '1 day';

  return v_cached;
end;
$function$;

revoke all on function public.get_kpis_comercial_canonicos_v2(uuid, integer, integer, text, date) from public, anon;
grant execute on function public.get_kpis_comercial_canonicos_v2(uuid, integer, integer, text, date) to authenticated, service_role;
revoke all on function public.kpis_comercial_v2_sem_cache_20260923(uuid, integer, integer, text, date) from public, anon, authenticated;

-- ============ get_conciliacao_experimentais_v2 ============

alter function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date)
  rename to conciliacao_experimentais_v2_sem_cache_20260923;

create table if not exists public.conciliacao_experimentais_v2_cache (
  cache_key text primary key,
  payload jsonb not null,
  built_at timestamptz not null default now()
);

comment on table public.conciliacao_experimentais_v2_cache is
  'Cache de get_conciliacao_experimentais_v2 (jsonb). Chave = md5(params+dia+fingerprint das fontes). TTL 30min. Auth resolvida antes do cache. Lido/escrito apenas via SECURITY DEFINER.';

revoke all on table public.conciliacao_experimentais_v2_cache from public, anon, authenticated;

create or replace function public.get_conciliacao_experimentais_v2(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_periodo text default 'mensal'::text,
  p_data date default null::date
)
 returns jsonb
 language plpgsql
 VOLATILE
 SECURITY DEFINER
 set search_path to 'public', 'pg_temp'
 set statement_timeout to '35s'
as $function$
declare
  v_usuario_id integer;
  v_perfil text;
  v_unidade_usuario uuid;
  v_fingerprint text;
  v_key text;
  v_cached jsonb;
begin
  -- Bloco de autorizacao copiado VERBATIM do original — roda antes do cache.
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user <> 'postgres' then
    select u.id, u.perfil, u.unidade_id
      into v_usuario_id, v_perfil, v_unidade_usuario
    from public.usuarios u
    where u.auth_user_id = auth.uid()
      and coalesce(u.ativo, true)
    limit 1;

    if v_usuario_id is null then
      raise exception 'Acesso negado: usuario sem cadastro ativo'
        using errcode = '42501';
    end if;

    if v_perfil = 'admin' then
      if not public.usuario_tem_permissao(
        v_usuario_id,
        'comercial.ver',
        p_unidade_id
      ) then
        raise exception 'Acesso negado: sem permissao para o comercial'
          using errcode = '42501';
      end if;
    elsif v_perfil = 'unidade' then
      if p_unidade_id is null
         or v_unidade_usuario is null
         or p_unidade_id <> v_unidade_usuario then
        raise exception 'Acesso negado: unidade fora do escopo do usuario'
          using errcode = '42501';
      end if;
    else
      if p_unidade_id is null
         or v_unidade_usuario is null
         or p_unidade_id <> v_unidade_usuario
         or not public.usuario_tem_permissao(
           v_usuario_id,
           'comercial.ver',
           v_unidade_usuario
         ) then
        raise exception 'Acesso negado: unidade fora do escopo do usuario'
          using errcode = '42501';
      end if;
    end if;
  end if;

  select concat_ws(':',
      (select n_tup_ins + n_tup_upd + n_tup_del from pg_stat_user_tables
        where schemaname='public' and relname='aulas_emusys'),
      (select n_tup_ins + n_tup_upd + n_tup_del from pg_stat_user_tables
        where schemaname='public' and relname='aluno_presenca'),
      (select n_tup_ins + n_tup_upd + n_tup_del from pg_stat_user_tables
        where schemaname='public' and relname='emusys_experimentais_raw'),
      (select count(*) from public.leads),
      (select coalesce(max(updated_at)::text, 'vazio') from public.leads),
      (select count(*) from public.lead_experimentais),
      (select coalesce(max(updated_at)::text, 'vazio') from public.lead_experimentais),
      (select count(*) from public.lead_experimentais_decisoes_humanas),
      (select coalesce(max(updated_at)::text, 'vazio') from public.lead_experimentais_decisoes_humanas),
      (select count(*) from public.alunos),
      (select coalesce(max(updated_at)::text, 'vazio') from public.alunos),
      (select count(*) from public.professores),
      (select coalesce(max(updated_at)::text, 'vazio') from public.professores),
      (select count(*) from public.unidades),
      (select count(*) from public.cursos),
      (select count(*) from public.tipos_matricula)
    ) into v_fingerprint;

  v_key := md5(concat_ws('|',
    coalesce(p_unidade_id::text, 'consolidado'),
    coalesce(p_ano::text, 'null'),
    coalesce(p_mes::text, 'null'),
    coalesce(p_periodo, 'null'),
    coalesce(p_data::text, 'null'),
    (now() at time zone 'America/Sao_Paulo')::date,
    v_fingerprint
  ));

  select c.payload into v_cached
  from public.conciliacao_experimentais_v2_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '30 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));

  select c.payload into v_cached
  from public.conciliacao_experimentais_v2_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '30 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  -- Leitor pode devolver NULL (mes sem dados): jsonb 'null' preserva o contrato.
  v_cached := coalesce(
    public.conciliacao_experimentais_v2_sem_cache_20260923(
      p_unidade_id, p_ano, p_mes, p_periodo, p_data
    ),
    'null'::jsonb
  );

  insert into public.conciliacao_experimentais_v2_cache (cache_key, payload)
  values (v_key, v_cached)
  on conflict (cache_key) do update
    set payload = excluded.payload,
        built_at = now();

  delete from public.conciliacao_experimentais_v2_cache
  where built_at < now() - interval '1 day';

  return v_cached;
end;
$function$;

revoke all on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date) from public, anon;
grant execute on function public.get_conciliacao_experimentais_v2(uuid, integer, integer, text, date) to authenticated, service_role;
revoke all on function public.conciliacao_experimentais_v2_sem_cache_20260923(uuid, integer, integer, text, date) from public, anon, authenticated;
alter function public.conciliacao_experimentais_v2_sem_cache_20260923(uuid, integer, integer, text, date)
  set statement_timeout = '30s';

do $pos$
declare
  v_falhas text[] := '{}';
begin
  if not exists (select 1 from pg_proc where proname = 'kpis_comercial_v2_sem_cache_20260923') then
    v_falhas := v_falhas || 'leitor comercial interno ausente';
  end if;
  if not exists (select 1 from pg_proc where proname = 'conciliacao_experimentais_v2_sem_cache_20260923') then
    v_falhas := v_falhas || 'leitor conciliacao interno ausente';
  end if;
  if exists (select 1 from pg_proc where proname = 'get_kpis_comercial_canonicos_v2' and provolatile <> 'v') then
    v_falhas := v_falhas || 'wrapper comercial precisa ser VOLATILE';
  end if;
  if exists (select 1 from pg_proc where proname = 'get_conciliacao_experimentais_v2' and provolatile <> 'v') then
    v_falhas := v_falhas || 'wrapper conciliacao precisa ser VOLATILE';
  end if;
  if has_function_privilege('anon', 'get_kpis_comercial_canonicos_v2(uuid,integer,integer,text,date)', 'EXECUTE') then
    v_falhas := v_falhas || 'wrapper comercial executavel por anon';
  end if;
  if has_function_privilege('anon', 'get_conciliacao_experimentais_v2(uuid,integer,integer,text,date)', 'EXECUTE') then
    v_falhas := v_falhas || 'wrapper conciliacao executavel por anon';
  end if;
  if not has_function_privilege('authenticated', 'get_kpis_comercial_canonicos_v2(uuid,integer,integer,text,date)', 'EXECUTE') then
    v_falhas := v_falhas || 'wrapper comercial sem grant authenticated';
  end if;
  if not has_function_privilege('authenticated', 'get_conciliacao_experimentais_v2(uuid,integer,integer,text,date)', 'EXECUTE') then
    v_falhas := v_falhas || 'wrapper conciliacao sem grant authenticated';
  end if;
  if has_table_privilege('anon', 'public.kpis_comercial_v2_cache', 'SELECT') then
    v_falhas := v_falhas || 'cache comercial legivel por anon';
  end if;
  if has_table_privilege('anon', 'public.conciliacao_experimentais_v2_cache', 'SELECT') then
    v_falhas := v_falhas || 'cache conciliacao legivel por anon';
  end if;
  if array_length(v_falhas, 1) > 0 then
    raise exception E'POS-CONDICAO cache comercial NAO FECHOU:\n  %',
      array_to_string(v_falhas, E'\n  ');
  end if;
  raise notice 'caches comercial/conciliacao ok';
end $pos$;
